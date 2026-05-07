import { ListChecks } from 'lucide-react';
import type { MilestoneStatus } from '@/types/works';
import { MILESTONE_STATUS_LABEL } from './MilestoneStatusBadge';

const STATUS_ORDER: MilestoneStatus[] = [
  'approved',
  'awaiting_approval',
  'in_progress',
  'rejected',
  'pending',
];

const STATUS_DOT: Record<MilestoneStatus, string> = {
  pending: 'bg-gray-300',
  in_progress: 'bg-sky-400',
  awaiting_approval: 'bg-amber-400',
  approved: 'bg-emerald-500',
  rejected: 'bg-red-500',
};

interface MilestoneStatusSummaryProps {
  counts: Record<MilestoneStatus, number>;
}

export function MilestoneStatusSummary({ counts }: MilestoneStatusSummaryProps) {
  const total = STATUS_ORDER.reduce((acc, s) => acc + (counts[s] ?? 0), 0);
  const approved = counts.approved ?? 0;
  const pct = total > 0 ? Math.round((approved / total) * 100) : 0;

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <header className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
          <ListChecks className="h-3.5 w-3.5" />
          Resumo de marcos
        </h3>
        <span className="text-xs font-medium text-[#1D3140]">
          {approved} / {total} ({pct}%)
        </span>
      </header>

      <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {STATUS_ORDER.map((s) => (
          <li
            key={s}
            className="flex items-center gap-2 rounded-md border border-gray-100 bg-gray-50 px-2 py-1.5 text-xs"
          >
            <span className={`h-2 w-2 rounded-full ${STATUS_DOT[s]}`} aria-hidden />
            <span className="flex-1 text-gray-700">{MILESTONE_STATUS_LABEL[s]}</span>
            <span className="font-semibold text-[#1D3140]">{counts[s] ?? 0}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
