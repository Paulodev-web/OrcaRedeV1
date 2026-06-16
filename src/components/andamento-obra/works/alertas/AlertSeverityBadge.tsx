import type { AlertSeverity } from '@/types/works';
import { ALERT_SEVERITY_LABELS } from '@/types/works';

const CONFIG: Record<AlertSeverity, string> = {
  low: 'bg-gray-100 text-gray-700',
  medium: 'bg-amber-100 text-amber-700',
  high: 'bg-orange-100 text-orange-700',
  critical: 'bg-red-100 text-red-700',
};

interface Props {
  severity: AlertSeverity;
}

export function AlertSeverityBadge({ severity }: Props) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${CONFIG[severity]}`}>
      {ALERT_SEVERITY_LABELS[severity]}
    </span>
  );
}
