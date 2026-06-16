import { CheckCircle2, Clock, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { DailyLogStatus } from '@/types/works';

const STATUS_LABEL: Record<DailyLogStatus, string> = {
  pending_approval: 'Pendente',
  approved: 'Aprovado',
  rejected: 'Rejeitado',
};

const STATUS_STYLE: Record<DailyLogStatus, string> = {
  pending_approval: 'bg-amber-50 text-amber-800 ring-amber-200',
  approved: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  rejected: 'bg-red-50 text-red-800 ring-red-200',
};

const STATUS_ICON: Record<DailyLogStatus, typeof CheckCircle2> = {
  pending_approval: Clock,
  approved: CheckCircle2,
  rejected: XCircle,
};

export function DailyLogStatusBadge({ status }: { status: DailyLogStatus }) {
  const Icon = STATUS_ICON[status];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1',
        STATUS_STYLE[status],
      )}
    >
      <Icon aria-hidden className="h-3 w-3" />
      {STATUS_LABEL[status]}
    </span>
  );
}
