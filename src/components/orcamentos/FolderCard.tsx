'use client';

import { useCallback } from 'react';
import { useDraggable, useDroppable } from '@dnd-kit/react';
import {
  FileText,
  Folder,
  FolderEdit,
  FolderOpen,
  Home,
  MoreVertical,
  Move,
  Trash2,
  X,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { resolveFolderColor } from '@/lib/folderColors';
import type { MoveTarget } from './BudgetCard';
import { draggableId, dropZoneId } from './dnd/dashboardDnd';
import { useDragToOpenGuard } from './dnd/useDragToOpenGuard';

export interface FolderCardProps {
  folderId: string;
  folderName: string;
  folderColor?: string;
  parentId: string | null;
  itemCount: number;
  subfolderCount: number;
  /** O que está sendo arrastado agora — decide o texto do alvo de drop. */
  draggingKind: 'budget' | 'folder' | null;
  /** O item em arrasto pode cair nesta pasta? */
  validTarget: boolean;
  menuOpen: boolean;
  moveMenuOpen: boolean;
  moveTargets: MoveTarget[];
  onOpen: () => void;
  onToggleMenu: () => void;
  onCloseMenu: () => void;
  onToggleMoveMenu: () => void;
  onRename: () => void;
  onMoveTo: (targetFolderId: string | null) => void;
  onRemoveFromFolder: () => void;
  onDelete: () => void;
}

/**
 * Cartão de pasta: arrastável E alvo de drop ao mesmo tempo.
 *
 * Os dois papéis são hooks separados no dnd-kit, cada um com seu próprio ref
 * de callback — daí o `setRefs` compondo os dois no mesmo elemento.
 *
 * Extraído do corpo do `Dashboard` pela mesma razão do `BudgetCard`: componente
 * declarado dentro de outro remonta a cada render do pai, o que apagaria o
 * registro do dnd-kit no meio de um arrasto.
 */
export function FolderCard({
  folderId,
  folderName,
  folderColor,
  parentId,
  itemCount,
  subfolderCount,
  draggingKind,
  validTarget,
  menuOpen,
  moveMenuOpen,
  moveTargets,
  onOpen,
  onToggleMenu,
  onCloseMenu,
  onToggleMoveMenu,
  onRename,
  onMoveTo,
  onRemoveFromFolder,
  onDelete,
}: FolderCardProps) {
  const { ref: dragRef, isDragging } = useDraggable({
    id: draggableId('folder', folderId),
    type: 'item',
    disabled: menuOpen,
  });

  const { ref: dropRef, isDropTarget } = useDroppable({
    id: dropZoneId('card', folderId),
    type: 'folder-zone',
    accept: 'item',
  });

  const setRefs = useCallback(
    (element: Element | null) => {
      dragRef(element);
      dropRef(element);
    },
    [dragRef, dropRef],
  );

  const guard = useDragToOpenGuard(onOpen);

  const showDrop = isDropTarget && !isDragging;
  const state = isDragging
    ? 'dragging'
    : showDrop && validTarget
      ? 'drop-valid'
      : showDrop && !validTarget
        ? 'drop-invalid'
        : 'default';

  return (
    <Card
      ref={setRefs}
      state={state}
      className={cn(
        // Ver BudgetCard: rolar com o dedo por cima do cartão continua valendo.
        'touch-pan-y select-none rounded-xl',
        state === 'drop-invalid'
          ? 'cursor-not-allowed'
          : isDragging
            ? 'cursor-grabbing'
            : 'cursor-grab hover:-translate-y-0.5 hover:shadow-lg',
        menuOpen && 'z-40',
      )}
      {...guard}
    >
      <div className="flex items-center justify-between p-4">
        <div className="flex min-w-0 flex-1 items-center space-x-3">
          <div
            className="shrink-0 rounded-lg p-2.5"
            style={{ backgroundColor: `${resolveFolderColor(folderColor)}1A` }}
          >
            <Folder className="h-5 w-5" style={{ color: resolveFolderColor(folderColor) }} />
          </div>

          <div className="min-w-0 flex-1">
            <h3 className="truncate text-base font-semibold text-gray-900">{folderName}</h3>
            <p className="text-sm text-gray-500">
              {itemCount} {itemCount === 1 ? 'item' : 'itens'}
              {subfolderCount > 0 &&
                ` (${subfolderCount} ${subfolderCount === 1 ? 'pasta' : 'pastas'})`}
            </p>
          </div>
        </div>

        <div data-no-open className="relative flex shrink-0 items-center space-x-2">
          <button
            onClick={onToggleMenu}
            aria-label="Mais opções"
            className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
          >
            <MoreVertical className="h-4 w-4" />
          </button>

          {menuOpen && (
            <>
              <div className="fixed inset-0 z-20" onClick={onCloseMenu} />

              <div className="absolute right-0 top-10 z-30 w-60 overflow-hidden rounded-xl border border-gray-100 bg-surface py-1.5 shadow-xl ring-1 ring-black/5 duration-100 animate-in fade-in-0 zoom-in-95">
                <button
                  onClick={onOpen}
                  className="mx-1 flex w-[calc(100%-8px)] items-center space-x-2.5 rounded-lg px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
                >
                  <FolderOpen className="h-4 w-4 text-gray-400" />
                  <span>Abrir Pasta</span>
                </button>

                <div className="my-1 border-t border-gray-100" />
                <button
                  onClick={onRename}
                  className="mx-1 flex w-[calc(100%-8px)] items-center space-x-2.5 rounded-lg px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
                >
                  <FolderEdit className="h-4 w-4 text-gray-400" />
                  <span>Renomear</span>
                </button>

                <div className="my-1 border-t border-gray-100" />
                <button
                  onClick={onToggleMoveMenu}
                  className="mx-1 flex w-[calc(100%-8px)] items-center space-x-2.5 rounded-lg px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
                >
                  <Move className="h-4 w-4 text-gray-400" />
                  <span>Mover para pasta…</span>
                </button>

                {moveMenuOpen && (
                  <div className="mx-1 mb-1 max-h-40 overflow-y-auto rounded-lg bg-gray-50">
                    {moveTargets.map((target) => (
                      <button
                        key={String(target.id)}
                        onClick={() => onMoveTo(target.id)}
                        className="flex w-full items-center space-x-2 rounded-lg px-3 py-1.5 text-left text-sm text-gray-600 hover:bg-gray-100"
                      >
                        {target.id === null ? (
                          <Home className="h-3.5 w-3.5" />
                        ) : (
                          <Folder
                            className="h-3.5 w-3.5"
                            style={{ color: target.color || '#6B7280' }}
                          />
                        )}
                        <span className="truncate">{target.name}</span>
                      </button>
                    ))}
                  </div>
                )}

                {parentId && (
                  <>
                    <div className="my-1 border-t border-gray-100" />
                    <button
                      onClick={onRemoveFromFolder}
                      className="mx-1 flex w-[calc(100%-8px)] items-center space-x-2.5 rounded-lg px-3 py-2 text-left text-sm text-neutral-900 hover:bg-accent-500/10"
                    >
                      <Home className="h-4 w-4" />
                      <span>Mover para Raiz</span>
                    </button>
                  </>
                )}

                <div className="my-1 border-t border-gray-100" />
                <button
                  onClick={onDelete}
                  className="mx-1 flex w-[calc(100%-8px)] items-center space-x-2.5 rounded-lg px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50"
                >
                  <Trash2 className="h-4 w-4" />
                  <span>Excluir</span>
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {showDrop && validTarget && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-xl bg-accent-500/10">
          <div className="flex items-center space-x-2 rounded-lg bg-accent-600 px-4 py-2 text-sm font-medium text-white shadow-lg">
            {draggingKind === 'folder' ? (
              <>
                <Folder className="h-4 w-4" />
                <span>Soltar pasta aqui</span>
              </>
            ) : (
              <>
                <FileText className="h-4 w-4" />
                <span>Soltar orçamento aqui</span>
              </>
            )}
          </div>
        </div>
      )}

      {showDrop && !validTarget && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-xl bg-red-500/10">
          <div className="flex items-center space-x-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white shadow-lg">
            <X className="h-4 w-4" />
            <span>Operação inválida</span>
          </div>
        </div>
      )}
    </Card>
  );
}
