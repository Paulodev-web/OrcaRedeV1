import { Landmark, TrendingDown, TrendingUp } from 'lucide-react';
import type { DreResult } from '@/services/dre/types';

const currencyFormatter = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const percentFormatter = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

function formatPercent(value: number | null): string {
  if (value === null) return '—';
  return `${percentFormatter.format(value)}%`;
}

interface ComparisonRow {
  label: string;
  previsto: number;
  /** null quando a métrica não tem variação (ex.: Investimento é fixo). */
  realizado: number | null;
  /** Rótulo do lado "realizado" — muda para "Projetado" enquanto algum grupo está aberto (§4 do plano: nunca fingir que é real). */
  realizadoLabel: string;
  /** true = maior é melhor (lucro); false = menor é melhor (custo); undefined = neutro (investimento). */
  higherIsBetter?: boolean;
}

/**
 * Hero da DRE: 3 números grandes + comparativo Previsto × Realizado em barras.
 *
 * Sem gráfico de biblioteca — divs simples, seguindo o skill de dataviz: a
 * paleta do sistema (croma baixo, "azul empoeirado") não sustenta séries
 * categóricas distinguíveis (falhou no validador em todos os níveis
 * testados), então a cor aqui é sempre de STATUS (verde/vermelho, reservada e
 * já usada na tabela de variação), nunca identidade de categoria.
 *
 * A barra "Realizado" nunca usa `custoReal`/`lucroReal` enquanto algum grupo
 * está aberto — usa `custoProjetado`/`lucroProjetado` (que já mistura real
 * com orçado como proxy) e troca o rótulo para "Projetado". É a mesma garantia
 * do §4 do plano, só que visual: a barra nunca finge ser real antes de ser.
 */
export function DreHeroStats({ result }: { result: DreResult }) {
  const previstoLucro = result.contractValue - result.totalPlanejado;
  const todosFechados = result.gruposAbertos === 0;
  const realizadoLabel = todosFechados ? 'Real' : 'Projetado (parcial)';

  const rows: ComparisonRow[] = [
    {
      label: 'Investimento',
      previsto: result.contractValue,
      realizado: null,
      realizadoLabel: '',
    },
    {
      label: 'Custo da obra',
      previsto: result.totalPlanejado,
      realizado: result.custoReal ?? result.custoProjetado,
      realizadoLabel,
      higherIsBetter: false,
    },
    {
      label: 'Lucro da obra',
      previsto: previstoLucro,
      realizado: result.lucroReal ?? result.lucroProjetado,
      realizadoLabel,
      higherIsBetter: true,
    },
  ];

  const maxValue = Math.max(
    result.contractValue,
    result.totalPlanejado,
    result.custoProjetado,
    Math.abs(previstoLucro),
    Math.abs(result.lucroProjetado),
    result.custoReal ?? 0,
    Math.abs(result.lucroReal ?? 0),
    1
  );

  return (
    <div className="grid gap-4 lg:grid-cols-[repeat(3,minmax(0,1fr))]">
      <StatTile
        icon={Landmark}
        label="Investimento"
        value={currencyFormatter.format(result.contractValue)}
        detail={result.revenueSource === 'proposal' ? 'Proposta aceita' : 'Precificação principal'}
      />
      <StatTile
        icon={result.custoProjetado > result.totalPlanejado ? TrendingUp : TrendingDown}
        iconTone={result.custoProjetado > result.totalPlanejado ? 'red' : 'emerald'}
        label="Custo projetado"
        value={currencyFormatter.format(result.custoProjetado)}
        detail={`${currencyFormatter.format(result.totalPlanejado)} orçado`}
      />
      <StatTile
        icon={result.lucroProjetado >= previstoLucro ? TrendingUp : TrendingDown}
        iconTone={result.lucroProjetado >= previstoLucro ? 'emerald' : 'red'}
        label="Lucro projetado"
        value={currencyFormatter.format(result.lucroProjetado)}
        detail={`${formatPercent(result.margemProjetadaPercent)} de margem`}
      />

      <div className="rounded-2xl border border-gray-200 bg-surface p-4 shadow-sm lg:col-span-3">
        <h3 className="text-sm font-semibold text-neutral-900">Previsto × Realizado</h3>
        <div className="mt-4 space-y-4">
          {rows.map((row) => (
            <ComparisonBarRow key={row.label} row={row} maxValue={maxValue} />
          ))}
        </div>
      </div>
    </div>
  );
}

function StatTile({
  icon: Icon,
  iconTone = 'accent',
  label,
  value,
  detail,
}: {
  icon: typeof Landmark;
  iconTone?: 'accent' | 'emerald' | 'red';
  label: string;
  value: string;
  detail: string;
}) {
  const toneClass =
    iconTone === 'emerald'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
      : iconTone === 'red'
        ? 'border-red-200 bg-red-50 text-red-700'
        : 'border-accent-500/30 bg-accent-500/10 text-accent-700';

  return (
    <div className="rounded-2xl border border-gray-200 bg-surface p-4 shadow-sm">
      <div className={`inline-flex h-9 w-9 items-center justify-center rounded-xl border ${toneClass}`}>
        <Icon className="h-4 w-4" />
      </div>
      <p className="mt-3 text-xs uppercase tracking-wide text-gray-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-neutral-900">{value}</p>
      <p className="mt-1 text-xs text-gray-500">{detail}</p>
    </div>
  );
}

function ComparisonBarRow({ row, maxValue }: { row: ComparisonRow; maxValue: number }) {
  const previstoPct = Math.min((Math.abs(row.previsto) / maxValue) * 100, 100);
  const realizadoPct = row.realizado !== null ? Math.min((Math.abs(row.realizado) / maxValue) * 100, 100) : 0;

  const favoravel =
    row.realizado === null || row.higherIsBetter === undefined
      ? null
      : row.higherIsBetter
        ? row.realizado >= row.previsto
        : row.realizado <= row.previsto;

  const realizadoFillClass =
    favoravel === null ? 'bg-accent-600' : favoravel ? 'bg-emerald-600' : 'bg-red-600';

  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="font-medium text-neutral-900">{row.label}</span>
      </div>

      <div className="mt-1.5 flex items-center gap-2">
        <span className="w-20 shrink-0 text-[11px] text-gray-500">Previsto</span>
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-100">
          <div className="h-full rounded-full bg-gray-300" style={{ width: `${previstoPct}%` }} />
        </div>
        <span className="w-28 shrink-0 text-right text-[11px] font-medium text-gray-600">
          {currencyFormatter.format(row.previsto)}
        </span>
      </div>

      {row.realizado !== null && (
        <div className="mt-1 flex items-center gap-2">
          <span className="w-20 shrink-0 text-[11px] text-gray-500">{row.realizadoLabel}</span>
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-100">
            <div className={`h-full rounded-full ${realizadoFillClass}`} style={{ width: `${realizadoPct}%` }} />
          </div>
          <span className="w-28 shrink-0 text-right text-[11px] font-semibold text-neutral-900">
            {currencyFormatter.format(row.realizado)}
          </span>
        </div>
      )}
    </div>
  );
}
