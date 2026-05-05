import type { AlertStatus } from '@/types/works';
import { ALERT_STATUS_LABELS } from '@/types/works';

const CONFIG: Record<AlertStatus, string> = {
  open: 'bg-red-100 text-red-700',
  in_progress: 'bg-blue-100 text-blue-700',
  resolved_in_field: 'bg-amber-100 text-amber-700',
  closed: 'bg-green-100 text-green-700',
};

interface Props {
  status: AlertStatus;
}

export function AlertStatusBadge({ status }: Props) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${CONFIG[status]}`}>
      {ALERT_STATUS_LABELS[status]}
    </span>
  );
}
