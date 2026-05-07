'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  AlertTriangle,
  Award,
  ChevronDown,
  Package,
  Shuffle,
  TrendingDown,
} from 'lucide-react';
import type { BudgetOption } from '@/types';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type {
  ScenariosResult,
  ScenarioItem,
} from '@/actions/supplierQuotes';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const formatCurrency = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

const formatNumber = (v: number) =>
  new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);

const BUDGET_SELECT_EMPTY = '__no_budget__';

type QuoteSummary = {
  id: string;
  supplier_name: string;
  status: string;
  item_count: number;
  matched_count: number;
};

interface Props {
  budgets: BudgetOption[];
  selectedBudgetId: string;
  selectedBudgetName?: string;
  scenarios: ScenariosResult | null;
  quotes: QuoteSummary[] | null;
}

// ---------------------------------------------------------------------------
// Sub-component: Cenário A card
// ---------------------------------------------------------------------------
function ScenarioACard({ scenarios }: { scenarios: ScenariosResult }) {
  const { scenarioA } = scenarios;
  if (scenarioA.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-sm text-gray-400">
        Nenhum dado disponível. Concilie as cotações primeiro.
      </div>
    );
  }

  const cheapest = scenarioA[0];

  return (
    <div className="overflow-x-auto">
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
            <th className="px-4 py-3 w-24" />
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-100">
          {scenarioA.map((supplier, idx) => {
            const isBest = idx === 0;
            const diff = supplier.total_normalizado - cheapest.total_normalizado;
            const pctDiff = cheapest.total_normalizado > 0
              ? (diff / cheapest.total_normalizado) * 100
              : 0;

            return (
              <tr
                key={supplier.quote_id}
                className={isBest ? 'bg-green-50' : 'hover:bg-gray-50 transition-colors'}
              >
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    {isBest && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-100 text-green-700 text-xs font-medium rounded-full border border-green-200">
                        <Award className="h-3 w-3" />
                        Mais barato
                      </span>
                    )}
                    <span className="text-sm font-medium text-[#1D3140]">{supplier.supplier_name}</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-right text-sm text-gray-700">
                  {supplier.items_covered} / {supplier.total_items}
                  <div className="w-full bg-gray-100 rounded-full h-1 mt-1">
                    <div
                      className="h-1 rounded-full bg-[#64ABDE]"
                      style={{
                        width: `${Math.round((supplier.items_covered / supplier.total_items) * 100)}%`,
                      }}
                    />
                  </div>
                </td>
                <td className="px-4 py-3 text-right">
                  <p className={`text-sm font-bold ${isBest ? 'text-green-700' : 'text-[#1D3140]'}`}>
                    {formatCurrency(supplier.total_normalizado)}
                  </p>
                  {!isBest && diff > 0 && (
                    <p className="text-xs text-red-500 mt-0.5">
                      +{formatCurrency(diff)} (+{formatNumber(pctDiff)}%)
                    </p>
                  )}
                </td>
                <td className="px-4 py-3">
                  <a
                    href={`/fornecedores/trabalho?tab=conciliar&quoteId=${encodeURIComponent(supplier.quote_id)}`}
                    className="text-xs text-[#64ABDE] transition-colors hover:text-[#1D3140] hover:underline"
                  >
                    Ver cotação
                  </a>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-component: Cenário B card
// ---------------------------------------------------------------------------
function ScenarioBCard({ scenarios }: { scenarios: ScenariosResult }) {
  const { scenarioB, budget_total_reference } = scenarios;
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (scenarioB.items.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-sm text-gray-400">
        Nenhum item com cotações múltiplas disponível.
      </div>
    );
  }

  const hasSaving = scenarioB.saving_vs_cheapest_a > 0;

  return (
    <div className="space-y-4">
      {/* Resumo */}
      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-lg border border-[#64ABDE]/40 bg-[#64ABDE]/10 p-4">
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-[#64ABDE]">
            Total Cenário B
          </p>
          <p className="text-2xl font-bold text-[#1D3140]">
            {formatCurrency(scenarioB.total_normalizado)}
          </p>
        </div>
        <div
          className={`border rounded-lg p-4 ${
            hasSaving
              ? 'bg-green-50 border-green-100'
              : 'bg-gray-50 border-gray-100'
          }`}
        >
          <p
            className={`text-xs font-medium uppercase tracking-wide mb-1 ${
              hasSaving ? 'text-green-600' : 'text-gray-500'
            }`}
          >
            {hasSaving ? 'Economia vs. Cenário A' : 'Diferença vs. Cenário A'}
          </p>
          <p
            className={`text-2xl font-bold ${
              hasSaving ? 'text-green-700' : 'text-gray-600'
            }`}
          >
            {hasSaving ? '−' : '+'}{formatCurrency(Math.abs(scenarioB.saving_vs_cheapest_a))}
          </p>
          {budget_total_reference > 0 && (
            <p className="text-xs text-gray-400 mt-0.5">
              vs. {formatCurrency(budget_total_reference)} do melhor pacote
            </p>
          )}
        </div>
      </div>

      {/* Tabela por item */}
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
                <>
                  <tr
                    key={item.material_id}
                    className={`hover:bg-gray-50 transition-colors ${isExpanded ? 'bg-[#64ABDE]/10' : ''}`}
                  >
                    <td className="px-4 py-3">
                      <p className="text-sm font-medium text-[#1D3140]">{item.material_name}</p>
                      <p className="text-xs text-gray-400">
                        <span className="font-mono">{item.material_code}</span>
                        {' · '}Qtd {formatNumber(item.net_qty)}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-50 border border-green-200 px-2 py-1 rounded-full">
                        <Award className="h-3 w-3" />
                        {item.best_supplier}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <p className="text-sm font-bold text-[#1D3140]">
                        {formatCurrency(item.best_price_normalized)}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <p className="text-sm font-semibold text-[#64ABDE]">
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
                          title="Ver todas as ofertas"
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

                  {/* Todas as ofertas expandidas */}
                  {isExpanded && (
                    <tr key={`${item.material_id}-expanded`}>
                      <td colSpan={5} className="bg-[#64ABDE]/10 px-4 pb-4 pt-0">
                        <div className="mt-2 overflow-hidden rounded-lg border border-[#64ABDE]/30">
                          <table className="min-w-full divide-y divide-[#64ABDE]/20">
                            <thead className="bg-[#64ABDE]/15">
                              <tr>
                                <th className="px-3 py-2 text-left text-xs font-medium uppercase text-[#1D3140]">
                                  Fornecedor
                                </th>
                                <th className="px-3 py-2 text-right text-xs font-medium uppercase text-[#1D3140]">
                                  Preço Unit.
                                </th>
                                <th className="px-3 py-2 text-right text-xs font-medium uppercase text-[#1D3140]">
                                  Fator
                                </th>
                                <th className="px-3 py-2 text-right text-xs font-medium uppercase text-[#1D3140]">
                                  Normalizado
                                </th>
                                <th className="px-3 py-2 text-right text-xs font-medium uppercase text-[#1D3140]">
                                  Total
                                </th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-[#64ABDE]/10 bg-white">
                              {item.all_offers
                                .slice()
                                .sort((a, b) => a.preco_normalizado - b.preco_normalizado)
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
                                        i === 0 ? 'text-green-700' : 'text-gray-700'
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
                </>
              );
            })}
          </tbody>
          <tfoot className="bg-gray-50">
            <tr>
              <td colSpan={3} className="px-4 py-3 text-sm font-semibold text-gray-700 text-right">
                Total Cenário B:
              </td>
              <td className="px-4 py-3 text-right text-sm font-bold text-[#1D3140]">
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
// Main panel
// ---------------------------------------------------------------------------
export default function PurchaseScenariosPanel({
  budgets,
  selectedBudgetId,
  selectedBudgetName,
  scenarios,
  quotes,
}: Props) {
  const router = useRouter();

  const handleBudgetChange = (value: string) => {
    const id = value === BUDGET_SELECT_EMPTY ? '' : value;
    if (id) {
      router.push(`/fornecedores/trabalho?tab=cenarios&budgetId=${encodeURIComponent(id)}`);
    } else {
      router.push('/fornecedores/trabalho?tab=cenarios');
    }
  };

  const [activeTab, setActiveTab] = useState<'A' | 'B'>('A');

  const pendingQuotes = quotes?.filter((q) => q.status !== 'conciliado') ?? [];
  const hasData = scenarios && scenarios.scenarioA.length > 0;

  return (
    <div className="flex flex-col gap-6">
      {/* Seletor de orçamento */}
      <div className="rounded-lg border border-gray-100 bg-gray-50/60 p-5">
        <label
          htmlFor="scenarios-budget-select"
          className="mb-2 block text-sm font-medium text-[#1D3140]"
        >
          Selecione o Orçamento / Obra
        </label>
        <div className="max-w-sm">
          <Select
            value={selectedBudgetId ? selectedBudgetId : BUDGET_SELECT_EMPTY}
            onValueChange={handleBudgetChange}
          >
            <SelectTrigger id="scenarios-budget-select" className="w-full">
              <SelectValue placeholder="Selecione o orçamento..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={BUDGET_SELECT_EMPTY}>
                Selecione o orçamento...
              </SelectItem>
              {budgets.map((b) => (
                <SelectItem key={b.id} value={b.id}>
                  {b.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {selectedBudgetId && (
        <>
          {/* Alertas de cotações pendentes */}
          {pendingQuotes.length > 0 && (
            <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-lg">
              <AlertTriangle className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-amber-800">
                <p className="font-medium">
                  {pendingQuotes.length} cotação(ões) ainda não conciliada(s)
                </p>
                <p className="text-amber-600 mt-0.5">
                  Os cenários abaixo usam apenas as cotações conciliadas. Finalize a conciliação
                  para incluir:{' '}
                  {pendingQuotes.map((q) => q.supplier_name).join(', ')}.
                </p>
              </div>
            </div>
          )}

          {/* Resumo das cotações */}
          {quotes && quotes.length > 0 && (
            <div className="rounded-lg border border-gray-100 bg-gray-50/60 p-5">
              <h3 className="mb-3 text-sm font-semibold text-[#1D3140]">
                Cotações disponíveis para:{' '}
                <span className="text-[#1D3140]">{selectedBudgetName}</span>
              </h3>
              <div className="flex flex-wrap gap-2">
                {quotes.map((q) => (
                  <a
                    key={q.id}
                    href={`/fornecedores/trabalho?tab=conciliar&quoteId=${encodeURIComponent(q.id)}`}
                    className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors hover:border-[#64ABDE]/50 ${
                      q.status === 'conciliado'
                        ? 'border-green-200 bg-green-50 text-green-700'
                        : 'border-amber-200 bg-amber-50 text-amber-700'
                    }`}
                  >
                    {q.supplier_name}
                    <span className="text-gray-400">
                      {q.matched_count}/{q.item_count}
                    </span>
                  </a>
                ))}
              </div>
            </div>
          )}

          {!hasData && (
            <div className="rounded-lg border border-gray-100 bg-gray-50/60 p-10 text-center">
              <p className="text-gray-400 text-sm">
                Nenhum item conciliado encontrado para este orçamento. Faça o upload e concilie
                pelo menos uma proposta primeiro.
              </p>
              <a
                href="/fornecedores/trabalho?tab=importar"
                className="mt-3 inline-block text-sm font-medium text-[#64ABDE] transition-colors hover:text-[#1D3140] hover:underline"
              >
                Importar proposta →
              </a>
            </div>
          )}

          {hasData && (
            <>
              {/* Tabs */}
              <div className="rounded-lg border border-gray-100 bg-gray-50/60 overflow-hidden">
                <div className="flex border-b border-gray-200 bg-white/80">
                  <button
                    type="button"
                    onClick={() => setActiveTab('A')}
                    className={`flex items-center gap-2 px-6 py-4 text-sm font-medium border-b-2 transition-colors ${
                      activeTab === 'A'
                        ? 'border-[#64ABDE] text-[#64ABDE]'
                        : 'border-transparent text-gray-500 hover:text-[#1D3140]'
                    }`}
                  >
                    <Package className="h-4 w-4" />
                    Cenário A — Pacote Fechado
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('B')}
                    className={`flex items-center gap-2 px-6 py-4 text-sm font-medium border-b-2 transition-colors ${
                      activeTab === 'B'
                        ? 'border-[#64ABDE] text-[#64ABDE]'
                        : 'border-transparent text-gray-500 hover:text-[#1D3140]'
                    }`}
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

                <div className="p-5">
                  {activeTab === 'A' && (
                    <>
                      <p className="text-xs text-gray-500 mb-4">
                        Comprar tudo de um único fornecedor. Preços normalizados por unidade interna do
                        sistema.
                      </p>
                      <ScenarioACard scenarios={scenarios} />
                    </>
                  )}
                  {activeTab === 'B' && (
                    <>
                      <p className="text-xs text-gray-500 mb-4">
                        Fracionar a compra: cada item é adquirido do fornecedor com menor preço
                        normalizado.
                      </p>
                      <ScenarioBCard scenarios={scenarios} />
                    </>
                  )}
                </div>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
