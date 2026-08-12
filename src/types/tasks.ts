/**
 * Modelo da Esteira de Trabalho (MD/PLANO-ESTEIRA-TAREFAS.md).
 *
 * O card é a DEMANDA do cliente e caminha por etapas fixas, trocando de setor a
 * cada handoff. Este arquivo é o espelho em TypeScript do vocabulário que vive
 * no banco (`task_stage_sector()` e `task_stage_order()`, definidas em
 * 20260812120000_tarefas_core.sql). **Alterou um, altere o outro.**
 *
 * `TaskSector` reaproveita os mesmos 4 valores de `OrgSector`
 * (`src/types/organization.ts`) — é o mesmo enum, com outro nome de domínio
 * porque aqui representa "a fila responsável pelo card", não "onde a pessoa
 * trabalha". Reexportado em vez de duplicado.
 */
import type { OrgSector } from './organization';

export { ORG_SECTORS as TASK_SECTORS, ORG_SECTOR_LABELS as TASK_SECTOR_LABELS } from './organization';
export type TaskSector = OrgSector;

// -----------------------------------------------------------------------------
// Etapas
// -----------------------------------------------------------------------------

/** As 7 etapas de trabalho, na ordem das Fases 1–7 do mapeamento operacional. */
export const TASK_WORKING_STAGES = [
  'solicitacao',
  'orcamento',
  'precificacao',
  'proposta',
  'projeto_executivo',
  'compras',
  'execucao',
] as const;

/** Etapas terminais — colunas colapsadas por padrão no fim da esteira. */
export const TASK_TERMINAL_STAGES = ['concluido', 'perdido'] as const;

export const TASK_STAGES = [...TASK_WORKING_STAGES, ...TASK_TERMINAL_STAGES] as const;

export type TaskWorkingStage = (typeof TASK_WORKING_STAGES)[number];
export type TaskStage = (typeof TASK_STAGES)[number];

/** Tom do sistema de design usado para identificar o setor dono da coluna. */
export type SectorTone = 'blue' | 'teal' | 'amber' | 'purple';

export const TASK_SECTOR_TONE: Record<TaskSector, SectorTone> = {
  comercial: 'blue',
  engenharia: 'teal',
  compras: 'amber',
  execucao: 'purple',
};

export interface TaskStageMeta {
  key: TaskStage;
  label: string;
  /** Rótulo curto do cabeçalho da coluna, onde o espaço é apertado. */
  shortLabel: string;
  /** Setor dono. `null` nas terminais: elas preservam o setor que o card tinha. */
  sector: TaskSector | null;
  /** Fase correspondente em MD/mapeamentooperacional.md §3. */
  phase: string | null;
  /** Uma linha explicando o que acontece aqui — vira o estado vazio da coluna. */
  hint: string;
}

export const TASK_STAGE_META: Record<TaskStage, TaskStageMeta> = {
  solicitacao: {
    key: 'solicitacao',
    label: 'Solicitação',
    shortLabel: 'Solicitação',
    sector: 'comercial',
    phase: 'Fase 1',
    hint: 'Cliente pediu orçamento. Registre escopo, local, concessionária e prazo.',
  },
  orcamento: {
    key: 'orcamento',
    label: 'Orçamento técnico',
    shortLabel: 'Orçamento',
    sector: 'engenharia',
    phase: 'Fase 2',
    hint: 'Montar a rede no canvas e fechar o BOM no OrçaRede.',
  },
  precificacao: {
    key: 'precificacao',
    label: 'Precificação',
    shortLabel: 'Precificação',
    sector: 'engenharia',
    phase: 'Fase 3',
    hint: 'Aplicar margem, imposto e custo de serviço sobre o orçamento técnico.',
  },
  proposta: {
    key: 'proposta',
    label: 'Proposta',
    shortLabel: 'Proposta',
    sector: 'comercial',
    phase: 'Fases 4–5',
    hint: 'Publicar, enviar ao cliente e aguardar o aceite formal.',
  },
  projeto_executivo: {
    key: 'projeto_executivo',
    label: 'Projeto executivo',
    shortLabel: 'Projeto exec.',
    sector: 'engenharia',
    phase: 'Fase 5',
    hint: 'Elaborar o projeto e o orçamento de implementação (≠ o de venda).',
  },
  compras: {
    key: 'compras',
    label: 'Compras',
    shortLabel: 'Compras',
    sector: 'compras',
    phase: 'Fase 6',
    hint: 'Gerar a ordem de compra a partir da lista de materiais aprovada.',
  },
  execucao: {
    key: 'execucao',
    label: 'Execução',
    shortLabel: 'Execução',
    sector: 'execucao',
    phase: 'Fase 7',
    hint: 'Obra liberada — acompanhamento em campo pelo Andamento de Obra.',
  },
  concluido: {
    key: 'concluido',
    label: 'Concluído',
    shortLabel: 'Concluído',
    sector: null,
    phase: null,
    hint: 'Job entregue.',
  },
  perdido: {
    key: 'perdido',
    label: 'Perdido',
    shortLabel: 'Perdido',
    sector: null,
    phase: null,
    hint: 'Cliente não seguiu. Fica no histórico para consulta.',
  },
};

export const TASK_STAGE_LABELS: Record<TaskStage, string> = Object.fromEntries(
  TASK_STAGES.map((stage) => [stage, TASK_STAGE_META[stage].label]),
) as Record<TaskStage, string>;

/**
 * Posição da etapa na esteira. Espelha `public.task_stage_order()`. As
 * terminais ficam de fora (retornam `null`) porque não entram na comparação de
 * direção — mover para elas é sempre 'encerramento'.
 */
export function taskStageOrder(stage: TaskStage | null): number | null {
  if (!stage) return null;
  const index = (TASK_WORKING_STAGES as readonly string[]).indexOf(stage);
  return index >= 0 ? index + 1 : null;
}

export type TaskMoveDirection = 'avanco' | 'retorno' | 'encerramento';

/**
 * Direção de um movimento entre etapas — mesma regra do trigger
 * `tasks_before_write`. O cliente recalcula para animar o card antes do
 * servidor confirmar (a mutação é otimista); o valor gravado continua vindo do
 * banco, que é a fonte da verdade do histórico.
 */
export function taskMoveDirection(from: TaskStage | null, to: TaskStage | null): TaskMoveDirection {
  if (to === 'concluido' || to === 'perdido') return 'encerramento';
  const fromOrder = taskStageOrder(from);
  const toOrder = taskStageOrder(to);
  if (fromOrder === null || toOrder === null) return 'avanco';
  return toOrder < fromOrder ? 'retorno' : 'avanco';
}

/** Setor dono de uma etapa. Espelha `public.task_stage_sector()`. */
export function taskStageSector(stage: TaskStage | null): TaskSector | null {
  return stage ? TASK_STAGE_META[stage].sector : null;
}

// -----------------------------------------------------------------------------
// Linhas
// -----------------------------------------------------------------------------

export interface TaskRow {
  id: string;
  orgId: string;
  title: string;
  description: string | null;
  clientName: string | null;
  /** `null` = card avulso (trabalho que não é job de cliente). */
  stage: TaskStage | null;
  sector: TaskSector;
  position: number;
  assignedTo: string | null;
  blockedReason: string | null;
  dueDate: string | null;
  budgetId: string | null;
  workId: string | null;
  createdBy: string;
  lastActivityAt: string;
  createdAt: string;
  updatedAt: string;
}

/** Card do board, com o que a face precisa mostrar sem outra consulta. */
export interface TaskCard extends TaskRow {
  budgetProjectName: string | null;
  assignedToName: string | null;
  /** Contadores para os ícones do rodapé do card. */
  messageCount: number;
  attachmentCount: number;
}

export type TaskEventKind =
  | 'criada'
  | 'movida'
  | 'atribuida'
  | 'desatribuida'
  | 'bloqueada'
  | 'desbloqueada'
  | 'prazo'
  | 'vinculada';

export interface TaskEventRow {
  id: string;
  taskId: string;
  actorId: string | null;
  actorName: string | null;
  kind: TaskEventKind;
  fromStage: TaskStage | null;
  toStage: TaskStage | null;
  fromSector: TaskSector | null;
  toSector: TaskSector | null;
  direction: TaskMoveDirection | null;
  note: string | null;
  createdAt: string;
}

export interface TaskAttachmentRow {
  id: string;
  taskId: string;
  messageId: string | null;
  uploadedBy: string;
  uploadedByName: string | null;
  storagePath: string;
  fileName: string;
  mimeType: string | null;
  fileSize: number | null;
  width: number | null;
  height: number | null;
  createdAt: string;
}

export interface TaskMessageRow {
  id: string;
  taskId: string;
  senderId: string;
  senderName: string | null;
  body: string | null;
  clientEventId: string | null;
  createdAt: string;
  attachments: TaskAttachmentRow[];
}

export interface TaskFollowerRow {
  taskId: string;
  userId: string;
  userName: string | null;
  reason: 'criador' | 'responsavel' | 'comentou' | 'manual';
}

export interface TaskDetail extends TaskCard {
  events: TaskEventRow[];
  messages: TaskMessageRow[];
  /** Só os anexos do card (`message_id IS NULL`) — os do chat vêm nas mensagens. */
  cardAttachments: TaskAttachmentRow[];
  followers: TaskFollowerRow[];
}

// -----------------------------------------------------------------------------
// Board
// -----------------------------------------------------------------------------

/** Uma coluna da esteira. `stage` null é a faixa de avulsas, agrupada por setor. */
export interface TaskColumn {
  stage: TaskStage;
  cards: TaskCard[];
}

export interface TaskBoard {
  columns: TaskColumn[];
  /** Cards sem etapa, agrupados por setor. */
  avulsas: Record<TaskSector, TaskCard[]>;
}

export interface TaskBoardMember {
  userId: string;
  name: string;
  sector: TaskSector | null;
}

// -----------------------------------------------------------------------------
// Entradas de escrita
// -----------------------------------------------------------------------------

export interface CreateTaskInput {
  title: string;
  description?: string | null;
  clientName?: string | null;
  /** `null` cria card avulso — nesse caso `sector` é obrigatório. */
  stage: TaskStage | null;
  sector: TaskSector;
  budgetId?: string | null;
  dueDate?: string | null;
}

export interface MoveTaskInput {
  taskId: string;
  /** Etapa de destino. `null` move para a faixa de avulsas do setor. */
  stage: TaskStage | null;
  /** Só quando `stage` é null: para qual setor avulso o card vai. */
  sector?: TaskSector;
  /**
   * Vizinhos do card DEPOIS do arrasto, em ordem de leitura. O servidor tira a
   * posição do ponto médio entre os dois — enviar a posição já calculada pelo
   * cliente perderia a corrida contra um colega arrastando ao mesmo tempo.
   * `prevTaskId` null = soltou no topo; `nextTaskId` null = soltou no fim.
   */
  prevTaskId?: string | null;
  nextTaskId?: string | null;
  /** Obrigatória quando o movimento é 'retorno'. */
  note?: string | null;
}

/** Um card que o cliente já moveu na tela e o servidor ainda não confirmou. */
export interface OptimisticMove {
  taskId: string;
  toStage: TaskStage | null;
  toSector: TaskSector;
  position: number;
  direction: TaskMoveDirection;
}
