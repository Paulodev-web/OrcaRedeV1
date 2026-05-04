import { TrendingUp, HardHat, CalendarDays, AlertTriangle } from 'lucide-react';
import type { WorkMilestone, WorkRow } from '@/types/works';

interface WorkKPIsProps {
  work: WorkRow;
  milestones: WorkMilestone[];
  /** Total de postes planejados no snapshot da obra (0 se não houver snapshot). */
  postsPlanned: number;
}

function daysSince(startDate: string | null): number | null {
  if (!startDate) return null;
  const start = new Date(startDate);
  if (Number.isNaN(start.getTime())) return null;
  const now = new Date();
  const diffMs = now.getTime() - start.getTime();
  return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
}

export function WorkKPIs({ work, milestones, postsPlanned }: WorkKPIsProps) {
  const totalMilestones = milestones.length;
  const approvedMilestones = milestones.filter((m) => m.status === 'approved').length;
  const progressPct = totalMilestones === 0 ? 0 : Math.round((approvedMilestones / totalMilestones) * 100);
  const days = daysSince(work.startedAt);

  const kpis = [
    {
      icon: TrendingUp,
      label: 'Progresso',
      value: `${progressPct}%`,
      hint: `${approvedMilestones}/${totalMilestones} marcos aprovados`,
    },
    {
      icon: HardHat,
      label: 'Postes instalados',
      value: '0',
      hint: `${postsPlanned} planejado${postsPlanned === 1 ? '' : 's'}`,
    },
    {
      icon: CalendarDays,
      label: 'Dias decorridos',
      value: days === null ? '—' : String(days),
      hint: work.startedAt ? `Início ${new Date(work.startedAt).toLocaleDateString('pt-BR')}` : 'Sem data de início',
    },
    {
      icon: AlertTriangle,
      label: 'Alertas ativos',
      value: '0',
      hint: 'Nenhum alerta aberto',
    },
  ] as const;

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {kpis.map((kpi) => {
        const Icon = kpi.icon;
        return (
          <div
            key={kpi.label}
            className="rounded-xl border border-gray-200 bg-white p-3"
          >
            <div className="flex items-center gap-2 text-xs font-medium text-gray-500">
              <Icon className="h-3.5 w-3.5" />
              {kpi.label}
            </div>
            <p className="mt-1 text-xl font-bold text-[#1D3140]">{kpi.value}</p>
            <p className="mt-0.5 text-[11px] text-gray-400">{kpi.hint}</p>
          </div>
        );
      })}
    </div>
  );
}
