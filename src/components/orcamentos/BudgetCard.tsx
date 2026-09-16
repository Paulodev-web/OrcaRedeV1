'use client';

import { useDraggable } from '@dnd-kit/react';
import {
  Building2,
  Calendar,
  CheckCircle,
  Clock,
  Copy,
  Edit,
  MoreVertical,
  Star,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { Orcamento } from '@/types';
import { draggableId } from './dnd/dashboardDnd';
import { useDragToOpenGuard } from './dnd/useDragToOpenGuard';
import { BudgetActionsMenu } from './BudgetActionsMenu';
import type { MoveTarget } from './ActionsMenu';

export type { MoveTarget };

export interface BudgetCardProps {
  budget: Orcamento;
  concessionariaNome: string;
  formattedDate: string;
  isFinalizing: boolean;
  isDuplicating: boolean;
  menuOpen: boolean;
  moveMenuOpen: boolean;
  moveTargets: MoveTarget[];
  onOpen: () => void;
  onToggleMenu: () => void;
  onCloseMenu: () => void;
  onToggleMoveMenu: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onFinalize: () => void;
  onToggleTemplate: () => void;
  onMoveTo: (targetFolderId: string | null) => void;
  onRemoveFromFolder: () => void;
  onDelete: () => void;
}

/**
 * Cartão de orçamento do Dashboard.
 *
 * Vive em módulo próprio — e não mais declarado dentro do corpo do
 * `Dashboard` — porque um componente definido dentro de outro ganha
 * identidade nova a cada render do pai, e o React desmonta e remonta a
 * subárvore inteira. Com HTML5 isso só custava performance; com dnd-kit
 * quebraria o arrasto no meio do gesto, já que o elemento registrado como
 * arrastável deixaria de existir assim que qualquer estado do Dashboard
 * mudasse.
 */
export function BudgetCard({
  budget,
  concessionariaNome,
  formattedDate,
  isFinalizing,
  isDuplicating,
  menuOpen,
  moveMenuOpen,
  moveTargets,
  onOpen,
  onToggleMenu,
  onCloseMenu,
  onToggleMoveMenu,
  onEdit,
  onDuplicate,
  onFinalize,
  onToggleTemplate,
  onMoveTo,
  onRemoveFromFolder,
  onDelete,
}: BudgetCardProps) {
  const { ref, isDragging } = useDraggable({
    id: draggableId('budget', budget.id),
    type: 'item',
    // Menu aberto desliga o arrasto: puxar um item do dropdown não deve sair
    // arrastando o cartão inteiro.
    disabled: menuOpen,
  });

  const guard = useDragToOpenGuard(onOpen);

  return (
    <Card
      ref={ref}
      state={isDragging ? 'dragging' : 'default'}
      className={cn(
        // `touch-pan-y`: o dedo ainda rola a lista por cima do cartão; o
        // arrasto sai do atraso de 250 ms do sensor de toque.
        'group touch-pan-y select-none rounded-xl',
        isDragging ? 'cursor-grabbing' : 'cursor-grab hover:-translate-y-0.5 hover:shadow-lg',
        menuOpen && 'z-40',
      )}
      {...guard}
    >
      <div
        className={cn(
          'absolute left-0 top-4 bottom-4 w-1 rounded-full',
          budget.status === 'Finalizado' ? 'bg-green-400' : 'bg-teal-400',
        )}
      />

      <div className="p-4 pl-5">
        <div className="mb-3 flex items-start justify-between">
          <div className="min-w-0 flex-1 pr-3">
            <div className="mb-1 flex items-center gap-1.5">
              <h3 className="truncate text-base font-semibold text-gray-900 transition-colors group-hover:text-neutral-900">
                {budget.nome}
              </h3>
              {budget.isTemplate && (
                <Star className="h-3.5 w-3.5 shrink-0 text-purple-500" fill="currentColor" />
              )}
            </div>
            {budget.clientName && (
              <p className="truncate text-sm text-gray-600">{budget.clientName}</p>
            )}
          </div>

          <div className="flex shrink-0 flex-col items-end gap-1.5">
            {budget.status === 'Finalizado' ? (
              <Badge tone="green">
                <CheckCircle className="h-3 w-3" />
                Finalizado
              </Badge>
            ) : (
              <Badge tone="teal">
                <Clock className="h-3 w-3" />
                Em Andamento
              </Badge>
            )}
            {budget.isTemplate && <Badge tone="purple">Modelo</Badge>}
          </div>
        </div>

        <div className="mb-3 flex items-center justify-between border-b border-gray-100 pb-3 text-sm text-gray-600">
          <div className="flex min-w-0 items-center">
            <Building2 className="mr-1.5 h-3.5 w-3.5 shrink-0 text-gray-400" />
            <span className="truncate">{concessionariaNome}</span>
          </div>
          <div className="flex shrink-0 items-center pl-2">
            <Calendar className="mr-1.5 h-3.5 w-3.5 text-gray-400" />
            <span>{formattedDate}</span>
          </div>
        </div>

        <div
          data-no-open
          className="relative flex items-center justify-end space-x-0.5 opacity-80 transition-opacity group-hover:opacity-100"
        >
          {budget.status !== 'Finalizado' && (
            <Button variant="ghost" size="icon" onClick={onEdit} title="Editar">
              <Edit className="h-4 w-4" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={onDuplicate}
            disabled={isDuplicating}
            title="Duplicar"
          >
            <Copy className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={onToggleMenu} title="Mais opções">
            <MoreVertical className="h-4 w-4" />
          </Button>

          {menuOpen && (
            <BudgetActionsMenu
              budget={budget}
              isFinalizing={isFinalizing}
              moveMenuOpen={moveMenuOpen}
              moveTargets={moveTargets}
              onCloseMenu={onCloseMenu}
              onToggleMoveMenu={onToggleMoveMenu}
              onFinalize={onFinalize}
              onToggleTemplate={onToggleTemplate}
              onMoveTo={onMoveTo}
              onRemoveFromFolder={onRemoveFromFolder}
              onDelete={onDelete}
            />
          )}
        </div>
      </div>
    </Card>
  );
}
