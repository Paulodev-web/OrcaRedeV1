'use client';

import React, { useState } from 'react';
import {
  AlertTriangle,
  Award,
  ChevronDown,
  Package,
  Shuffle,
  Table2,
  TrendingDown,
  Trophy,
} from 'lucide-react';
import type {
  ScenariosResult,
  ScenarioItem,
} from '@/actions/supplierQuotes';

const formatCurrency = (v: number) =>
  new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(v);

const formatNumber = (v: number) =>
  new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(v);

type QuoteSummary = {
  id: string;
  supplier_name: string;
  status: string;
  item_count: number;
  matched_count: number;
};

interface Props {
  scenarios: ScenariosResult;
  quotes: QuoteSummary[];
  sessionId: string;
}

const tabBtnClass = (active: boolean) =>
  `flex items-center gap-2 px-6 py-4 text-sm font-medium border-b-2 transition-colors ${
    active
      ? 'border-blue-600 text-blue-600'
      : 'border-transparent text-gray-500 hover:text-gray-700'
  }`;

// ---------------------------------------------------------------------------
// Summary cards
// ---------------------------------------------------------------------------
function ScenarioSummaryCards({ scenarios }: { scenarios: ScenariosResult }) {
  const { scenarioA, scenarioB, budget_total_reference } = scenarios;
  const bestSupplier = scenarioA[0];
  const hasSaving = scenarioB.saving_vs_cheapest_a > 0;

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <div className="rounded-xl border border-blue-100 bg-blue-50 p-5">
        <div className="flex items-center gap-2 mb-2">
          <Package className="h-5 w-5 text-blue-600" />
          <p className="text-xs text-blue-600 font-semibold uppercase tracking-wide">
            Cenário A — Pacote Fechado
          </p>
        </div>
        {bestSupplier && (
          <>
            <p className="text-2xl font-bold text-blue-800">
              {formatCurrency(bestSupplier.total_normalizado)}
            </p>
            <p className="text-sm text-blue-600 mt-1">
              Melhor: <span className="font-semibold">{bestSupplier.supplier_name}</span>
            </p>
            <p className="text-xs text-blue-400 mt-0.5">
              {bestSupplier.items_covered}/{bestSupplier.total_items} itens cobertos
            </p>
          </>
        )}
      </div>

      <div className="rounded-xl border border-sky-100 bg-sky-50 p-5">
        <div className="flex items-center gap-2 mb-2">
          <Shuffle className="h-5 w-5 text-sky-600" />
          <p className="text-xs text-sky-600 font-semibold uppercase tracking-wide">
            Cenário B — Melhor por Item
          </p>
        </div>
        <p className="text-2xl font-bold text-sky-800">
          {formatCurrency(scenarioB.total_normalizado)}
        </p>
        <p className="text-sm text-sky-600 mt-1">
          {scenarioB.items.length} materiais analisados
        </p>
      </div>

      <div
        className={`rounded-xl border p-5 ${
          hasSaving
            ? 'border-green-100 bg-green-50'
            : 'border-gray-100 bg-gray-50'
        }`}
      >
        <div className="flex items-center gap-2 mb-2">
          <TrendingDown
            className={`h-5 w-5 ${hasSaving ? 'text-green-600' : 'text-gray-500'}`}
          />
          <p
            className={`text-xs font-semibold uppercase tracking-wide ${
              hasSaving ? 'text-green-600' : 'text-gray-500'
            }`}
          >
            {hasSaving ? 'Economia potencial' : 'Diferença B vs. A'}
          </p>
        </div>
        <p
          className={`text-2xl font-bold ${
            hasSaving ? 'text-green-700' : 'text-gray-600'
          }`}
        >
          {hasSaving ? '−' : '+'}
          {formatCurrency(Math.abs(scenarioB.saving_vs_cheapest_a))}
        </p>
        {budget_total_reference > 0 && (
          <p className="text-xs text-gray-400 mt-1">
            vs. {formatCurrency(budget_total_reference)} do melhor pacote
          </p>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tabelona: cross-comparison table (material x supplier)
// ---------------------------------------------------------------------------
function TabelonaView({ scenarios }: { scenarios: ScenariosResult }) {
  const { scenarioB } = scenarios;

  const supplierSet = new Set<string>();
  for (const item of scenarioB.items) {
    for (const offer of item.all_offers) {
      supplierSet.add(offer.supplier_name);
    }
  }
  const suppliers = Array.from(supplierSet).sort((a, b) =>
    a.localeCompare(b, 'pt-BR')
  );

  if (scenarioB.items.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-sm text-gray-400">
        Nenhum dado disponível. Concilie as cotações primeiro.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-500">
        Comparação preço a preço, material a material. Preços normalizados para
        a unidade interna do sistema (preço ÷ fator de conversão). O menor preço por material está destacado.
      </p>
      <div className="overflow-x-auto border border-gray-200 rounded-lg">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="sticky left-0 z-10 bg-gray-50 px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[200px]">
                Material
              </th>
              <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider w-20">
                Qtd
              </th>
              {suppliers.map((s) => (
                <th
                  key={s}
                  className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[140px]"
                >
                  {s}
                </th>
              ))}
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-36">
                Melhor
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-100">
            {scenarioB.items.map((item) => {
              const offerMap = new Map(
                item.all_offers.map((o) => [o.supplier_name, o])
              );
              const bestPrice = Math.min(
                ...item.all_offers.map((o) => o.preco_normalizado)
              );

              return (
                <tr key={item.material_id} className="hover:bg-gray-50">
                  <td className="sticky left-0 z-10 bg-white px-4 py-3">
                    <p className="font-medium text-gray-900 truncate max-w-[240px]">
                      {item.material_name}
                    </p>
                    <p className="text-xs text-gray-400 font-mono">
                      {item.material_code}
                    </p>
                  </td>
                  <td className="px-3 py-3 text-right text-gray-600">
                    {formatNumber(item.quantidade)}
                  </td>
                  {suppliers.map((s) => {
                    const offer = offerMap.get(s);
                    if (!offer) {
                      return (
                        <td
                          key={s}
                          className="px-4 py-3 text-right text-gray-300"
                        >
                          —
                        </td>
                      );
                    }
                    const isBest = offer.preco_normalizado === bestPrice;
                    return (
                      <td
                        key={s}
                        className={`px-4 py-3 text-right ${
                          isBest
                            ? 'bg-green-50 font-bold text-green-700'
                            : 'text-gray-700'
                        }`}
                      >
                        <p>{formatCurrency(offer.preco_normalizado)}</p>
                        {offer.conversion_factor !== 1 && (
                          <p className="text-xs text-gray-400 font-normal">
                            ÷{formatNumber(offer.conversion_factor)}
                          </p>
                        )}
                      </td>
                    );
                  })}
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-50 border border-green-200 px-2 py-1 rounded-full">
                      <Award className="h-3 w-3" />
                      {item.best_supplier}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ranking: Cenário A (pacote fechado) + Cenário B (melhor preço por item)
// ---------------------------------------------------------------------------
function RankingView({ scenarios }: { scenarios: ScenariosResult }) {
  const [rankingTab, setRankingTab] = useState<'A' | 'B'>('A');

  return (
    <div className="space-y-4">
      <div className="flex border-b border-gray-200">
        <button
          type="button"
          onClick={() => setRankingTab('A')}
          className={tabBtnClass(rankingTab === 'A')}
        >
          <Package className="h-4 w-4" />
          Cenário A — Pacote Fechado
        </button>
        <button
          type="button"
          onClick={() => setRankingTab('B')}
          className={tabBtnClass(rankingTab === 'B')}
        >
          <Shuffle className="h-4 w-4" />
          Cenário B — Melhor Preço por Item
          {scenarios.scenarioB.saving_vs_cheapest_a > 0 && (
            <span className="ml-1 inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-green-100 text-green-700 text-xs rounded-full border border-green-200">
              <TrendingDown className="h-3 w-3" />
              Economia
            </span>
          )}
        </button>
      </div>

      <div className="pt-2">
        {rankingTab === 'A' && <ScenarioAView scenarios={scenarios} />}
        {rankingTab === 'B' && <ScenarioBView scenarios={scenarios} />}
      </div>
    </div>
  );
}

function ScenarioAView({ scenarios }: { scenarios: ScenariosResult }) {
  const { scenarioA } = scenarios;

  if (scenarioA.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-sm text-gray-400">
        Nenhum dado disponível.
      </div>
    );
  }

  const cheapest = scenarioA[0];

  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-500">
        Comprar tudo de um único fornecedor. Preços normalizados por unidade
        interna do sistema.
      </p>
      <div className="overflow-x-auto border border-gray-200 rounded-lg">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Fornecedor
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider w-32">
                Itens cobertos
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider w-40">
                Total normalizado
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-100">
            {scenarioA.map((supplier, idx) => {
              const isBest = idx === 0;
              const diff =
                supplier.total_normalizado - cheapest.total_normalizado;
              const pctDiff =
                cheapest.total_normalizado > 0
                  ? (diff / cheapest.total_normalizado) * 100
                  : 0;

              return (
                <tr
                  key={supplier.quote_id}
                  className={
                    isBest
                      ? 'bg-green-50'
                      : 'hover:bg-gray-50 transition-colors'
                  }
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {isBest && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-100 text-green-700 text-xs font-medium rounded-full border border-green-200">
                          <Award className="h-3 w-3" />
                          Mais barato
                        </span>
                      )}
                      <span className="text-sm font-medium text-gray-900">
                        {supplier.supplier_name}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right text-sm text-gray-700">
                    {supplier.items_covered} / {supplier.total_items}
                    <div className="w-full bg-gray-100 rounded-full h-1 mt-1">
                      <div
                        className="bg-blue-400 h-1 rounded-full"
                        style={{
                          width: `${Math.round(
                            (supplier.items_covered / supplier.total_items) * 100
                          )}%`,
                        }}
                      />
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <p
                      className={`text-sm font-bold ${
                        isBest ? 'text-green-700' : 'text-gray-900'
                      }`}
                    >
                      {formatCurrency(supplier.total_normalizado)}
                    </p>
                    {!isBest && diff > 0 && (
                      <p className="text-xs text-red-500 mt-0.5">
                        +{formatCurrency(diff)} (+{formatNumber(pctDiff)}%)
                      </p>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ScenarioBView({ scenarios }: { scenarios: ScenariosResult }) {
  const { scenarioB } = scenarios;
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (scenarioB.items.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-sm text-gray-400">
        Nenhum item com cotações múltiplas disponível.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-500">
        Fracionar a compra: cada item é adquirido do fornecedor com menor preço
        normalizado.
      </p>

      <div className="overflow-x-auto border border-gray-200 rounded-lg">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Material
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-36">
                Melhor fornecedor
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider w-32">
                Preço unit. norm.
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider w-32">
                Total
              </th>
              <th className="px-4 py-3 w-8" />
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-100">
            {scenarioB.items.map((item: ScenarioItem) => {
              const isExpanded = expandedId === item.material_id;
              const hasMultipleOffers = item.all_offers.length > 1;

              return (
                <React.Fragment key={item.material_id}>
                  <tr
                    className={`hover:bg-gray-50 transition-colors ${
                      isExpanded ? 'bg-blue-50' : ''
                    }`}
                  >
                    <td className="px-4 py-3">
                      <p className="text-sm font-medium text-gray-900">
                        {item.material_name}
                      </p>
                      <p className="text-xs text-gray-400">
                        <span className="font-mono">{item.material_code}</span>
                        {' · '}Qtd {formatNumber(item.quantidade)}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-50 border border-green-200 px-2 py-1 rounded-full">
                        <Award className="h-3 w-3" />
                        {item.best_supplier}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <p className="text-sm font-bold text-gray-900">
                        {formatCurrency(item.best_price_normalized)}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <p className="text-sm font-semibold text-blue-700">
                        {formatCurrency(item.best_total)}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {hasMultipleOffers && (
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedId(isExpanded ? null : item.material_id)
                          }
                          className="p-1 text-gray-400 hover:text-gray-600 rounded transition-colors"
                        >
                          <ChevronDown
                            className={`h-4 w-4 transition-transform ${
                              isExpanded ? 'rotate-180' : ''
                            }`}
                          />
                        </button>
                      )}
                    </td>
                  </tr>

                  {isExpanded && (
                    <tr key={`${item.material_id}-expanded`}>
                      <td colSpan={5} className="px-4 pb-4 pt-0 bg-blue-50">
                        <div className="mt-2 border border-blue-200 rounded-lg overflow-hidden">
                          <table className="min-w-full divide-y divide-blue-100">
                            <thead className="bg-blue-100">
                              <tr>
                                <th className="px-3 py-2 text-left text-xs font-medium text-blue-600 uppercase">
                                  Fornecedor
                                </th>
                                <th className="px-3 py-2 text-right text-xs font-medium text-blue-600 uppercase">
                                  Preço Unit.
                                </th>
                                <th className="px-3 py-2 text-right text-xs font-medium text-blue-600 uppercase">
                                  Fator
                                </th>
                                <th className="px-3 py-2 text-right text-xs font-medium text-blue-600 uppercase">
                                  Normalizado
                                </th>
                                <th className="px-3 py-2 text-right text-xs font-medium text-blue-600 uppercase">
                                  Total
                                </th>
                              </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-blue-50">
                              {item.all_offers
                                .slice()
                                .sort(
                                  (a, b) =>
                                    a.preco_normalizado - b.preco_normalizado
                                )
                                .map((offer, i) => (
                                  <tr
                                    key={offer.supplier_name}
                                    className={i === 0 ? 'bg-green-50' : ''}
                                  >
                                    <td className="px-3 py-2 text-xs font-medium text-gray-800">
                                      {i === 0 && (
                                        <Award className="inline h-3 w-3 text-green-600 mr-1" />
                                      )}
                                      {offer.supplier_name}
                                    </td>
                                    <td className="px-3 py-2 text-xs text-right text-gray-600">
                                      {formatCurrency(offer.preco_unit)}
                                    </td>
                                    <td className="px-3 py-2 text-xs text-right text-gray-400">
                                      {formatNumber(offer.conversion_factor)}×
                                    </td>
                                    <td
                                      className={`px-3 py-2 text-xs text-right font-semibold ${
                                        i === 0
                                          ? 'text-green-700'
                                          : 'text-gray-700'
                                      }`}
                                    >
                                      {formatCurrency(offer.preco_normalizado)}
                                    </td>
                                    <td className="px-3 py-2 text-xs text-right text-gray-700">
                                      {formatCurrency(offer.total_normalizado)}
                                    </td>
                                  </tr>
                                ))}
                            </tbody>
                          </table>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
          <tfoot className="bg-gray-50">
            <tr>
              <td
                colSpan={3}
                className="px-4 py-3 text-sm font-semibold text-gray-700 text-right"
              >
                Total Cenário B:
              </td>
              <td className="px-4 py-3 text-sm font-bold text-blue-700 text-right">
                {formatCurrency(scenarioB.total_normalizado)}
              </td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export default function SessionScenariosView({
  scenarios,
  quotes,
  sessionId,
}: Props) {
  const [activeTab, setActiveTab] = useState<'tabelona' | 'ranking'>(
    'tabelona'
  );

  const pendingQuotes = quotes.filter((q) => q.status !== 'conciliado');

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <ScenarioSummaryCards scenarios={scenarios} />

      {pendingQuotes.length > 0 && (
        <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-lg">
          <AlertTriangle className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-amber-800">
            <p className="font-medium">
              {pendingQuotes.length} cotação(ões) ainda não conciliada(s)
            </p>
            <p className="text-amber-600 mt-0.5">
              Os cenários abaixo usam apenas as cotações conciliadas. Finalize a
              conciliação para incluir:{' '}
              {pendingQuotes.map((q) => q.supplier_name).join(', ')}.
            </p>
          </div>
        </div>
      )}

      <div className="rounded-lg border border-gray-100 bg-white overflow-hidden shadow-sm">
        <div className="flex border-b border-gray-200 bg-white/80">
          <button
            type="button"
            onClick={() => setActiveTab('tabelona')}
            className={tabBtnClass(activeTab === 'tabelona')}
          >
            <Table2 className="h-4 w-4" />
            Tabelona de Comparação
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('ranking')}
            className={tabBtnClass(activeTab === 'ranking')}
          >
            <Trophy className="h-4 w-4" />
            Ranking (Cenários A e B)
          </button>
        </div>

        <div className="p-5">
          {activeTab === 'tabelona' && <TabelonaView scenarios={scenarios} />}
          {activeTab === 'ranking' && <RankingView scenarios={scenarios} />}
        </div>
      </div>
    </div>
  );
}

