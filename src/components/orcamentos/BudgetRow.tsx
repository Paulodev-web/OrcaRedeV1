'use client';

import { useDraggable } from '@dnd-kit/react';
import { CheckCircle, Clock, Copy, Edit, FileText, MoreVertical, Star } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { BudgetActionsMenu } from './BudgetActionsMenu';
import type { BudgetCardProps } from './BudgetCard';
import { LIST_GRID } from './listLayout';
import { draggableId } from './dnd/dashboardDnd';
import { useDragToOpenGuard } from './dnd/useDragToOpenGuard';

/**
 * Orçamento na view em lista.
 *
 * Reaproveita `BudgetCardProps` de propósito: o `Dashboard` monta um único
 * objeto de props e só escolhe qual componente renderizar. Qualquer ação nova
 * que entre no cartão aparece aqui sem mudança no chamador.
 */
export function BudgetRow({
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
    disabled: menuOpen,
  });

  const guard = useDragToOpenGuard(onOpen);

  return (
    <div
      ref={ref}
      className={cn(
        // `touch-pan-y`: o dedo continua rolando a lista por cima da linha.
        'group relative touch-pan-y select-none px-3 py-2.5 transition-colors',
        isDragging ? 'cursor-grabbing opacity-50' : 'cursor-grab hover:bg-gray-50',
        menuOpen && 'z-40 bg-gray-50',
      )}
      {...guard}
    >
      <div className={LIST_GRID}>
        {/* Nome + cliente (o cliente só aqui no mobile, onde a coluna some) */}
        <div className="flex min-w-0 items-center gap-2.5">
          <FileText
            className={cn(
              'h-4 w-4 shrink-0',
              budget.status === 'Finalizado' ? 'text-green-500' : 'text-teal-500',
            )}
          />
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="truncate text-sm font-medium text-gray-900">{budget.nome}</span>
              {budget.isTemplate && (
                <Star className="h-3.5 w-3.5 shrink-0 text-purple-500" fill="currentColor" />
              )}
            </div>
            {budget.clientName && (
              <p className="truncate text-xs text-gray-500 md:hidden">{budget.clientName}</p>
            )}
          </div>
        </div>

        <div className="hidden min-w-0 md:block">
          <span className="truncate text-sm text-gray-600">{budget.clientName || '—'}</span>
        </div>

        <div className="hidden min-w-0 md:block">
          <span className="truncate text-sm text-gray-600">{concessionariaNome}</span>
        </div>

        <div className="hidden md:block">
          <span className="text-sm tabular-nums text-gray-500">{formattedDate}</span>
        </div>

        <div className="hidden md:flex md:items-center md:gap-1.5">
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
        </div>

        {/* Ações: os atalhos de editar/duplicar aparecem no hover, para a linha
            não virar uma fileira de ícones. O "⋮" fica sempre visível. */}
        <div data-no-open className="relative flex items-center justify-end">
          <div className="absolute right-10 hidden items-center gap-0.5 md:group-hover:flex">
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
          </div>

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
    </div>
  );
}
