'use client';

import { useState } from 'react';
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
} from './BoardProvider';
import { TASK_SECTORS, taskMoveDirection } from '@/types/tasks';

/**
 * A esteira.
 *
 * O arrasto é do `@dnd-kit/react`: `move()` reordena o mapa de colunas dentro
 * de `onDragOver`, e o `@dnd-kit/dom` anima o DOM sozinho (transform direto no
 * ponteiro durante o arrasto, FLIP nos vizinhos que abrem espaço, voo até o
 * destino ao soltar). Nada disso seria possível na arquitetura anterior, em que
 * cada movimento chamava `router.refresh()` e o card era DESMONTADO e remontado
 * — não faltava CSS, faltava o nó sobreviver à mutação.
 *
 * `onDragEnd` só decide o que persistir. Movimento pra trás segura a persistência
 * até o motivo ser escrito; qualquer outro grava direto.
 */
export function EsteiraBoard() {
  const { setColumns, columns, cards, filters, beginDrag, commitMove, cancelDrag } = useBoard();
  const [pendingReturn, setPendingReturn] = useState<PendingReturn | null>(null);

  const stageKeys = allColumnKeys(filters.showTerminal);
  const avulsaKeys = TASK_SECTORS.map(avulsaKey);
  const hasAvulsas = avulsaKeys.some((key) => (columns[key] ?? []).length > 0);

  return (
    <DragDropProvider
      onDragStart={beginDrag}
      onDragOver={(event) => {
        // Reordenação otimista: a tela já mostra o resultado antes de qualquer
        // ida ao servidor.
        setColumns((prev) => move(prev, event));
      }}
      onDragEnd={(event) => {
        if (event.canceled) {
          cancelDrag();
          return;
        }

        const taskId = String(event.operation.source?.id ?? '');
        if (!taskId) return;

        // A coluna de destino é lida do estado JÁ reordenado pelo onDragOver —
        // é ele que sabe onde o card parou, inclusive a posição na vertical.
        const toColumn = (Object.keys(columns).find((key) =>
          columns[key].includes(taskId),
        ) ?? null) as ColumnKey | null;

        if (!toColumn) return;

        const card = cards[taskId];
        if (!card) return;

        const toStage = columnStage(toColumn);
        const direction = taskMoveDirection(card.stage, toStage);

        if (card.stage !== toStage && direction === 'retorno') {
          setPendingReturn({
            taskId,
            taskTitle: card.title,
            fromStage: card.stage,
            toStage,
          });
          return;
        }

        void commitMove(taskId, toColumn);
      }}
    >
      <div className="flex flex-col gap-5">
        <div
          className="flex gap-3 overflow-x-auto pb-3"
          role="list"
          aria-label="Etapas da esteira"
        >
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
          if (!pendingReturn) return;
          const target = (Object.keys(columns).find((key) =>
            columns[key].includes(pendingReturn.taskId),
          ) ?? null) as ColumnKey | null;
          setPendingReturn(null);
          if (target) void commitMove(pendingReturn.taskId, target, note);
        }}
        onCancel={() => {
          setPendingReturn(null);
          cancelDrag();
        }}
      />
    </DragDropProvider>
  );
}
