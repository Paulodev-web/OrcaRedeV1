"use client";

import type { PricingCalculationResult } from '@/lib/pricingMath';

interface PricingSummaryProps {
  result: PricingCalculationResult;
}

const currencyFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

export function PricingSummary({ result }: PricingSummaryProps) {
  const cards = [
    { label: 'Custo Total (CD)', value: currencyFormatter.format(result.custoDireto) },
    { label: 'BDI Aplicado (%)', value: `${result.percentualBdi.toFixed(2)}%` },
    { label: 'Preço de Venda (PV)', value: result.precoVenda === null ? '--' : currencyFormatter.format(result.precoVenda) },
    { label: 'Lucro Estimado', value: result.lucroEstimado === null ? '--' : currencyFormatter.format(result.lucroEstimado) },
  ];

  return (
    <aside className="space-y-4 lg:sticky lg:top-6">
      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-[#1D3140]">Resumo Financeiro</h2>

        <div className="mt-4 grid gap-3">
          {cards.map((card) => (
            <div key={card.label} className="rounded-lg border border-gray-100 bg-gray-50 p-3">
              <p className="text-xs uppercase tracking-wide text-gray-500">{card.label}</p>
              <p className="mt-1 text-xl font-semibold text-[#1D3140]">{card.value}</p>
            </div>
          ))}
        </div>

        {result.isTaxaInvalida && (
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            A soma de DF + FI + Lucro + Impostos deve ser menor que 100% para calcular o PV.
          </div>
        )}
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <h3 className="text-sm font-semibold text-[#1D3140]">Composição do Preço</h3>
        <div className="mt-3 space-y-2 text-sm">
          <CompositionRow label="Materiais" value={result.composicao.materiais} />
          <CompositionRow label="Mão de obra" value={result.composicao.maoDeObra} />
          <CompositionRow label="Despesas fixas (DF)" value={result.composicao.despesasFixas} />
          <CompositionRow label="Despesas financeiras (FI)" value={result.composicao.despesasFinanceiras} />
          <CompositionRow label="Impostos" value={result.composicao.impostos} />
          <CompositionRow label="Lucro" value={result.composicao.lucro} />
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

function CompositionRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between rounded-md bg-gray-50 px-2 py-1.5">
      <span className="text-gray-600">{label}</span>
      <span className="font-medium text-[#1D3140]">{currencyFormatter.format(value)}</span>
    </div>
  );
}
