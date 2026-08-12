'use client';

import { Search, UserCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useBoard } from './BoardProvider';
import { TASK_SECTORS, TASK_SECTOR_LABELS, type TaskSector } from '@/types/tasks';

/**
 * Filtros da esteira. Todos ESMAECEM em vez de esconder — enxergar a fila do
 * vizinho é o ponto do módulo, e sumir com ela reconstruiria os quatro quadros
 * isolados que a esteira veio substituir.
 */
export function BoardToolbar() {
  const { filters, setFilters, viewerSector, cards, viewerId } = useBoard();

  const mineCount = Object.values(cards).filter(
    (card) => card.assignedTo === viewerId && card.stage !== 'concluido' && card.stage !== 'perdido',
  ).length;

  const chip = (active: boolean) =>
    cn(
      'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
      active
        ? 'bg-surface text-neutral-900 shadow-2xs'
        : 'text-neutral-500 hover:text-neutral-900',
    );

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="inline-flex items-center gap-0.5 rounded-lg bg-neutral-100 p-1">
        <button type="button" onClick={() => setFilters({ sector: null })} className={chip(filters.sector === null)}>
          Toda a esteira
        </button>
        {TASK_SECTORS.map((sector: TaskSector) => (
          <button
            key={sector}
            type="button"
            onClick={() => setFilters({ sector })}
            className={chip(filters.sector === sector)}
          >
            {TASK_SECTOR_LABELS[sector]}
            {sector === viewerSector && (
              <span className="ml-1 text-[9px] uppercase text-neutral-400">você</span>
            )}
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={() => setFilters({ onlyMine: !filters.onlyMine })}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors',
          filters.onlyMine
            ? 'border-accent-300 bg-accent-50 text-accent-800'
            : 'border-neutral-300 bg-surface text-neutral-600 hover:bg-neutral-50',
        )}
        aria-pressed={filters.onlyMine}
      >
        <UserCheck className="h-3.5 w-3.5" aria-hidden />
        Só as minhas
        {mineCount > 0 && (
          <span className="rounded-full bg-neutral-200 px-1.5 text-[10px] text-neutral-700">
            {mineCount}
          </span>
        )}
      </button>

      <label className="relative">
        <Search
          className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-neutral-400"
          aria-hidden
        />
        <input
          type="search"
          value={filters.search}
          onChange={(e) => setFilters({ search: e.target.value })}
          placeholder="Buscar cliente ou título"
          aria-label="Buscar na esteira"
          className="h-8 w-52 rounded-lg border border-neutral-200/80 bg-surface/70 pl-8 pr-3 text-xs text-neutral-900 shadow-2xs focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/40"
        />
      </label>

      <button
        type="button"
        onClick={() => setFilters({ showTerminal: !filters.showTerminal })}
        className="rounded-lg px-2 py-1.5 text-xs font-medium text-neutral-500 transition-colors hover:text-neutral-900"
        aria-pressed={filters.showTerminal}
      >
        {filters.showTerminal ? 'Ocultar encerradas' : 'Mostrar encerradas'}
      </button>
    </div>
  );
}
