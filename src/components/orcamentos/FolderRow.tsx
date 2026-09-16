'use client';

import { useCallback } from 'react';
import { useDraggable, useDroppable } from '@dnd-kit/react';
import { ChevronRight, Folder, MoreVertical, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { resolveFolderColor } from '@/lib/folderColors';
import { FolderActionsMenu } from './FolderActionsMenu';
import type { FolderCardProps } from './FolderCard';
import { LIST_GRID } from './listLayout';
import { draggableId, dropZoneId } from './dnd/dashboardDnd';
import { useDragToOpenGuard } from './dnd/useDragToOpenGuard';

/**
 * Pasta na view em lista — arrastável e alvo de drop, como o `FolderCard`.
 *
 * O realce de drop aqui é uma borda interna em vez do overlay centralizado do
 * cartão: numa linha de ~44px de altura, o balão "Soltar aqui" cobriria o nome
 * da pasta que o usuário está mirando.
 */
export function FolderRow({
  folderId,
  folderName,
  folderColor,
  parentId,
  itemCount,
  subfolderCount,
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
  const color = resolveFolderColor(folderColor);

  return (
    <div
      ref={setRefs}
      className={cn(
        'group relative touch-pan-y select-none px-3 py-2.5 transition-colors',
        isDragging
          ? 'cursor-grabbing opacity-50'
          : showDrop && !validTarget
            ? 'cursor-not-allowed bg-red-50 ring-2 ring-inset ring-red-300'
            : showDrop && validTarget
              ? 'cursor-grab bg-accent-50 ring-2 ring-inset ring-accent-500'
              : 'cursor-grab hover:bg-gray-50',
        menuOpen && 'z-40 bg-gray-50',
      )}
      {...guard}
    >
      <div className={LIST_GRID}>
        <div className="flex min-w-0 items-center gap-2.5">
          <Folder className="h-4 w-4 shrink-0" style={{ color }} fill={`${color}33`} />
          <span className="truncate text-sm font-medium text-gray-900">{folderName}</span>
          {showDrop && !validTarget && <X className="h-3.5 w-3.5 shrink-0 text-red-500" />}
        </div>

        {/* Pasta não tem cliente nem concessionária: as colunas ficam vazias
            para os itens abaixo continuarem alinhados. */}
        <div className="hidden md:block" />
        <div className="hidden md:block" />
        <div className="hidden md:block" />

        <div className="hidden md:flex md:items-center">
          <span className="text-sm text-gray-500">
            {itemCount} {itemCount === 1 ? 'item' : 'itens'}
            {subfolderCount > 0 &&
              ` · ${subfolderCount} ${subfolderCount === 1 ? 'pasta' : 'pastas'}`}
          </span>
        </div>

        <div data-no-open className="relative flex items-center justify-end">
          <ChevronRight className="absolute right-10 hidden h-4 w-4 text-gray-300 md:group-hover:block" />

          <Button variant="ghost" size="icon" onClick={onToggleMenu} title="Mais opções">
            <MoreVertical className="h-4 w-4" />
          </Button>

          {menuOpen && (
            <FolderActionsMenu
              parentId={parentId}
              moveMenuOpen={moveMenuOpen}
              moveTargets={moveTargets}
              onOpen={onOpen}
              onCloseMenu={onCloseMenu}
              onToggleMoveMenu={onToggleMoveMenu}
              onRename={onRename}
              onMoveTo={onMoveTo}
              onRemoveFromFolder={onRemoveFromFolder}
              onDelete={onDelete}
            />
          )}
        </div>
      </div>
    </div>
  );
}
