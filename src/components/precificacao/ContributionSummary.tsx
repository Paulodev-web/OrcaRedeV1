"use client";

import type { ContributionMarginResult } from './types';

interface ContributionSummaryProps {
  result: ContributionMarginResult;
}

const currencyFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

const percentFormatter = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function formatPercent(value: number, hasReceita: boolean): string {
  if (!hasReceita) {
    return '--';
  }

  return `${percentFormatter.format(value)}%`;
}

export function ContributionSummary({ result }: ContributionSummaryProps) {
  const hasReceita = result.receitaBruta > 0;
  const lucroNegativo = result.lucroLiquido < 0;
  const mcNegativa = result.margemContribuicao < 0;

  const cards: Array<{ label: string; value: string; sub?: string; emphasis?: 'positive' | 'negative' | 'neutral' }> = [
    {
      label: 'Receita Bruta',
      value: currencyFormatter.format(result.receitaBruta),
      sub: hasReceita ? '100,00% (base de cálculo)' : 'Importe um orçamento ou informe a RB.',
    },
    {
      label: 'Total de Custos',
      value: currencyFormatter.format(result.totalCustos),
      sub: `${formatPercent(result.totalCustosPercent, hasReceita)} da Receita Bruta`,
    },
    {
      label: 'Margem de Contribuição',
      value: currencyFormatter.format(result.margemContribuicao),
      sub: `${formatPercent(result.margemContribuicaoPercent, hasReceita)} da Receita Bruta`,
      emphasis: mcNegativa ? 'negative' : 'positive',
    },
    {
      label: 'Imposto',
      value: currencyFormatter.format(result.impostoValor),
      sub: `${percentFormatter.format(result.impostoPercent)}% sobre MC · ${formatPercent(
        result.impostoSobreReceitaPercent,
        hasReceita
      )} da RB`,
    },
    {
      label: 'Lucro Líquido',
      value: currencyFormatter.format(result.lucroLiquido),
      sub: `${formatPercent(result.lucroLiquidoPercent, hasReceita)} da Receita Bruta`,
      emphasis: lucroNegativo ? 'negative' : 'positive',
    },
  ];

  return (
    <aside className="space-y-4 lg:sticky lg:top-6">
      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-[#1D3140]">Resumo Financeiro</h2>

        <div className="mt-4 grid gap-3">
          {cards.map((card) => (
            <div
              key={card.label}
              className={`rounded-lg border p-3 ${
                card.emphasis === 'positive'
                  ? 'border-emerald-200 bg-emerald-50'
                  : card.emphasis === 'negative'
                    ? 'border-red-200 bg-red-50'
                    : 'border-gray-100 bg-gray-50'
              }`}
            >
              <p className="text-xs uppercase tracking-wide text-gray-500">{card.label}</p>
              <p
                className={`mt-1 text-xl font-semibold ${
                  card.emphasis === 'negative' ? 'text-red-700' : 'text-[#1D3140]'
                }`}
              >
                {card.value}
              </p>
              {card.sub && <p className="mt-0.5 text-[11px] text-gray-500">{card.sub}</p>}
            </div>
          ))}
        </div>

        {mcNegativa && hasReceita && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            Os custos variáveis ultrapassaram a Receita Bruta. A operação está com margem negativa.
          </div>
        )}
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <h3 className="text-sm font-semibold text-[#1D3140]">Detalhamento dos Custos</h3>
        <p className="mt-1 text-xs text-gray-500">Cada custo com seu peso sobre a Receita Bruta.</p>

        <div className="mt-3 space-y-2 text-sm">
          {result.custos.length === 0 ? (
            <p className="rounded-md bg-gray-50 px-2 py-3 text-center text-xs text-gray-500">
              Nenhum custo cadastrado.
            </p>
          ) : (
            result.custos.map((custo) => (
              <div key={custo.id} className="flex items-center justify-between gap-2 rounded-md bg-gray-50 px-2 py-1.5">
                <span className="truncate text-gray-600" title={custo.descricao || 'Custo sem descrição'}>
                  {custo.descricao || 'Custo sem descrição'}
                </span>
                <span className="flex items-baseline gap-2 whitespace-nowrap">
                  <span className="font-medium text-[#1D3140]">{currencyFormatter.format(custo.valor)}</span>
                  <span className="text-[11px] text-gray-500">
                    {hasReceita ? `${percentFormatter.format(custo.percentualReceita)}%` : '--'}
                  </span>
                </span>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <h3 className="text-sm font-semibold text-[#1D3140]">Exportação</h3>
        <div className="mt-3 grid gap-2">
          <button
            type="button"
            disabled
            className="h-10 rounded-lg border border-gray-200 bg-gray-50 text-sm font-medium text-gray-500"
          >
            PDF Cliente
          </button>
          <button
            type="button"
            disabled
            className="h-10 rounded-lg border border-gray-200 bg-gray-50 text-sm font-medium text-gray-500"
          >
            PDF Detalhado
          </button>
        </div>
      </div>
    </aside>
  );
}
