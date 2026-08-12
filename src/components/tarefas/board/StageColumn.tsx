'use client';

import { useDroppable } from '@dnd-kit/react';
import { cn } from '@/lib/utils';
import { TaskCardView } from './TaskCardView';
import { useBoard, columnSector, columnStage, isAvulsaKey, type ColumnKey } from './BoardProvider';
import {
  TASK_SECTOR_LABELS,
  TASK_SECTOR_TONE,
  TASK_STAGE_META,
  type SectorTone,
} from '@/types/tasks';

interface StageColumnProps {
  columnKey: ColumnKey;
}

/**
 * Faixa de 2px no topo da coluna, na cor do setor dono.
 *
 * É o que torna legível o vaivém Comercial → Engenharia → Comercial →
 * Engenharia, que é o coração da operação e era invisível quando cada setor
 * tinha um quadro separado. Só a faixa e o rótulo levam cor — o corpo da coluna
 * fica neutro, senão quatro matizes chapadas competiriam com o conteúdo.
 */
const TONE_RULE: Record<SectorTone, string> = {
  blue: 'bg-accent-500',
  teal: 'bg-teal-500',
  amber: 'bg-amber-500',
  purple: 'bg-purple-500',
};

const TONE_TEXT: Record<SectorTone, string> = {
  blue: 'text-accent-700',
  teal: 'text-teal-700',
  amber: 'text-amber-700',
  purple: 'text-purple-700',
};

export function StageColumn({ columnKey }: StageColumnProps) {
  const { visibleIds, cards, columns, filters } = useBoard();

  const stage = columnStage(columnKey);
  const sector = columnSector(columnKey);
  const meta = stage ? TASK_STAGE_META[stage] : null;
  const avulsa = isAvulsaKey(columnKey);

  const { ref, isDropTarget } = useDroppable({
    id: columnKey,
    type: 'column',
    accept: 'card',
  });

  const ids = visibleIds(columnKey);
  const totalInColumn = (columns[columnKey] ?? []).length;
  const tone = sector ? TASK_SECTOR_TONE[sector] : null;

  // Setor em foco não esconde os outros — apenas destaca. Enxergar a fila do
  // vizinho é justamente o que a esteira veio resolver.
  const focused = filters.sector === null || filters.sector === sector;

  const title = meta
    ? meta.shortLabel
    : `Avulsas · ${sector ? TASK_SECTOR_LABELS[sector] : ''}`;

  return (
    <section
      ref={ref}
      className={cn(
        'flex w-[286px] shrink-0 flex-col rounded-xl border border-neutral-200 bg-neutral-50',
        'transition-[background-color,border-color,opacity] duration-150',
        isDropTarget && 'border-accent-300 bg-accent-50',
        !focused && 'opacity-60',
      )}
      aria-label={title}
    >
      <div className={cn('h-0.5 rounded-t-xl', tone ? TONE_RULE[tone] : 'bg-neutral-300')} />

      <header className="flex items-baseline justify-between gap-2 px-3 pb-2 pt-2.5">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold text-neutral-900">{title}</h2>
          {sector && tone && !avulsa && (
            <p className={cn('text-[10px] font-medium uppercase tracking-wide', TONE_TEXT[tone])}>
              {TASK_SECTOR_LABELS[sector]}
            </p>
          )}
        </div>
        <span className="shrink-0 rounded-full bg-neutral-200 px-2 py-0.5 text-[11px] font-medium text-neutral-600">
          {ids.length === totalInColumn ? ids.length : `${ids.length}/${totalInColumn}`}
        </span>
      </header>

      <div
        className={cn(
          'flex min-h-24 flex-1 flex-col gap-2 px-2 pb-2',
          isDropTarget &&
            'rounded-b-xl outline-1 outline-dashed outline-accent-300 -outline-offset-4',
        )}
      >
        {ids.length === 0 ? (
          <p className="rounded-lg border border-dashed border-neutral-300 px-3 py-5 text-center text-[11px] leading-relaxed text-neutral-400">
            {meta?.hint ?? 'Nada aqui.'}
          </p>
        ) : (
          ids.map((id, index) => (
            <TaskCardView key={id} card={cards[id]} index={index} columnKey={columnKey} />
          ))
        )}
      </div>
    </section>
  );
}
