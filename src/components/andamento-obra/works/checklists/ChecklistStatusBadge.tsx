import type { ChecklistStatus } from '@/types/works';

const CONFIG: Record<ChecklistStatus, { label: string; className: string }> = {
  pending: { label: 'Pendente', className: 'bg-gray-100 text-gray-700' },
  in_progress: { label: 'Em andamento', className: 'bg-blue-100 text-blue-700' },
  awaiting_validation: { label: 'Aguardando validação', className: 'bg-amber-100 text-amber-700' },
  validated: { label: 'Validado', className: 'bg-green-100 text-green-700' },
  returned: { label: 'Devolvido', className: 'bg-red-100 text-red-700' },
};

interface Props {
  status: ChecklistStatus;
}

export function ChecklistStatusBadge({ status }: Props) {
  const cfg = CONFIG[status] ?? CONFIG.pending;
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${cfg.className}`}>
      {cfg.label}
    </span>
  );
}
