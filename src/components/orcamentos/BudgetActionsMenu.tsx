'use client';

import { CheckCircle, FolderOpen, Move, Star, Trash2 } from 'lucide-react';
import type { Orcamento } from '@/types';
import {
  ActionsMenu,
  ActionsMenuItem,
  ActionsMenuSeparator,
  MoveTargetList,
  type MoveTarget,
} from './ActionsMenu';

export interface BudgetActionsMenuProps {
  budget: Orcamento;
  isFinalizing: boolean;
  moveMenuOpen: boolean;
  moveTargets: MoveTarget[];
  onCloseMenu: () => void;
  onToggleMoveMenu: () => void;
  onFinalize: () => void;
  onToggleTemplate: () => void;
  onMoveTo: (targetFolderId: string | null) => void;
  onRemoveFromFolder: () => void;
  onDelete: () => void;
}

/** Menu "⋮" do orçamento — mesmo conteúdo no cartão e na linha. */
export function BudgetActionsMenu({
  budget,
  isFinalizing,
  moveMenuOpen,
  moveTargets,
  onCloseMenu,
  onToggleMoveMenu,
  onFinalize,
  onToggleTemplate,
  onMoveTo,
  onRemoveFromFolder,
  onDelete,
}: BudgetActionsMenuProps) {
  return (
    <ActionsMenu onClose={onCloseMenu}>
      {budget.status !== 'Finalizado' && (
        <ActionsMenuItem
          onClick={onFinalize}
          disabled={isFinalizing}
          icon={<CheckCircle className="h-4 w-4 text-gray-400" />}
          label={isFinalizing ? 'Finalizando…' : 'Finalizar Orçamento'}
        />
      )}

      <ActionsMenuItem
        onClick={onToggleTemplate}
        icon={<Star className="h-4 w-4 text-gray-400" />}
        label={budget.isTemplate ? 'Desmarcar Modelo' : 'Marcar como Modelo'}
      />

      <ActionsMenuSeparator />
      <ActionsMenuItem
        onClick={onToggleMoveMenu}
        icon={<Move className="h-4 w-4 text-gray-400" />}
        label="Mover para pasta…"
      />

      {moveMenuOpen && <MoveTargetList targets={moveTargets} onMoveTo={onMoveTo} />}

      {budget.folderId && (
        <>
          <ActionsMenuSeparator />
          <ActionsMenuItem
            onClick={onRemoveFromFolder}
            tone="accent"
            icon={<FolderOpen className="h-4 w-4" />}
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
