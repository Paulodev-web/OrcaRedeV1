import { HardHat, Flag, Radio } from 'lucide-react';
import type { WorkMilestone, WorkRow } from '@/types/works';
import type { WorkExecutionStats } from '@/services/works/getWorkExecutionStats';
import { formatRelativeTime } from '@/lib/formatRelativeTime';

interface WorkKPIsProps {
  work: WorkRow;
  milestones: WorkMilestone[];
  /** Total de postes planejados no snapshot da obra (0 se não houver snapshot). */
  postsPlanned: number;
  /** Postes realmente levantados em campo. */
  postsInstalled?: number;
  /** O que o campo executou: data do último registro. */
  execution?: WorkExecutionStats | null;
}

/**
 * Tres numeros sobre a EXECUCAO, nao sobre o calendario.
 *
 * Saiu "dias decorridos", que passa igual numa obra tocando e numa obra parada,
 * e saiu "alertas ativos", que agora e a faixa vermelha do topo e nao precisa
 * competir por espaco aqui. O card de metragem de rede saiu junto com o
 * lancamento de rede, que deixou de existir no produto.
 */
export function WorkKPIs({
  work,
  milestones,
  postsPlanned,
  postsInstalled = 0,
  execution = null,
}: WorkKPIsProps) {
  const totalMarcos = milestones.length;
  const marcosAprovados = milestones.filter((m) => m.status === 'approved').length;
  const marcosAguardando = milestones.filter((m) => m.status === 'awaiting_approval').length;

  const faltamPostes = Math.max(0, postsPlanned - postsInstalled);
  const ultimoRegistro = execution?.lastRecordAt ?? null;

  const kpis = [
    {
      icon: HardHat,
      label: 'Postes de pé',
      value: postsPlanned > 0 ? `${postsInstalled} / ${postsPlanned}` : String(postsInstalled),
      hint:
        postsPlanned > 0
          ? faltamPostes === 0
            ? 'Todos levantados'
            : `${faltamPostes} a levantar`
          : 'Sem projeto importado',
      alerta: false,
    },
    {
      icon: Flag,
      label: 'Marcos',
      value: totalMarcos > 0 ? `${marcosAprovados} / ${totalMarcos}` : '—',
      hint:
        marcosAguardando > 0
          ? `${marcosAguardando} aguardando você`
          : totalMarcos > 0
            ? 'Nada esperando aprovação'
            : 'Sem marcos',
      alerta: marcosAguardando > 0,
    },
    {
      icon: Radio,
      label: 'Último registro',
      value: ultimoRegistro ? formatRelativeTime(ultimoRegistro) : 'Nenhum',
      hint: ultimoRegistro
        ? new Date(ultimoRegistro).toLocaleDateString('pt-BR', {
            day: '2-digit',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit',
          })
        : 'O campo ainda não registrou nada',
      alerta: false,
    },
  ] as const;

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      {kpis.map((kpi) => {
        const Icon = kpi.icon;
        return (
          <div
            key={kpi.label}
            className={`rounded-xl border p-3 ${
              kpi.alerta ? 'border-amber-300 bg-amber-50' : 'border-gray-200 bg-surface'
            }`}
          >
            <div
              className={`flex items-center gap-2 text-xs font-medium ${
                kpi.alerta ? 'text-amber-700' : 'text-gray-500'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {kpi.label}
            </div>
            <p
              className={`mt-1 text-xl font-bold ${
                kpi.alerta ? 'text-amber-800' : 'text-neutral-900'
              }`}
            >
              {kpi.value}
            </p>
            <p className="mt-0.5 text-[11px] text-gray-400">{kpi.hint}</p>
          </div>
        );
      })}
    </div>
  );
}
