import { CheckCircle2, Circle, Clock, PlayCircle, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { MilestoneStatus } from '@/types/works';

const STATUS_LABEL: Record<MilestoneStatus, string> = {
  pending: 'Pendente',
  in_progress: 'Em andamento',
  awaiting_approval: 'Aguardando',
  approved: 'Aprovado',
  rejected: 'Rejeitado',
};

const STATUS_STYLE: Record<MilestoneStatus, string> = {
  pending: 'bg-gray-50 text-gray-700 ring-gray-200',
  in_progress: 'bg-sky-50 text-sky-800 ring-sky-200',
  awaiting_approval: 'bg-amber-50 text-amber-800 ring-amber-200',
  approved: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  rejected: 'bg-red-50 text-red-800 ring-red-200',
};

const STATUS_ICON: Record<MilestoneStatus, typeof Circle> = {
  pending: Circle,
  in_progress: PlayCircle,
  awaiting_approval: Clock,
  approved: CheckCircle2,
  rejected: XCircle,
};

export function MilestoneStatusBadge({ status }: { status: MilestoneStatus }) {
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

export const MILESTONE_STATUS_LABEL = STATUS_LABEL;
