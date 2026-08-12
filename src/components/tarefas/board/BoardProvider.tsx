'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { toast } from 'sonner';
import { useRealtimeChannel } from '@/lib/hooks/useRealtimeChannel';
import {
  TASK_SECTORS,
  TASK_STAGES,
  taskMoveDirection,
  taskStageSector,
  type TaskBoard,
  type TaskBoardMember,
  type TaskCard,
  type TaskMoveDirection,
  type TaskSector,
  type TaskStage,
} from '@/types/tasks';
import { getBoardSnapshotAction, moveTaskAction } from '@/app/tarefas/_actions/tasks';

/**
 * Chave de coluna. As 9 etapas usam o próprio nome; a faixa de avulsas usa um
 * prefixo porque um card sem etapa mora numa coluna por SETOR, não por etapa.
 */
export type ColumnKey = TaskStage | `avulsa:${TaskSector}`;

export const AVULSA_PREFIX = 'avulsa:';

export function avulsaKey(sector: TaskSector): ColumnKey {
  return `${AVULSA_PREFIX}${sector}` as ColumnKey;
}

export function isAvulsaKey(key: ColumnKey): boolean {
  return key.startsWith(AVULSA_PREFIX);
}

export function columnSector(key: ColumnKey): TaskSector | null {
  if (isAvulsaKey(key)) return key.slice(AVULSA_PREFIX.length) as TaskSector;
  return taskStageSector(key as TaskStage);
}

export function columnStage(key: ColumnKey): TaskStage | null {
  return isAvulsaKey(key) ? null : (key as TaskStage);
}

/** Ordem dos ids por coluna — a estrutura que o `move()` do dnd-kit manipula. */
export type ColumnMap = Record<string, string[]>;

interface BoardFilters {
  /** `null` = a esteira inteira; um setor realça as colunas dele. */
  sector: TaskSector | null;
  onlyMine: boolean;
  search: string;
  showTerminal: boolean;
}

interface BoardContextValue {
  cards: Record<string, TaskCard>;
  columns: ColumnMap;
  /** Atualiza a ordem e DEVOLVE o resultado, já legível no mesmo evento. */
  applyColumns: (updater: (prev: ColumnMap) => ColumnMap) => ColumnMap;
  members: TaskBoardMember[];
  viewerId: string;
  viewerSector: TaskSector | null;

  filters: BoardFilters;
  setFilters: (patch: Partial<BoardFilters>) => void;
  /** Um card passa pelos filtros? Filtro esmaece, não esconde. */
  matchesFilters: (card: TaskCard) => boolean;
  /** Quantos cards da coluna casam com o filtro atual. */
  matchCount: (key: ColumnKey) => number;
  filtersActive: boolean;

  /** Direção do último pouso de cada card — dispara o flash e some. */
  landing: Record<string, TaskMoveDirection>;
  /** Cards que acabaram de chegar pelo Realtime — animam a entrada. */
  entering: Set<string>;

  beginDrag: () => void;
  /**
   * Persiste o que o arrasto já mostrou na tela. `arrangement` é o mapa de
   * colunas JÁ reordenado — passado explicitamente porque o estado do React
   * ainda não recomeçou o render quando o `dragend` dispara.
   */
  commitMove: (
    taskId: string,
    toColumn: ColumnKey,
    arrangement: ColumnMap,
    note?: string,
  ) => Promise<void>;
  cancelDrag: () => void;
  patchCard: (taskId: string, patch: Partial<TaskCard>) => void;
  /** Recarrega a esteira do servidor (criação de card, queda do Realtime). */
  reloadBoard: () => Promise<void>;
}

const BoardContext = createContext<BoardContextValue | null>(null);

export function useBoard(): BoardContextValue {
  const ctx = useContext(BoardContext);
  if (!ctx) throw new Error('useBoard precisa estar dentro de <BoardProvider>.');
  return ctx;
}

interface BoardProviderProps {
  initialBoard: TaskBoard;
  members: TaskBoardMember[];
  viewerId: string;
  viewerSector: TaskSector | null;
  orgId: string;
  /** Nome do projeto por budget_id — para nomear cards que chegam pelo Realtime. */
  budgetNames: Record<string, string>;
  children: ReactNode;
}

interface TaskDbPayload {
  id: string;
  org_id: string;
  title: string;
  description: string | null;
  client_name: string | null;
  stage: string | null;
  sector: string;
  position: number | string;
  assigned_to: string | null;
  blocked_reason: string | null;
  due_date: string | null;
  budget_id: string | null;
  work_id: string | null;
  created_by: string;
  last_activity_at: string;
  created_at: string;
  updated_at: string;
}

function buildInitialState(board: TaskBoard): { cards: Record<string, TaskCard>; columns: ColumnMap } {
  const cards: Record<string, TaskCard> = {};
  const columns: ColumnMap = {};

  for (const column of board.columns) {
    columns[column.stage] = column.cards.map((card) => {
      cards[card.id] = card;
      return card.id;
    });
  }

  for (const sector of TASK_SECTORS) {
    columns[avulsaKey(sector)] = (board.avulsas[sector] ?? []).map((card) => {
      cards[card.id] = card;
      return card.id;
    });
  }

  return { cards, columns };
}

export function BoardProvider({
  initialBoard,
  members,
  viewerId,
  viewerSector,
  orgId,
  budgetNames,
  children,
}: BoardProviderProps) {
  const initial = useMemo(() => buildInitialState(initialBoard), [initialBoard]);

  const [cards, setCardsState] = useState<Record<string, TaskCard>>(initial.cards);
  const [columns, setColumnsState] = useState<ColumnMap>(initial.columns);
  const [landing, setLanding] = useState<Record<string, TaskMoveDirection>>({});
  const [entering, setEntering] = useState<Set<string>>(() => new Set());

  const [filters, setFiltersState] = useState<BoardFilters>({
    // Abre realçando o setor de quem entrou: é a fila dele que importa primeiro.
    sector: viewerSector,
    onlyMine: false,
    search: '',
    showTerminal: false,
  });

  /**
   * Espelhos SÍNCRONOS de `cards` e `columns`.
   *
   * O `dragend` do dnd-kit dispara no mesmo tique do último `dragover`, antes de
   * o React recomeçar o render — ler `columns` do closure ali devolveria o
   * arranjo de ANTES do arrasto, e a posição gravada sairia calculada sobre os
   * vizinhos errados. Era isso que fazia o card pular de lugar segundos depois
   * de soltar, quando o eco do Realtime chegava com a posição real.
   *
   * As escritas acontecem só dentro de manipuladores de evento e callbacks —
   * nunca durante o render.
   */
  const cardsRef = useRef(initial.cards);
  const columnsRef = useRef(initial.columns);

  const applyCards = useCallback(
    (updater: (prev: Record<string, TaskCard>) => Record<string, TaskCard>) => {
      const next = updater(cardsRef.current);
      cardsRef.current = next;
      setCardsState(next);
      return next;
    },
    [],
  );

  const applyColumns = useCallback((updater: (prev: ColumnMap) => ColumnMap) => {
    const next = updater(columnsRef.current);
    columnsRef.current = next;
    setColumnsState(next);
    return next;
  }, []);

  // Snapshot tirado no início do arrasto — é para cá que a tela volta se o
  // servidor recusar ou o usuário cancelar.
  const snapshotRef = useRef<{ cards: Record<string, TaskCard>; columns: ColumnMap } | null>(null);

  // Ids cuja mudança PARTIU desta aba. O eco do Realtime sobre eles é aplicado
  // sem animação — quem moveu o card já viu o movimento acontecer.
  const selfMutatedRef = useRef<Set<string>>(new Set());

  const memberNames = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of members) map.set(m.userId, m.name);
    return map;
  }, [members]);

  const setFilters = useCallback((patch: Partial<BoardFilters>) => {
    setFiltersState((prev) => ({ ...prev, ...patch }));
  }, []);

  const flashLanding = useCallback((taskId: string, direction: TaskMoveDirection) => {
    setLanding((prev) => ({ ...prev, [taskId]: direction }));
    window.setTimeout(() => {
      setLanding((prev) => {
        const next = { ...prev };
        delete next[taskId];
        return next;
      });
    }, 450);
  }, []);

  /**
   * Recarrega a esteira inteira do servidor.
   *
   * Serve de rede de segurança em dois casos: `pollingFn` de
   * `useRealtimeChannel` (o canal caiu — sem isso o board congelaria até o
   * próximo F5) e confirmação de criação de card, que não precisa esperar o
   * Realtime dar a volta.
   *
   * Não roda com arrasto em voo: sobrescrever o estado no meio de um movimento
   * otimista faria o card voltar sozinho para a coluna de origem.
   */
  const reloadBoard = useCallback(async () => {
    if (snapshotRef.current) return;
    const result = await getBoardSnapshotAction();
    if (!result.success || !result.data) return;
    const next = buildInitialState(result.data);
    cardsRef.current = next.cards;
    columnsRef.current = next.columns;
    setCardsState(next.cards);
    setColumnsState(next.columns);
  }, []);

  // ---------------------------------------------------------------------------
  // Realtime — reconcilia o que os colegas fizeram
  // ---------------------------------------------------------------------------

  const applyRemoteRow = useCallback(
    (row: TaskDbPayload) => {
      const isSelf = selfMutatedRef.current.has(row.id);

      applyCards((prev) => {
        const existing = prev[row.id];
        const next: TaskCard = {
          id: row.id,
          orgId: row.org_id,
          title: row.title,
          description: row.description,
          clientName: row.client_name,
          stage: (row.stage as TaskStage | null) ?? null,
          sector: row.sector as TaskSector,
          position: Number(row.position),
          assignedTo: row.assigned_to,
          blockedReason: row.blocked_reason,
          dueDate: row.due_date,
          budgetId: row.budget_id,
          workId: row.work_id,
          createdBy: row.created_by,
          lastActivityAt: row.last_activity_at,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
          budgetProjectName: row.budget_id ? budgetNames[row.budget_id] ?? null : null,
          assignedToName: row.assigned_to ? memberNames.get(row.assigned_to) ?? null : null,
          // Contadores não vêm no payload de `tasks`; preserva o que já se sabia
          // em vez de zerar e fazer os ícones do card piscarem.
          messageCount: existing?.messageCount ?? 0,
          attachmentCount: existing?.attachmentCount ?? 0,
        };
        return { ...prev, [row.id]: next };
      });

      const targetKey: ColumnKey = row.stage
        ? (row.stage as TaskStage)
        : avulsaKey(row.sector as TaskSector);

      applyColumns((prev) => {
        const next: ColumnMap = { ...prev };
        let currentKey: string | null = null;

        for (const [key, ids] of Object.entries(prev)) {
          if (ids.includes(row.id)) currentKey = key;
        }

        if (currentKey === targetKey) return prev;

        if (currentKey) next[currentKey] = next[currentKey].filter((id) => id !== row.id);

        // Insere na posição real do banco, não no fim. Anexar sempre no fim
        // faria a coluna de quem está assistindo divergir da de quem arrastou —
        // e a divergência só apareceria no próximo F5.
        const incomingPosition = Number(row.position);
        const target = next[targetKey] ?? [];
        const insertAt = target.findIndex((id) => {
          const other = cardsRef.current[id];
          return other ? other.position > incomingPosition : false;
        });

        next[targetKey] =
          insertAt === -1
            ? [...target, row.id]
            : [...target.slice(0, insertAt), row.id, ...target.slice(insertAt)];

        return next;
      });

      if (!isSelf) {
        setEntering((prev) => new Set(prev).add(row.id));
        window.setTimeout(() => {
          setEntering((prev) => {
            const next = new Set(prev);
            next.delete(row.id);
            return next;
          });
        }, 220);
      }

      selfMutatedRef.current.delete(row.id);
    },
    [applyCards, applyColumns, budgetNames, memberNames],
  );

  const handleRemoteDelete = useCallback(
    (row: { id: string }) => {
      applyColumns((prev) => {
        const next: ColumnMap = {};
        for (const [key, ids] of Object.entries(prev)) {
          next[key] = ids.filter((id) => id !== row.id);
        }
        return next;
      });
      applyCards((prev) => {
        const next = { ...prev };
        delete next[row.id];
        return next;
      });
    },
    [applyCards, applyColumns],
  );

  const realtimeEvents = useMemo(
    () => [
      {
        event: '*' as const,
        table: 'tasks',
        filter: `org_id=eq.${orgId}`,
        callback: (payload: unknown) => {
          const evt = payload as {
            eventType?: string;
            new?: TaskDbPayload;
            old?: { id: string };
          };
          if (evt.eventType === 'DELETE') {
            if (evt.old?.id) handleRemoteDelete(evt.old);
            return;
          }
          if (evt.new?.id) applyRemoteRow(evt.new);
        },
      },
    ],
    [orgId, applyRemoteRow, handleRemoteDelete],
  );

  useRealtimeChannel({
    channelName: `tarefas:${orgId}`,
    events: realtimeEvents,
    pollingFallbackMs: 30_000,
    pollingFn: reloadBoard,
  });

  // ---------------------------------------------------------------------------
  // Arrasto
  // ---------------------------------------------------------------------------

  const beginDrag = useCallback(() => {
    snapshotRef.current = { cards: cardsRef.current, columns: columnsRef.current };
  }, []);

  const cancelDrag = useCallback(() => {
    const snapshot = snapshotRef.current;
    if (!snapshot) return;
    cardsRef.current = snapshot.cards;
    columnsRef.current = snapshot.columns;
    setCardsState(snapshot.cards);
    setColumnsState(snapshot.columns);
    snapshotRef.current = null;
  }, []);

  const commitMove = useCallback(
    async (taskId: string, toColumn: ColumnKey, arrangement: ColumnMap, note?: string) => {
      const card = cardsRef.current[taskId];
      if (!card) return;

      const toStage = columnStage(toColumn);
      const toSector = columnSector(toColumn) ?? card.sector;
      const direction = taskMoveDirection(card.stage, toStage);
      const changedColumn = card.stage !== toStage || card.sector !== toSector;

      // Vizinhos DEPOIS do arrasto, lidos do arranjo recebido. O servidor tira a
      // posição do ponto médio entre eles — mandar a posição pronta perderia a
      // corrida contra um colega arrastando na mesma coluna ao mesmo tempo.
      const ids = arrangement[toColumn] ?? [];
      const index = ids.indexOf(taskId);
      const prevTaskId = index > 0 ? ids[index - 1] : null;
      const nextTaskId = index >= 0 && index < ids.length - 1 ? ids[index + 1] : null;

      selfMutatedRef.current.add(taskId);

      // Otimista: o card já mudou de etapa/setor na tela antes da resposta.
      applyCards((prev) => ({
        ...prev,
        [taskId]: { ...prev[taskId], stage: toStage, sector: toSector },
      }));

      if (changedColumn) flashLanding(taskId, direction);

      const result = await moveTaskAction({
        taskId,
        stage: toStage,
        sector: toSector,
        prevTaskId,
        nextTaskId,
        note: note ?? null,
      });

      if (!result.success) {
        selfMutatedRef.current.delete(taskId);
        cancelDrag();
        toast.error(result.error);
        return;
      }

      snapshotRef.current = null;
    },
    [applyCards, flashLanding, cancelDrag],
  );

  const patchCard = useCallback(
    (taskId: string, patch: Partial<TaskCard>) => {
      selfMutatedRef.current.add(taskId);
      applyCards((prev) => (prev[taskId] ? { ...prev, [taskId]: { ...prev[taskId], ...patch } } : prev));
    },
    [applyCards],
  );

  // ---------------------------------------------------------------------------
  // Filtros — ESMAECEM, não escondem.
  //
  // Duas razões. A primeira é de produto: ver a fila do vizinho é o ponto da
  // esteira, e esconder recria os quatro quadros isolados que ela substituiu.
  // A segunda é mecânica: o `index` que cada card entrega ao `useSortable`
  // precisa bater com o índice real dentro de `columns[key]`. Filtrar a lista
  // renderizada criava buracos nessa numeração e o `move()` do dnd-kit
  // reordenava sobre índices que não existiam.
  // ---------------------------------------------------------------------------

  const matchesFilters = useCallback(
    (card: TaskCard) => {
      if (filters.onlyMine && card.assignedTo !== viewerId) return false;
      if (filters.search) {
        const needle = filters.search.toLowerCase();
        const haystack = `${card.title} ${card.clientName ?? ''} ${card.budgetProjectName ?? ''}`;
        if (!haystack.toLowerCase().includes(needle)) return false;
      }
      return true;
    },
    [filters.onlyMine, filters.search, viewerId],
  );

  const filtersActive = filters.onlyMine || filters.search.trim().length > 0;

  const matchCount = useCallback(
    (key: ColumnKey) =>
      (columns[key] ?? []).filter((id) => cards[id] && matchesFilters(cards[id])).length,
    [columns, cards, matchesFilters],
  );

  const value = useMemo<BoardContextValue>(
    () => ({
      cards,
      columns,
      applyColumns,
      members,
      viewerId,
      viewerSector,
      filters,
      setFilters,
      matchesFilters,
      matchCount,
      filtersActive,
      landing,
      entering,
      beginDrag,
      commitMove,
      cancelDrag,
      patchCard,
      reloadBoard,
    }),
    [
      cards,
      columns,
      applyColumns,
      members,
      viewerId,
      viewerSector,
      filters,
      setFilters,
      matchesFilters,
      matchCount,
      filtersActive,
      landing,
      entering,
      beginDrag,
      commitMove,
      cancelDrag,
      patchCard,
      reloadBoard,
    ],
  );

  return <BoardContext.Provider value={value}>{children}</BoardContext.Provider>;
}

/** Todas as chaves de coluna, na ordem em que a esteira as desenha. */
export function allColumnKeys(showTerminal: boolean): ColumnKey[] {
  const stages = showTerminal
    ? TASK_STAGES
    : TASK_STAGES.filter((s) => s !== 'concluido' && s !== 'perdido');
  return [...stages] as ColumnKey[];
}
