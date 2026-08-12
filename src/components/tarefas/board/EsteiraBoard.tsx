'use client';

import { useRef, useState } from 'react';
import { DragDropProvider } from '@dnd-kit/react';
import { move } from '@dnd-kit/helpers';
import { StageColumn } from './StageColumn';
import { ReturnNoteDialog, type PendingReturn } from './ReturnNoteDialog';
import {
  allColumnKeys,
  avulsaKey,
  columnStage,
  useBoard,
  type ColumnKey,
  type ColumnMap,
} from './BoardProvider';
import { TASK_SECTORS, taskMoveDirection } from '@/types/tasks';

/** Em qual coluna do arranjo um card está. */
function findColumn(arrangement: ColumnMap, taskId: string): ColumnKey | null {
  for (const [key, ids] of Object.entries(arrangement)) {
    if (ids.includes(taskId)) return key as ColumnKey;
  }
  return null;
}

/**
 * A esteira.
 *
 * O arrasto é do `@dnd-kit/react`: `move()` reordena o mapa de colunas, e o
 * `@dnd-kit/dom` anima o DOM sozinho (transform direto no ponteiro durante o
 * arrasto, FLIP nos vizinhos que abrem espaço, voo até o destino ao soltar).
 * Nada disso seria possível na arquitetura anterior, em que cada movimento
 * chamava `router.refresh()` e o card era DESMONTADO e remontado — não faltava
 * CSS, faltava o nó sobreviver à mutação.
 *
 * `move()` roda nos DOIS eventos, e essa é a parte que estava errada antes:
 *
 *   dragover → mostra o rearranjo enquanto o dedo ainda está no card
 *   dragend  → fecha o rearranjo final, que pode diferir do último dragover
 *
 * E o resultado do `move()` do `dragend` é passado DIRETO para `commitMove`,
 * em vez de ser lido do estado do React — que ainda não recomeçou o render
 * nesse instante e devolveria o arranjo de antes do arrasto.
 */
export function EsteiraBoard() {
  const { applyColumns, columns, cards, filters, beginDrag, commitMove, cancelDrag } = useBoard();
  const [pendingReturn, setPendingReturn] = useState<PendingReturn | null>(null);

  // Arranjo congelado no momento em que o diálogo de devolução abriu. Sem isso,
  // um card que chegasse pelo Realtime enquanto a nota é escrita mudaria os
  // vizinhos e a posição sairia calculada sobre outro estado.
  const pendingArrangementRef = useRef<ColumnMap | null>(null);

  const stageKeys = allColumnKeys(filters.showTerminal);
  const avulsaKeys = TASK_SECTORS.map(avulsaKey);
  const hasAvulsas = avulsaKeys.some((key) => (columns[key] ?? []).length > 0);

  return (
    <DragDropProvider
      onDragStart={beginDrag}
      onDragOver={(event) => {
        applyColumns((prev) => move(prev, event));
      }}
      onDragEnd={(event) => {
        if (event.canceled) {
          cancelDrag();
          return;
        }

        const taskId = String(event.operation.source?.id ?? '');
        if (!taskId) return;

        const arrangement = applyColumns((prev) => move(prev, event));
        const toColumn = findColumn(arrangement, taskId);
        const card = cards[taskId];
        if (!toColumn || !card) return;

        const toStage = columnStage(toColumn);

        // Devolver segura a persistência até o motivo ser escrito. Qualquer
        // outro movimento grava direto.
        if (card.stage !== toStage && taskMoveDirection(card.stage, toStage) === 'retorno') {
          pendingArrangementRef.current = arrangement;
          setPendingReturn({ taskId, taskTitle: card.title, fromStage: card.stage, toStage });
          return;
        }

        void commitMove(taskId, toColumn, arrangement);
      }}
    >
      <div className="flex flex-col gap-5">
        <div className="flex gap-3 overflow-x-auto pb-3" aria-label="Etapas da esteira">
          {stageKeys.map((key) => (
            <StageColumn key={key} columnKey={key} />
          ))}
        </div>

        {hasAvulsas && (
          <section>
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">
              Avulsas
              <span className="ml-2 font-normal normal-case tracking-normal text-neutral-400">
                trabalho que não é job de cliente
              </span>
            </h2>
            <div className="flex gap-3 overflow-x-auto pb-3">
              {avulsaKeys.map((key) => (
                <StageColumn key={key} columnKey={key} />
              ))}
            </div>
          </section>
        )}
      </div>

      <ReturnNoteDialog
        pending={pendingReturn}
        onConfirm={(note) => {
          const arrangement = pendingArrangementRef.current;
          const taskId = pendingReturn?.taskId;
          pendingArrangementRef.current = null;
          setPendingReturn(null);
          if (!arrangement || !taskId) return;
          const toColumn = findColumn(arrangement, taskId);
          if (toColumn) void commitMove(taskId, toColumn, arrangement, note);
        }}
        onCancel={() => {
          pendingArrangementRef.current = null;
          setPendingReturn(null);
          cancelDrag();
        }}
      />
    </DragDropProvider>
  );
}
