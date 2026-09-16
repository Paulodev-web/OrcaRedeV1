'use client';

import { FolderEdit, FolderOpen, Home, Move, Trash2 } from 'lucide-react';
import {
  ActionsMenu,
  ActionsMenuItem,
  ActionsMenuSeparator,
  MoveTargetList,
  type MoveTarget,
} from './ActionsMenu';

export interface FolderActionsMenuProps {
  parentId: string | null;
  moveMenuOpen: boolean;
  moveTargets: MoveTarget[];
  onOpen: () => void;
  onCloseMenu: () => void;
  onToggleMoveMenu: () => void;
  onRename: () => void;
  onMoveTo: (targetFolderId: string | null) => void;
  onRemoveFromFolder: () => void;
  onDelete: () => void;
}

/** Menu "⋮" da pasta — mesmo conteúdo no cartão e na linha. */
export function FolderActionsMenu({
  parentId,
  moveMenuOpen,
  moveTargets,
  onOpen,
  onCloseMenu,
  onToggleMoveMenu,
  onRename,
  onMoveTo,
  onRemoveFromFolder,
  onDelete,
}: FolderActionsMenuProps) {
  return (
    <ActionsMenu onClose={onCloseMenu}>
      <ActionsMenuItem
        onClick={onOpen}
        icon={<FolderOpen className="h-4 w-4 text-gray-400" />}
        label="Abrir Pasta"
      />

      <ActionsMenuSeparator />
      <ActionsMenuItem
        onClick={onRename}
        icon={<FolderEdit className="h-4 w-4 text-gray-400" />}
        label="Renomear"
      />

      <ActionsMenuSeparator />
      <ActionsMenuItem
        onClick={onToggleMoveMenu}
        icon={<Move className="h-4 w-4 text-gray-400" />}
        label="Mover para pasta…"
      />

      {moveMenuOpen && <MoveTargetList targets={moveTargets} onMoveTo={onMoveTo} />}

      {parentId && (
        <>
          <ActionsMenuSeparator />
          <ActionsMenuItem
            onClick={onRemoveFromFolder}
            tone="accent"
            icon={<Home className="h-4 w-4" />}
            label="Mover para Raiz"
          />
        </>
      )}

      <ActionsMenuSeparator />
      <ActionsMenuItem
        onClick={onDelete}
        tone="danger"
        icon={<Trash2 className="h-4 w-4" />}
        label="Excluir"
      />
    </ActionsMenu>
  );
}
