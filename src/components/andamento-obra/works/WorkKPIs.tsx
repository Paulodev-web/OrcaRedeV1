import Link from 'next/link';
import { TrendingUp, HardHat, CalendarDays, AlertTriangle, ArrowUpRight } from 'lucide-react';
import type { WorkMilestone, WorkRow } from '@/types/works';

interface WorkKPIsProps {
  work: WorkRow;
  milestones: WorkMilestone[];
  /** Total de postes planejados no snapshot da obra (0 se não houver snapshot). */
  postsPlanned: number;
  /** Postes realmente instalados (Bloco 7). Default 0. */
  postsInstalled?: number;
  /** Alertas ativos (Bloco 8). Default 0. */
  alertsActive?: number;
  /** Alertas criticos ativos (Bloco 8). Default 0. */
  criticalAlertsActive?: number;
}

function daysSince(startDate: string | null): number | null {
  if (!startDate) return null;
  const start = new Date(startDate);
  if (Number.isNaN(start.getTime())) return null;
  const now = new Date();
  const diffMs = now.getTime() - start.getTime();
  return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
}

export function WorkKPIs({
  work,
  milestones,
  postsPlanned,
  postsInstalled = 0,
  alertsActive = 0,
  criticalAlertsActive = 0,
}: WorkKPIsProps) {
  const totalMilestones = milestones.length;
  const approvedMilestones = milestones.filter((m) => m.status === 'approved').length;
  const progressPct =
    totalMilestones === 0 ? 0 : Math.round((approvedMilestones / totalMilestones) * 100);
  const days = daysSince(work.startedAt);

  const polesValue =
    postsPlanned > 0 ? `${postsInstalled} / ${postsPlanned}` : '—';
  const polesHint =
    postsPlanned > 0
      ? `${postsPlanned} planejado${postsPlanned === 1 ? '' : 's'}`
      : 'Sem projeto importado';

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
      value: polesValue,
      hint: polesHint,
    },
    {
      icon: CalendarDays,
      label: 'Dias decorridos',
      value: days === null ? '—' : String(days),
      hint: work.startedAt
        ? `Início ${new Date(work.startedAt).toLocaleDateString('pt-BR')}`
        : 'Sem data de início',
    },
    {
      icon: AlertTriangle,
      label: 'Alertas ativos',
      value: String(alertsActive),
      hint: criticalAlertsActive > 0
        ? `${criticalAlertsActive} crítico${criticalAlertsActive > 1 ? 's' : ''}`
        : alertsActive === 0 ? 'Nenhum alerta aberto' : `${alertsActive} em aberto`,
    },
  ] as const;

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {kpis.map((kpi) => {
          const Icon = kpi.icon;
          const isCritical = kpi.label === 'Alertas ativos' && criticalAlertsActive > 0;
          return (
            <div
              key={kpi.label}
              className={`rounded-xl border p-3 ${isCritical ? 'border-red-300 bg-red-50' : 'border-gray-200 bg-white'}`}
            >
              <div className={`flex items-center gap-2 text-xs font-medium ${isCritical ? 'text-red-600' : 'text-gray-500'}`}>
                <Icon className="h-3.5 w-3.5" />
                {kpi.label}
                {isCritical && (
                  <span className="rounded-full bg-red-600 px-1.5 py-0.5 text-[9px] font-bold text-white">
                    CRÍTICO
                  </span>
                )}
              </div>
              <p className={`mt-1 text-xl font-bold ${isCritical ? 'text-red-700' : 'text-[#1D3140]'}`}>{kpi.value}</p>
              <p className="mt-0.5 text-[11px] text-gray-400">{kpi.hint}</p>
            </div>
          );
        })}
      </div>
      <div className="flex justify-end">
        <Link
          href={`/tools/andamento-obra/obras/${work.id}/progresso`}
          className="inline-flex items-center gap-1 text-xs font-medium text-[#64ABDE] hover:underline"
        >
          Status detalhado
          <ArrowUpRight className="h-3 w-3" />
        </Link>
      </div>
    </div>
  );
}
