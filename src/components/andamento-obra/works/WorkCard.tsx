'use client';

import Link from 'next/link';
import { User, Calendar } from 'lucide-react';
import { formatRelativeTime } from '@/lib/formatRelativeTime';
import { STATUS_LABELS, type WorkStatus, type WorkWithManager } from '@/types/works';
import { ImportedBudgetBadge } from './ImportedBudgetBadge';

interface WorkCardProps {
  work: WorkWithManager;
}

const STATUS_BADGE: Record<WorkStatus, string> = {
  planned: 'bg-blue-50 text-blue-700 ring-blue-200',
  in_progress: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  paused: 'bg-amber-50 text-amber-700 ring-amber-200',
  completed: 'bg-gray-100 text-gray-600 ring-gray-200',
  cancelled: 'bg-red-50 text-red-700 ring-red-200',
};

export function WorkCard({ work }: WorkCardProps) {
  return (
    <Link
      href={`/tools/andamento-obra/obras/${work.id}`}
      className="block rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition-all hover:border-[#64ABDE]/50 hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold text-[#1D3140]">{work.name}</h3>
          {work.clientName && (
            <p className="mt-0.5 truncate text-xs text-gray-500">{work.clientName}</p>
          )}
        </div>
        <span
          className={`inline-flex flex-shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-medium uppercase ring-1 ${STATUS_BADGE[work.status]}`}
        >
          {STATUS_LABELS[work.status]}
        </span>
      </div>

      <div className="mt-3 space-y-1.5 text-xs text-gray-600">
        <div className="flex items-center gap-1.5">
          <User className="h-3.5 w-3.5 text-gray-400" />
          <span className="truncate">{work.managerName ?? 'Sem gerente atribuído'}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Calendar className="h-3.5 w-3.5 text-gray-400" />
          <span>Atualizada {formatRelativeTime(work.lastActivityAt)}</span>
        </div>
        {work.budgetId && (
          <div className="pt-0.5">
            <ImportedBudgetBadge />
          </div>
        )}
      </div>
    </Link>
  );
}
