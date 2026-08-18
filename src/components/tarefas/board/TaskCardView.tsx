'use client';

import { useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useSortable } from '@dnd-kit/react/sortable';
import { CalendarDays, Lock, MessageSquare, Paperclip } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DRAG_ACTIVATION_DISTANCE } from '@/lib/dnd/sensors';
import { useBoard, type ColumnKey } from './BoardProvider';
import type { TaskCard } from '@/types/tasks';

interface TaskCardViewProps {
  card: TaskCard;
  index: number;
  columnKey: ColumnKey;
}

/** Iniciais do responsável — avatar sem foto, que o sistema não tem. */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function dueState(dueDate: string | null): { label: string; overdue: boolean } | null {
  if (!dueDate) return null;
  const due = new Date(`${dueDate}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return {
    label: due.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }),
    overdue: due < today,
  };
}

export function TaskCardView({ card, index, columnKey }: TaskCardViewProps) {
  const router = useRouter();
  const { landing, entering, matchesFilters } = useBoard();

  const { ref, isDragging, isDragSource } = useSortable({
    id: card.id,
    index,
    group: columnKey,
    type: 'card',
    // O card é alvo só de outros cards. Quem aceita cards para o caso da coluna
    // vazia é o droppable da própria coluna (`StageColumn`), com `accept:
    // 'card'` — declarar 'column' aqui fazia o card se anunciar como destino de
    // uma coluna inteira e sujava a detecção de colisão no momento de soltar.
    accept: 'card',
    data: { columnKey },
  });

  const due = dueState(card.dueDate);
  const landingDirection = landing[card.id];
  const isEntering = entering.has(card.id);
  const dimmed = !matchesFilters(card);

  // Onde o ponteiro desceu. Sem isso, soltar um card depois de arrastá-lo
  // dispara o `click` do elemento e a pessoa cai no detalhe sem querer — o
  // sintoma clássico de kanban com card clicável. O limiar é o MESMO que ativa
  // o arrasto (`DRAG_ACTIVATION_DISTANCE`): com dois números diferentes sobra
  // uma faixa em que o gesto não abre nem arrasta.
  const pointerDownAt = useRef<{ x: number; y: number } | null>(null);

  const openIfNotDragged = (x: number, y: number) => {
    const start = pointerDownAt.current;
    pointerDownAt.current = null;
    if (!start) return;
    const moved = Math.hypot(x - start.x, y - start.y);
    if (moved < DRAG_ACTIVATION_DISTANCE) router.push(`/tarefas/${card.id}`);
  };

  return (
    <article
      ref={ref}
      data-task-card
      data-dragging={isDragging ? 'true' : undefined}
      data-drag-source={isDragSource && !isDragging ? 'true' : undefined}
      onPointerDown={(e) => {
        pointerDownAt.current = { x: e.clientX, y: e.clientY };
      }}
      onPointerUp={(e) => openIfNotDragged(e.clientX, e.clientY)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') router.push(`/tarefas/${card.id}`);
      }}
      tabIndex={0}
      role="button"
      aria-label={card.title}
      className={cn(
        // `touch-pan-y` e não `touch-none`: no celular a esteira precisa rolar
        // com o dedo em cima de um card. Quem separa rolar de arrastar é o
        // atraso de 250 ms do sensor de toque — parou, arrasta; andou, rola.
        'group cursor-grab touch-pan-y rounded-lg border border-neutral-200 bg-surface p-3 text-left shadow-2xs',
        'transition-[box-shadow,opacity] duration-150 hover:shadow-sm',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500',
        card.blockedReason && 'border-l-2 border-l-red-500',
        dimmed && 'opacity-35',
        landingDirection === 'avanco' && 'animate-task-land-avanco',
        landingDirection === 'retorno' && 'animate-task-land-retorno',
        landingDirection === 'encerramento' && 'animate-task-land-encerramento',
        isEntering && 'animate-task-card-in',
      )}
    >
      <p className="line-clamp-2 text-sm font-medium text-neutral-900">{card.title}</p>

      {(card.clientName || card.budgetProjectName) && (
        <p className="mt-1 truncate text-xs text-neutral-500">
          {card.clientName ?? card.budgetProjectName}
        </p>
      )}

      {card.blockedReason && (
        <p className="mt-2 flex items-start gap-1.5 rounded-md bg-red-50 px-2 py-1 text-[11px] text-red-700">
          <Lock className="mt-px h-3 w-3 shrink-0" aria-hidden />
          <span className="line-clamp-2">{card.blockedReason}</span>
        </p>
      )}

      <div className="mt-2.5 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5 text-[11px] text-neutral-500">
          {due && (
            <span
              className={cn(
                'inline-flex items-center gap-1',
                due.overdue && 'font-medium text-red-600',
              )}
              title={due.overdue ? 'Prazo vencido' : 'Prazo'}
            >
              <CalendarDays className="h-3 w-3" aria-hidden />
              {due.label}
            </span>
          )}
          {card.messageCount > 0 && (
            <span className="inline-flex items-center gap-1" title={`${card.messageCount} mensagens`}>
              <MessageSquare className="h-3 w-3" aria-hidden />
              {card.messageCount}
            </span>
          )}
          {card.attachmentCount > 0 && (
            <span className="inline-flex items-center gap-1" title={`${card.attachmentCount} anexos`}>
              <Paperclip className="h-3 w-3" aria-hidden />
              {card.attachmentCount}
            </span>
          )}
        </div>

        {card.assignedToName ? (
          <span
            className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent-100 text-[10px] font-semibold text-accent-800"
            title={card.assignedToName}
          >
            {initials(card.assignedToName)}
          </span>
        ) : (
          <span
            className="inline-flex h-6 items-center rounded-full border border-dashed border-neutral-300 px-2 text-[10px] text-neutral-400"
            title="Ninguém assumiu ainda"
          >
            livre
          </span>
        )}
      </div>
    </article>
  );
}
