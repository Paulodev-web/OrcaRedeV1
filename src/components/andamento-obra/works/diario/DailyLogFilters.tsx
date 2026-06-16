'use client';

import { Filter } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { DailyLogStatus } from '@/types/works';

export type DailyLogStatusFilter = 'all' | DailyLogStatus;

export interface DailyLogFiltersValue {
  status: DailyLogStatusFilter;
  /** YYYY-MM (mes) ou null para "todos". */
  month: string | null;
}

interface DailyLogFiltersProps {
  value: DailyLogFiltersValue;
  onChange: (next: DailyLogFiltersValue) => void;
  /** Lista de meses disponiveis no formato YYYY-MM (descendente). */
  monthOptions: string[];
}

const STATUS_TABS: { id: DailyLogStatusFilter; label: string }[] = [
  { id: 'all', label: 'Todos' },
  { id: 'pending_approval', label: 'Pendentes' },
  { id: 'approved', label: 'Aprovados' },
  { id: 'rejected', label: 'Rejeitados' },
];

export function DailyLogFilters({ value, onChange, monthOptions }: DailyLogFiltersProps) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-gray-200 bg-white p-3">
      <div className="flex items-center gap-1.5 text-xs font-medium text-gray-600">
        <Filter className="h-3.5 w-3.5" />
        Filtros:
      </div>

      <div className="flex items-center gap-1">
        {STATUS_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => onChange({ ...value, status: t.id })}
            className={cn(
              'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
              value.status === t.id
                ? 'bg-[#64ABDE]/15 text-[#1D3140]'
                : 'text-gray-600 hover:bg-gray-100',
            )}
            aria-pressed={value.status === t.id}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="ml-auto flex items-center gap-2 text-xs text-gray-600">
        <label htmlFor="dl-month" className="font-medium">
          Mês:
        </label>
        <select
          id="dl-month"
          value={value.month ?? ''}
          onChange={(e) =>
            onChange({ ...value, month: e.target.value === '' ? null : e.target.value })
          }
          className="rounded-md border border-gray-200 bg-white px-2 py-1 text-xs"
        >
          <option value="">Todos</option>
          {monthOptions.map((m) => (
            <option key={m} value={m}>
              {formatMonth(m)}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

function formatMonth(ym: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(ym);
  if (!m) return ym;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const dt = new Date(Date.UTC(y, mo - 1, 1));
  return dt.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}
