'use client';

import React, { useCallback, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  Award,
  ChevronDown,
  Lightbulb,
  Loader2,
  Package,
  Save,
  Shuffle,
  Table2,
  TrendingDown,
  Trophy,
  Warehouse,
} from 'lucide-react';
import {
  saveSessionStockInputsAction,
  calculateScenariosAction,
  type ScenariosResult,
  type ScenarioItem,
  type SessionStockInput,
} from '@/actions/supplierQuotes';
import ScenarioFiltersPanel from './ScenarioFiltersPanel';
import {
  deriveFilteredScenarios,
  defaultFilterState,
  type ScenarioFilterState,
  type FilteredScenariosResult,
} from './scenarioFilterEngine';
import { getQuoteLabel } from '@/lib/quoteDisplay';

const formatCurrency = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

const formatNumber = (v: number) =>
  new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);

type QuoteSummary = {
  id: string;
  supplier_name: string;
  pdf_path?: string | null;
  display_name?: string | null;
  status: string;
  item_count: number;
  matched_count: number;
};

interface Props {
  scenarios: ScenariosResult;
  quotes: QuoteSummary[];
  sessionId: string;
  budgetId: string;
  initialStock: SessionStockInput[];
}

const tabBtnClass = (active: boolean) =>
  `flex items-center gap-2 px-6 py-4 text-sm font-medium border-b-2 transition-colors ${
    active
      ? 'border-[#64ABDE] text-[#64ABDE]'
      : 'border-transparent text-slate-500 hover:text-[#1D3140]'
  }`;

// ---------------------------------------------------------------------------
// Suggestion cards (deterministic)
// ---------------------------------------------------------------------------
function SuggestionCards({ scenarios }: { scenarios: ScenariosResult }) {
  const { scenarioA, scenarioB } = scenarios;
  const bestA = scenarioA[0];
  const hasItems = scenarioB.items.filter((i) => i.net_qty > 0).length > 0;

  if (!hasItems || !bestA) return null;

  const pctDiff = bestA.total_normalizado > 0
    ? ((bestA.total_normalizado - scenarioB.total_normalizado) / bestA.total_normalizado) * 100
    : 0;

  const suggestions: { title: string; description: string; highlight?: boolean }[] = [];

  if (scenarioB.total_normalizado < bestA.total_normalizado) {
    suggestions.push({
      title: 'Menor custo total',
      description: `Fracionar a compra entre fornecedores (Cenário B) economiza ${formatCurrency(scenarioB.saving_vs_cheapest_a)} (${formatNumber(pctDiff)}%) vs. pacote fechado.`,
      highlight: true,
    });
  }

  if (bestA.items_covered === bestA.total_items) {
    suggestions.push({
      title: 'Menor complexidade',
      description: `Comprar tudo de ${bestA.supplier_name} por ${formatCurrency(bestA.total_normalizado)} cobre 100% dos itens com um único pedido.`,
    });
  } else if (bestA.items_covered > 0) {
    suggestions.push({
      title: 'Melhor pacote unitário',
      description: `${bestA.supplier_name} cobre ${bestA.items_covered}/${bestA.total_items} itens por ${formatCurrency(bestA.total_normalizado)}.`,
    });
  }

  if (pctDiff > 0 && pctDiff < 5 && bestA.items_covered === bestA.total_items) {
    suggestions.push({
      title: 'Equilíbrio',
      description: `A diferença entre pacote fechado e fracionado é apenas ${formatNumber(pctDiff)}%. Comprar de um fornecedor pode ser mais prático.`,
    });
  }

  if (suggestions.length === 0) return null;

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
      {suggestions.map((s) => (
        <div
          key={s.title}
          className={`rounded-xl border p-4 ${
            s.highlight
              ? 'border-green-200 bg-green-50'
              : 'border-gray-200 bg-white'
          }`}
        >
          <div className="flex items-center gap-2 mb-1.5">
            <Lightbulb className={`h-4 w-4 ${s.highlight ? 'text-green-600' : 'text-[#64ABDE]'}`} />
            <p className={`text-xs font-semibold uppercase tracking-wide ${s.highlight ? 'text-green-700' : 'text-[#1D3140]'}`}>
              {s.title}
            </p>
          </div>
          <p className="text-sm text-gray-600">{s.description}</p>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stock editor
// ---------------------------------------------------------------------------
function StockEditor({
  items,
  stockMap,
  onStockChange,
  onSave,
  isSaving,
  hasChanges,
}: {
  items: ScenarioItem[];
  stockMap: Map<string, number>;
  onStockChange: (materialId: string, qty: number) => void;
  onSave: () => void;
  isSaving: boolean;
  hasChanges: boolean;
}) {
  const [showStock, setShowStock] = useState(false);

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
      <button
        type="button"
        onClick={() => setShowStock((v) => !v)}
        className="flex w-full items-center justify-between px-5 py-4 text-left"
      >
        <div className="flex items-center gap-2">
          <Warehouse className="h-5 w-5 text-[#1D3140]" />
          <span className="text-sm font-semibold text-[#1D3140]">Estoque em mãos</span>
          <span className="text-xs text-gray-400">
            ({stockMap.size > 0 ? `${stockMap.size} materiais com estoque` : 'nenhum informado'})
          </span>
        </div>
        <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform ${showStock ? 'rotate-180' : ''}`} />
      </button>

      {showStock && (
        <div className="border-t border-gray-100 px-5 pb-5">
          <p className="mb-3 text-xs text-gray-500">
            Informe a quantidade em estoque por material para descontar da necessidade de compra.
          </p>
          <div className="max-h-80 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-white">
                <tr className="border-b border-gray-100">
                  <th className="pb-2 text-left text-xs font-medium text-gray-500">Material</th>
                  <th className="pb-2 text-right text-xs font-medium text-gray-500 w-24">Necessidade</th>
                  <th className="pb-2 text-right text-xs font-medium text-gray-500 w-28">Estoque</th>
                  <th className="pb-2 text-right text-xs font-medium text-gray-500 w-24">Compra</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {items.map((item) => {
                  const stock = stockMap.get(item.material_id) ?? 0;
                  const net = Math.max(item.required_qty - stock, 0);
                  return (
                    <tr key={item.material_id}>
                      <td className="py-2 pr-2">
                        <p className="text-sm font-medium text-[#1D3140] truncate max-w-[260px]">{item.material_name}</p>
                        <p className="text-xs text-gray-400 font-mono">{item.material_code}</p>
                      </td>
                      <td className="py-2 text-right text-gray-600">{formatNumber(item.required_qty)}</td>
                      <td className="py-2 text-right">
                        <input
                          type="number"
                          min={0}
                          step="any"
                          value={stock || ''}
                          onChange={(e) => onStockChange(item.material_id, parseFloat(e.target.value) || 0)}
                          className="w-24 rounded border border-gray-200 px-2 py-1 text-right text-sm focus:border-[#64ABDE] focus:outline-none"
                          placeholder="0"
                        />
                      </td>
                      <td className={`py-2 text-right font-medium ${net === 0 ? 'text-green-600' : 'text-[#1D3140]'}`}>
                        {formatNumber(net)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex justify-end">
            <button
              type="button"
              onClick={onSave}
              disabled={isSaving || !hasChanges}
              className="inline-flex items-center gap-2 rounded-lg bg-[#1D3140] px-4 py-2 text-sm font-medium text-white hover:bg-[#1D3140]/90 disabled:opacity-50 transition-colors"
            >
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Salvar e recalcular
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Summary cards
// ---------------------------------------------------------------------------
function ScenarioSummaryCards({ scenarios, isFiltered }: { scenarios: ScenariosResult; isFiltered?: boolean }) {
  const { scenarioA, scenarioB, budget_total_reference } = scenarios;
  const bestSupplier = scenarioA[0];
  const hasSaving = scenarioB.saving_vs_cheapest_a > 0;
  const itemsWithDemand = scenarioB.items.filter((i) => i.net_qty > 0).length;
  const totalStock = scenarioB.items.reduce((s, i) => s + i.stock_qty, 0);

  return (
    <div className="space-y-3">
      {isFiltered && (
        <div className="flex items-center gap-2 text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          <AlertTriangle className="h-4 w-4" />
          <span>Totais abaixo refletem os filtros ativos (visualização apenas).</span>
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Cenário A */}
        <div className="rounded-xl border-2 border-[#64ABDE]/40 bg-gradient-to-br from-[#64ABDE]/5 to-[#64ABDE]/15 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-[#64ABDE]/20">
                <Package className="h-4 w-4 text-[#64ABDE]" />
              </div>
              <p className="text-xs font-semibold uppercase tracking-wide text-[#64ABDE]">
                Cenário A
              </p>
            </div>
          </div>
          <p className="text-xs text-gray-500 mb-1">Pacote Fechado</p>
          {bestSupplier ? (
            <>
              <p className="text-3xl font-bold text-[#1D3140] tracking-tight">{formatCurrency(bestSupplier.total_normalizado)}</p>
              <div className="mt-3 pt-3 border-t border-[#64ABDE]/20">
                <p className="text-sm text-[#1D3140]">
                  <span className="font-semibold">{bestSupplier.supplier_name}</span>
                </p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {bestSupplier.items_covered}/{bestSupplier.total_items} itens cobertos
                </p>
              </div>
            </>
          ) : (
            <p className="text-sm text-gray-400 mt-2">Sem dados</p>
          )}
        </div>

        {/* Cenário B */}
        <div className="rounded-xl border-2 border-slate-200 bg-gradient-to-br from-slate-50 to-slate-100 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-slate-200">
                <Shuffle className="h-4 w-4 text-slate-600" />
              </div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                Cenário B
              </p>
            </div>
          </div>
          <p className="text-xs text-gray-500 mb-1">Melhor por Item</p>
          <p className="text-3xl font-bold text-[#1D3140] tracking-tight">{formatCurrency(scenarioB.total_normalizado)}</p>
          <div className="mt-3 pt-3 border-t border-slate-200">
            <p className="text-sm text-slate-600">{itemsWithDemand} materiais</p>
            <p className="text-xs text-gray-500 mt-0.5">com necessidade de compra</p>
          </div>
        </div>

        {/* Diferença / Economia */}
        <div
          className={`rounded-xl border-2 p-5 shadow-sm ${
            hasSaving
              ? 'border-green-200 bg-gradient-to-br from-green-50 to-green-100'
              : 'border-gray-200 bg-gradient-to-br from-gray-50 to-gray-100'
          }`}
        >
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className={`p-2 rounded-lg ${hasSaving ? 'bg-green-200' : 'bg-gray-200'}`}>
                <TrendingDown className={`h-4 w-4 ${hasSaving ? 'text-green-600' : 'text-gray-500'}`} />
              </div>
              <p className={`text-xs font-semibold uppercase tracking-wide ${hasSaving ? 'text-green-600' : 'text-gray-500'}`}>
                {hasSaving ? 'Economia' : 'Diferença'}
              </p>
            </div>
          </div>
          <p className="text-xs text-gray-500 mb-1">{hasSaving ? 'Potencial com Cenário B' : 'B vs. A'}</p>
          <p className={`text-3xl font-bold tracking-tight ${hasSaving ? 'text-green-700' : 'text-gray-600'}`}>
            {hasSaving ? '−' : '+'}{formatCurrency(Math.abs(scenarioB.saving_vs_cheapest_a))}
          </p>
          {budget_total_reference > 0 && (
            <div className="mt-3 pt-3 border-t border-gray-200/50">
              <p className="text-xs text-gray-500">
                vs. {formatCurrency(budget_total_reference)} do melhor pacote
              </p>
            </div>
          )}
        </div>

        {/* Estoque */}
        <div className="rounded-xl border-2 border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-gray-100">
                <Warehouse className="h-4 w-4 text-gray-500" />
              </div>
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                Estoque
              </p>
            </div>
          </div>
          <p className="text-xs text-gray-500 mb-1">Informado pelo usuário</p>
          <p className="text-3xl font-bold text-[#1D3140] tracking-tight">{formatNumber(totalStock)}</p>
          <div className="mt-3 pt-3 border-t border-gray-100">
            <p className="text-sm text-gray-600">
              {scenarioB.items.filter((i) => i.stock_qty > 0).length} materiais
            </p>
            <p className="text-xs text-gray-500 mt-0.5">com estoque cadastrado</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tabelona with net_qty
// ---------------------------------------------------------------------------
interface TabelonaQuoteInfo {
  id: string;
  supplier_name: string;
  pdf_path?: string | null;
  display_name?: string | null;
}

interface TabelonaProps {
  scenarios: ScenariosResult & { filteredItems?: ScenarioItem[] };
  groupBySupplier?: boolean;
  quotes: TabelonaQuoteInfo[];
}

function TabelonaView({ scenarios, groupBySupplier = true, quotes }: TabelonaProps) {
  // Use filteredItems if available, otherwise fall back to scenarioB.items
  const items = (scenarios as { filteredItems?: ScenarioItem[] }).filteredItems ?? scenarios.scenarioB.items;

  // Build quote map for labels
  const quoteMap = useMemo(() => new Map(quotes.map((q) => [q.id, q])), [quotes]);

  // Build column model based on groupBySupplier mode
  const columns = useMemo(() => {
    if (groupBySupplier) {
      // Group by supplier_name
      const supplierSet = new Set<string>();
      for (const item of items) {
        for (const offer of item.all_offers) {
          supplierSet.add(offer.supplier_name);
        }
      }
      return Array.from(supplierSet)
        .sort((a, b) => a.localeCompare(b, 'pt-BR'))
        .map((name) => ({ key: name, label: name, isSupplier: true }));
    } else {
      // Group by quote_id
      const quoteSet = new Set<string>();
      for (const item of items) {
        for (const offer of item.all_offers) {
          quoteSet.add(offer.quote_id);
        }
      }
      return Array.from(quoteSet).map((qid) => {
        const q = quoteMap.get(qid);
        return {
          key: qid,
          label: q ? getQuoteLabel(q) : qid,
          isSupplier: false,
        };
      });
    }
  }, [items, groupBySupplier, quoteMap]);

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-32 text-sm text-gray-400">
        <p>Nenhum dado disponível.</p>
        <p className="text-xs mt-1">Ajuste os filtros ou concilie as cotações primeiro.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-500">
        Preços normalizados (preço ÷ fator). Totais calculados sobre a necessidade líquida (necessidade − estoque).
      </p>
      <div className="overflow-x-auto border border-gray-200 rounded-lg max-h-[600px]">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50 sticky top-0 z-20">
            <tr>
              <th className="sticky left-0 z-30 bg-gray-50 px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[200px] shadow-[2px_0_4px_-2px_rgba(0,0,0,0.1)]">
                Material
              </th>
              <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider w-20 bg-gray-50">Nec.</th>
              <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider w-20 bg-gray-50">Est.</th>
              <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider w-20 bg-gray-50">Compra</th>
              {columns.map((col) => (
                <th key={col.key} className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[140px] bg-gray-50">
                  {col.label}
                </th>
              ))}
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-36 bg-gray-50">Melhor</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-100">
            {items.map((item, idx) => {
              // Build offer map based on grouping mode
              const offerMap = groupBySupplier
                ? new Map(item.all_offers.map((o) => [o.supplier_name, o]))
                : new Map(item.all_offers.map((o) => [o.quote_id, o]));
              const bestPrice = item.all_offers.length > 0
                ? Math.min(...item.all_offers.map((o) => o.preco_normalizado))
                : 0;
              const isFullyStocked = item.net_qty === 0;
              const isEvenRow = idx % 2 === 0;

              return (
                <tr
                  key={item.material_id}
                  className={`hover:bg-[#64ABDE]/5 transition-colors ${isFullyStocked ? 'opacity-50' : ''} ${isEvenRow ? 'bg-white' : 'bg-gray-50/50'}`}
                >
                  <td className={`sticky left-0 z-10 px-4 py-3 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.1)] ${isEvenRow ? 'bg-white' : 'bg-gray-50/50'}`}>
                    <p className="max-w-[240px] truncate font-medium text-[#1D3140]">{item.material_name}</p>
                    <p className="text-xs text-gray-400 font-mono">{item.material_code}</p>
                  </td>
                  <td className="px-3 py-3 text-right text-gray-600">{formatNumber(item.required_qty)}</td>
                  <td className="px-3 py-3 text-right text-gray-400">{item.stock_qty > 0 ? formatNumber(item.stock_qty) : '—'}</td>
                  <td className={`px-3 py-3 text-right font-medium ${isFullyStocked ? 'text-green-600' : 'text-[#1D3140]'}`}>
                    {isFullyStocked ? '✓' : formatNumber(item.net_qty)}
                  </td>
                  {columns.map((col) => {
                    const offer = offerMap.get(col.key);
                    if (!offer) {
                      return <td key={col.key} className="px-4 py-3 text-right text-gray-300">—</td>;
                    }
                    const isBest = offer.preco_normalizado === bestPrice;
                    return (
                      <td key={col.key} className={`px-4 py-3 text-right ${isBest ? 'bg-green-50 font-bold text-green-700' : 'text-gray-700'}`}>
                        <p>{formatCurrency(offer.preco_normalizado)}</p>
                        {offer.conversion_factor !== 1 && (
                          <p className="text-xs text-gray-400 font-normal">÷{formatNumber(offer.conversion_factor)}</p>
                        )}
                      </td>
                    );
                  })}
                  <td className="px-4 py-3">
                    {!isFullyStocked && item.best_supplier && (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-50 border border-green-200 px-2 py-1 rounded-full">
                        <Award className="h-3 w-3" />
                        {item.best_supplier}
                      </span>
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

// ---------------------------------------------------------------------------
// Ranking views (A & B)
// ---------------------------------------------------------------------------
function RankingView({ scenarios }: { scenarios: ScenariosResult }) {
  const [rankingTab, setRankingTab] = useState<'A' | 'B'>('A');

  return (
    <div className="space-y-4">
      <div className="flex border-b border-gray-200">
        <button type="button" onClick={() => setRankingTab('A')} className={tabBtnClass(rankingTab === 'A')}>
          <Package className="h-4 w-4" />
          Cenário A — Pacote Fechado
        </button>
        <button type="button" onClick={() => setRankingTab('B')} className={tabBtnClass(rankingTab === 'B')}>
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
      <div className="flex flex-col items-center justify-center h-32 text-sm text-gray-400">
        <p>Nenhum dado disponível.</p>
        <p className="text-xs mt-1">Ajuste os filtros ou concilie as cotações primeiro.</p>
      </div>
    );
  }
  const cheapest = scenarioA[0];

  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-500">
        Comprar tudo de um único fornecedor. Totais sobre necessidade líquida.
      </p>
      <div className="overflow-x-auto border border-gray-200 rounded-lg max-h-[500px]">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50 sticky top-0 z-10">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider bg-gray-50">Fornecedor</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider w-32 bg-gray-50">Itens cobertos</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider w-40 bg-gray-50">Total normalizado</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-100">
            {scenarioA.map((supplier, idx) => {
              const isBest = idx === 0;
              const diff = supplier.total_normalizado - cheapest.total_normalizado;
              const pctDiff = cheapest.total_normalizado > 0 ? (diff / cheapest.total_normalizado) * 100 : 0;
              const isEvenRow = idx % 2 === 0;
              return (
                <tr
                  key={supplier.quote_id}
                  className={`transition-colors ${isBest ? 'bg-green-50' : isEvenRow ? 'bg-white hover:bg-gray-50' : 'bg-gray-50/50 hover:bg-gray-100'}`}
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {isBest && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-100 text-green-700 text-xs font-medium rounded-full border border-green-200">
                          <Award className="h-3 w-3" /> Mais barato
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
                        style={{ width: `${Math.round((supplier.items_covered / Math.max(supplier.total_items, 1)) * 100)}%` }}
                      />
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <p className={`text-sm font-bold ${isBest ? 'text-green-700' : 'text-[#1D3140]'}`}>
                      {formatCurrency(supplier.total_normalizado)}
                    </p>
                    {!isBest && diff > 0 && (
                      <p className="text-xs text-red-500 mt-0.5">+{formatCurrency(diff)} (+{formatNumber(pctDiff)}%)</p>
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

function ScenarioBView({ scenarios }: { scenarios: ScenariosResult & { filteredItems?: ScenarioItem[] } }) {
  const items = scenarios.filteredItems ?? scenarios.scenarioB.items;
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const activeItems = items.filter((i) => i.net_qty > 0);

  if (activeItems.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-32 text-sm text-gray-400">
        <p>Todos os materiais estão cobertos pelo estoque.</p>
        <p className="text-xs mt-1">Ou nenhum item corresponde aos filtros ativos.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-500">
        Fracionar a compra: cada item adquirido do fornecedor com menor preço normalizado. Apenas itens com necessidade líquida &gt; 0.
      </p>
      <div className="overflow-x-auto border border-gray-200 rounded-lg max-h-[500px]">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50 sticky top-0 z-10">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider bg-gray-50">Material</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider w-20 bg-gray-50">Compra</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-36 bg-gray-50">Melhor fornecedor</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider w-32 bg-gray-50">Preço unit. norm.</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider w-32 bg-gray-50">Total</th>
              <th className="px-4 py-3 w-8 bg-gray-50" />
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-100">
            {activeItems.map((item: ScenarioItem, idx) => {
              const isExpanded = expandedId === item.material_id;
              const hasMultiple = item.all_offers.length > 1;
              const isEvenRow = idx % 2 === 0;
              return (
                <React.Fragment key={item.material_id}>
                  <tr className={`transition-colors ${isExpanded ? 'bg-[#64ABDE]/10' : isEvenRow ? 'bg-white hover:bg-gray-50' : 'bg-gray-50/50 hover:bg-gray-100'}`}>
                    <td className="px-4 py-3">
                      <p className="text-sm font-medium text-[#1D3140]">{item.material_name}</p>
                      <p className="text-xs text-gray-400"><span className="font-mono">{item.material_code}</span></p>
                    </td>
                    <td className="px-4 py-3 text-right text-sm text-gray-600">{formatNumber(item.net_qty)}</td>
                    <td className="px-4 py-3">
                      {item.best_supplier && (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-50 border border-green-200 px-2 py-1 rounded-full">
                          <Award className="h-3 w-3" />{item.best_supplier}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right"><p className="text-sm font-bold text-[#1D3140]">{formatCurrency(item.best_price_normalized)}</p></td>
                    <td className="px-4 py-3 text-right"><p className="text-sm font-semibold text-[#64ABDE]">{formatCurrency(item.best_total)}</p></td>
                    <td className="px-4 py-3 text-center">
                      {hasMultiple && (
                        <button type="button" onClick={() => setExpandedId(isExpanded ? null : item.material_id)} className="p-1 text-gray-400 hover:text-gray-600 rounded transition-colors">
                          <ChevronDown className={`h-4 w-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                        </button>
                      )}
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr>
                      <td colSpan={6} className="bg-[#64ABDE]/10 px-4 pb-4 pt-0">
                        <div className="mt-2 overflow-hidden rounded-lg border border-[#64ABDE]/30">
                          <table className="min-w-full divide-y divide-[#64ABDE]/20">
                            <thead className="bg-[#64ABDE]/15">
                              <tr>
                                <th className="px-3 py-2 text-left text-xs font-medium uppercase text-[#1D3140]">Fornecedor</th>
                                <th className="px-3 py-2 text-right text-xs font-medium uppercase text-[#1D3140]">Preço Unit.</th>
                                <th className="px-3 py-2 text-right text-xs font-medium uppercase text-[#1D3140]">Fator</th>
                                <th className="px-3 py-2 text-right text-xs font-medium uppercase text-[#1D3140]">Normalizado</th>
                                <th className="px-3 py-2 text-right text-xs font-medium uppercase text-[#1D3140]">Total</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-[#64ABDE]/10 bg-white">
                              {item.all_offers.slice().sort((a, b) => a.preco_normalizado - b.preco_normalizado).map((offer, i) => (
                                <tr key={offer.quote_id} className={i === 0 ? 'bg-green-50' : ''}>
                                  <td className="px-3 py-2 text-xs font-medium text-gray-800">
                                    {i === 0 && <Award className="inline h-3 w-3 text-green-600 mr-1" />}
                                    {offer.supplier_name}
                                  </td>
                                  <td className="px-3 py-2 text-xs text-right text-gray-600">{formatCurrency(offer.preco_unit)}</td>
                                  <td className="px-3 py-2 text-xs text-right text-gray-400">{formatNumber(offer.conversion_factor)}×</td>
                                  <td className={`px-3 py-2 text-xs text-right font-semibold ${i === 0 ? 'text-green-700' : 'text-gray-700'}`}>
                                    {formatCurrency(offer.preco_normalizado)}
                                  </td>
                                  <td className="px-3 py-2 text-xs text-right text-gray-700">{formatCurrency(offer.total_normalizado)}</td>
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
          <tfoot className="bg-gray-50 sticky bottom-0">
            <tr className="border-t-2 border-gray-200">
              <td colSpan={4} className="px-4 py-3 text-sm font-semibold text-gray-700 text-right">Total Cenário B:</td>
              <td className="px-4 py-3 text-right text-sm font-bold text-[#1D3140]">{formatCurrency(scenarios.scenarioB.total_normalizado)}</td>
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
  scenarios: initialScenarios,
  quotes,
  sessionId,
  budgetId,
  initialStock,
}: Props) {
  const router = useRouter();
  const [scenarios, setScenarios] = useState(initialScenarios);
  const [activeTab, setActiveTab] = useState<'tabelona' | 'ranking'>('tabelona');
  const [isPending, startTransition] = useTransition();

  // Filter state
  const [filterState, setFilterState] = useState<ScenarioFilterState>(defaultFilterState);
  const [filtersExpanded, setFiltersExpanded] = useState(false);

  // Derived filtered scenarios (client-side only — visual totals, não substitui cálculo canônico)
  const filteredScenarios = useMemo(
    () => deriveFilteredScenarios(scenarios, filterState),
    [scenarios, filterState]
  );

  const [stockMap, setStockMap] = useState<Map<string, number>>(() => {
    const m = new Map<string, number>();
    for (const s of initialStock) {
      if (s.stock_qty > 0) m.set(s.material_id, s.stock_qty);
    }
    return m;
  });

  const [savedStockSnapshot, setSavedStockSnapshot] = useState<string>(() =>
    JSON.stringify(Array.from(new Map(initialStock.filter((s) => s.stock_qty > 0).map((s) => [s.material_id, s.stock_qty])).entries())),
  );

  const currentStockSnapshot = useMemo(
    () => JSON.stringify(Array.from(stockMap.entries())),
    [stockMap],
  );

  const hasStockChanges = currentStockSnapshot !== savedStockSnapshot;

  const handleStockChange = useCallback((materialId: string, qty: number) => {
    setStockMap((prev) => {
      const next = new Map(prev);
      if (qty > 0) next.set(materialId, qty);
      else next.delete(materialId);
      return next;
    });
  }, []);

  const handleSaveStock = () => {
    startTransition(async () => {
      const inputs = Array.from(stockMap.entries()).map(([material_id, stock_qty]) => ({ material_id, stock_qty }));
      const res = await saveSessionStockInputsAction(sessionId, inputs);
      if (res.success) {
        setSavedStockSnapshot(JSON.stringify(Array.from(stockMap.entries())));
        const scenariosRes = await calculateScenariosAction(budgetId, sessionId);
        if (scenariosRes.success) {
          setScenarios(scenariosRes.data);
        }
        router.refresh();
      }
    });
  };

  const pendingQuotes = quotes.filter((q) => q.status !== 'conciliado');
  const conciliadoQuotes = quotes.filter((q) => q.status === 'conciliado');

  return (
    <div className="space-y-6">
      <ScenarioSummaryCards scenarios={filteredScenarios} isFiltered={filteredScenarios.isFiltered} />

      <SuggestionCards scenarios={scenarios} />

      <StockEditor
        items={scenarios.scenarioB.items}
        stockMap={stockMap}
        onStockChange={handleStockChange}
        onSave={handleSaveStock}
        isSaving={isPending}
        hasChanges={hasStockChanges}
      />

      {pendingQuotes.length > 0 && (
        <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-lg">
          <AlertTriangle className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-amber-800">
            <p className="font-medium">{pendingQuotes.length} cotação(ões) ainda não conciliada(s)</p>
            <p className="text-amber-600 mt-0.5">
              Os cenários usam apenas as cotações conciliadas. Finalize:{' '}
              {pendingQuotes.map((q) => getQuoteLabel(q)).join(', ')}.
            </p>
          </div>
        </div>
      )}

      <ScenarioFiltersPanel
        quotes={conciliadoQuotes}
        filterState={filterState}
        onFilterChange={setFilterState}
        isExpanded={filtersExpanded}
        onExpandedChange={setFiltersExpanded}
      />

      <div className="overflow-hidden rounded-xl border border-[#64ABDE]/40 bg-white shadow-md">
        <div className="flex border-b border-gray-200 bg-white/80">
          <button type="button" onClick={() => setActiveTab('tabelona')} className={tabBtnClass(activeTab === 'tabelona')}>
            <Table2 className="h-4 w-4" /> Tabelona de Comparação
          </button>
          <button type="button" onClick={() => setActiveTab('ranking')} className={tabBtnClass(activeTab === 'ranking')}>
            <Trophy className="h-4 w-4" /> Ranking (Cenários A e B)
          </button>
        </div>
        <div className="p-5">
          {activeTab === 'tabelona' && (
            <TabelonaView
              scenarios={filteredScenarios}
              groupBySupplier={filterState.groupBySupplier}
              quotes={conciliadoQuotes}
            />
          )}
          {activeTab === 'ranking' && <RankingView scenarios={filteredScenarios} />}
        </div>
      </div>
    </div>
  );
}
