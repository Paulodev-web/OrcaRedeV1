'use client';

import React, { useCallback, useEffect, useMemo, useState, useTransition } from 'react';
import {
  AlertTriangle,
  Award,
  Check,
  ChevronDown,
  Download,
  Lightbulb,
  Loader2,
  Package,
  Save,
  Shuffle,
  Trash2,
  Table2,
  TrendingDown,
  Trophy,
  Warehouse,
  Target,
} from 'lucide-react';
import { useAlertDialog } from '@/hooks/useAlertDialog';
import { AlertDialog } from '@/components/ui/alert-dialog';
import { IdealPdfExportControls } from '@/components/suppliers/IdealPdfExportControls';
import {
  saveSessionStockInputsAction,
  calculateScenariosAction,
  updateNegotiatedPriceAction,
  saveIdealSelectionAction,
  bulkSaveIdealSelectionsAction,
  closeIdealScenarioAndUpdateMaterialsAction,
  type ScenariosResult,
  type ScenarioItem,
  type SessionStockInput,
  type IdealSelectionRow,
} from '@/actions/supplierQuotes';
import { deactivateMaterialForSuppliesAction } from '@/actions/materials';
import { negotiatedFromNormalized } from '@/lib/supplierPrice';
import {
  buildEffectiveSelectionMap,
  buildStaleValidationMap,
  computeIdealScenario,
  countStaleValidations,
  getEffectiveQuoteId,
  getBestOfferQuoteId,
  getStaleValidationInfo,
  type IdealScenarioLine,
} from '@/lib/scenarioIdealEngine';
import { useSessionScenariosRefresh } from '@/hooks/useSessionScenariosRefresh';
import { hasSeenConciliation } from '@/lib/suppliesConciliationAlert';
import ScenarioFiltersPanel from './ScenarioFiltersPanel';
import ScenarioComparisonTable from './ScenarioComparisonTable';
import ScenarioItemExpandableTable from './ScenarioItemExpandableTable';
import MaterialDetailModal from './MaterialDetailModal';
import ManualQuoteDialog, { type ManualQuoteMaterialInfo } from './ManualQuoteDialog';
import {
  deriveFilteredScenarios,
  defaultFilterState,
  type ScenarioFilterState,
  type FilteredScenariosResult,
} from './scenarioFilterEngine';
import { getSupplierDisplayName } from '@/lib/supplierDisplay';
import { slugifyFileName } from '@/lib/slugify';
import { suppliesTableBorderedScrollClass, suppliesTableScrollYCompactClass } from '@/lib/suppliesLayout';

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
  initialIdealSelections: IdealSelectionRow[];
}

function parseContentDispositionFilename(header: string | null): string | null {
  if (!header) return null;
  const utf8 = /filename\*=UTF-8''([^;]+)/i.exec(header);
  if (utf8?.[1]) return decodeURIComponent(utf8[1]);
  const plain = /filename="([^"]+)"/i.exec(header);
  return plain?.[1] ?? null;
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
          <div className={suppliesTableScrollYCompactClass}>
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
  onRemoveMaterial?: (item: ScenarioItem) => void;
  isRemovingMaterial?: boolean;
}

function TabelonaView({
  scenarios,
  groupBySupplier = true,
  quotes,
  onRemoveMaterial,
  isRemovingMaterial = false,
}: TabelonaProps) {
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
          label: q ? getSupplierDisplayName(q) : qid,
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
        Nec. do orçamento de engenharia; preços das cotações (ajuste por fator quando houver). Compra = necessidade − estoque.
      </p>
      <div className={suppliesTableBorderedScrollClass}>
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
              {onRemoveMaterial && (
                <th className="px-2 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-14 bg-gray-50">
                  Ações
                </th>
              )}
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
                  {onRemoveMaterial && (
                    <td className={`px-2 py-3 text-center ${isEvenRow ? 'bg-white' : 'bg-gray-50/50'}`}>
                      <button
                        type="button"
                        title="Remover do Suprimentos"
                        disabled={isRemovingMaterial}
                        onClick={() => onRemoveMaterial(item)}
                        className="inline-flex items-center justify-center rounded-md p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  )}
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
function ScenarioIdealView({
  scenarios,
  idealSelections,
  sessionId,
  onIdealSelect,
  onValidateAll,
  onRevalidateStale,
  onCloseIdeal,
  isValidatingAll,
  isRevalidatingStale,
  isClosingIdeal,
  staleCount,
  onManualQuoteRequest,
}: {
  scenarios: ScenariosResult;
  idealSelections: Map<string, string>;
  sessionId: string;
  onIdealSelect: (materialId: string, quoteId: string) => void;
  onValidateAll: () => void;
  onRevalidateStale: () => void;
  onCloseIdeal: () => void | Promise<void>;
  isValidatingAll: boolean;
  isRevalidatingStale: boolean;
  isClosingIdeal: boolean;
  staleCount: number;
  onManualQuoteRequest?: (item: ScenarioItem) => void;
}) {
  const alertDialog = useAlertDialog();
  const [isExporting, setIsExporting] = useState(false);
  const [selectedSupplierSlug, setSelectedSupplierSlug] = useState('all');
  const items = scenarios.scenarioB.items;

  const scenarioATotal = scenarios.scenarioA[0]?.total_normalizado ?? 0;
  const scenarioBTotal = scenarios.scenarioB.total_normalizado;
  const ideal = useMemo(
    () => computeIdealScenario(items, idealSelections, scenarioATotal, scenarioBTotal),
    [items, idealSelections, scenarioATotal, scenarioBTotal]
  );

  const validatedLines = ideal.lines.filter((l) => l.status === 'validated');
  const suggestedLines = ideal.lines.filter((l) => l.status === 'suggested');
  const canExport = items.some((i) => i.net_qty > 0);

  const lineByMaterialId = useMemo(() => {
    const m = new Map<string, IdealScenarioLine>();
    for (const line of ideal.lines) m.set(line.material_id, line);
    return m;
  }, [ideal.lines]);

  const filteredIdealItems = useMemo(() => {
    if (selectedSupplierSlug === 'all') return items;

    return items.filter((item) => {
      const line = lineByMaterialId.get(item.material_id);
      if (!line?.supplier_name) return false;
      return slugifyFileName(line.supplier_name) === selectedSupplierSlug;
    });
  }, [items, lineByMaterialId, selectedSupplierSlug]);

  const filteredIdealTotal = useMemo(() => {
    if (selectedSupplierSlug === 'all') return ideal.total;

    return filteredIdealItems.reduce((sum, item) => {
      const line = lineByMaterialId.get(item.material_id);
      return sum + (line?.line_total ?? 0);
    }, 0);
  }, [filteredIdealItems, ideal.total, lineByMaterialId, selectedSupplierSlug]);

  const runExport = useCallback(async () => {
    setIsExporting(true);
    try {
      const res = await fetch(
        `/api/scenarios/export-ideal?sessionId=${encodeURIComponent(sessionId)}`
      );
      if (!res.ok) {
        let message = 'Não foi possível gerar a exportação.';
        try {
          const body = (await res.json()) as { error?: string };
          if (body.error) message = body.error;
        } catch {
          /* ignore */
        }
        alertDialog.showError('Exportação falhou', message);
        return;
      }
      const blob = await res.blob();
      const filename =
        parseContentDispositionFilename(res.headers.get('Content-Disposition')) ??
        `cenario-ideal-${sessionId}.xlsx`;
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      anchor.style.visibility = 'hidden';
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);
    } catch {
      alertDialog.showError(
        'Exportação falhou',
        'Erro de rede ao baixar o arquivo. Tente novamente.'
      );
    } finally {
      setIsExporting(false);
    }
  }, [sessionId, alertDialog]);

  const handleExportClick = useCallback(() => {
    if (!canExport || isExporting) return;
    if (ideal.unvalidatedCount > 0) {
      alertDialog.showConfirm(
        'Itens só sugeridos',
        `${ideal.unvalidatedCount} item(ns) ainda não foram validados explicitamente. A exportação usará o menor preço para esses itens. Deseja continuar?`,
        runExport,
        { confirmText: 'Exportar' }
      );
      return;
    }
    void runExport();
  }, [canExport, isExporting, ideal.unvalidatedCount, alertDialog, runExport]);

  const handleConfirmExport = useCallback(
    (run: () => void | Promise<void>) => {
      if (!canExport) return;
      if (ideal.unvalidatedCount > 0) {
        alertDialog.showConfirm(
          'Itens só sugeridos',
          `${ideal.unvalidatedCount} item(ns) ainda não foram validados explicitamente. A exportação usará o menor preço para esses itens. Deseja continuar?`,
          () => void run(),
          { confirmText: 'Exportar' }
        );
        return;
      }
      void run();
    },
    [canExport, ideal.unvalidatedCount, alertDialog]
  );

  const handleCloseIdealClick = useCallback(() => {
    if (!canExport || isClosingIdeal) return;

    const run = () => onCloseIdeal();
    const warnings: string[] = [];
    if (ideal.pendingCount > 0) {
      warnings.push(
        `${ideal.pendingCount} material(is) sem cotação não serão atualizados.`
      );
    }
    if (ideal.unvalidatedCount > 0) {
      warnings.push(
        `${ideal.unvalidatedCount} item(ns) ainda estão como sugestão; será usado o menor preço atual.`
      );
    }

    alertDialog.showConfirm(
      'Fechar cenário ideal?',
      [
        'Os preços unitários dos materiais serão atualizados pelo fornecedor escolhido no Cenário Ideal.',
        ...warnings,
      ].join(' '),
      run,
      { confirmText: 'Atualizar materiais' }
    );
  }, [
    canExport,
    isClosingIdeal,
    ideal.pendingCount,
    ideal.unvalidatedCount,
    alertDialog,
    onCloseIdeal,
  ]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-end gap-2">
        {staleCount > 0 && (
          <button
            type="button"
            onClick={onRevalidateStale}
            disabled={isRevalidatingStale}
            className="inline-flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-900 transition-colors hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isRevalidatingStale ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <TrendingDown className="h-4 w-4" />
            )}
            Revalidar menores ({staleCount})
          </button>
        )}
        <button
          type="button"
          onClick={onValidateAll}
          disabled={isValidatingAll || ideal.unvalidatedCount === 0}
          className="inline-flex items-center gap-2 rounded-lg bg-[#1D3140] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#1D3140]/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isValidatingAll ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Check className="h-4 w-4" />
          )}
          Validar todos (menor preço)
        </button>
        <button
          type="button"
          onClick={handleCloseIdealClick}
          disabled={!canExport || isClosingIdeal}
          className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isClosingIdeal ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          Fechar cenário ideal e atualizar materiais
        </button>
        <span
          title={
            canExport
              ? 'Excel único com materiais, fornecedor, unidade, quantidades e preços'
              : 'Nenhum material com necessidade de compra'
          }
          className="inline-flex"
        >
          <button
            type="button"
            onClick={handleExportClick}
            disabled={!canExport || isExporting}
            className="inline-flex items-center gap-2 rounded-lg border border-[#64ABDE] bg-white px-4 py-2 text-sm font-medium text-[#1D3140] transition-colors hover:bg-[#64ABDE]/10 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-white"
          >
            {isExporting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            Exportar Excel
          </button>
        </span>
        <IdealPdfExportControls
          sessionId={sessionId}
          canExport={canExport}
          selectedSupplierSlug={selectedSupplierSlug}
          onSelectedSupplierSlugChange={setSelectedSupplierSlug}
          onConfirmExport={handleConfirmExport}
        />
      </div>

      {staleCount > 0 && (
        <div className="flex items-start gap-3 p-4 bg-orange-50 border border-orange-200 rounded-lg">
          <AlertTriangle className="h-5 w-5 text-orange-500 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-orange-900">
            <p className="font-medium">
              {staleCount} validação(ões) com oferta mais barata disponível
            </p>
            <p className="text-orange-700 mt-0.5">
              A escolha manual foi mantida. Use &quot;Revalidar menores&quot; para atualizar ao menor preço atual.
            </p>
          </div>
        </div>
      )}

      {ideal.unvalidatedCount > 0 && (
        <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-lg">
          <AlertTriangle className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-amber-800">
            <p className="font-medium">
              {ideal.unvalidatedCount} item(ns) com sugestão automática (menor preço)
            </p>
            <p className="text-amber-600 mt-0.5">
              Expanda a linha e clique em um fornecedor para validar, ou use &quot;Validar todos&quot;.
            </p>
          </div>
        </div>
      )}

      {ideal.pendingCount > 0 && (
        <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-lg">
          <AlertTriangle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-red-800">
            <p className="font-medium">
              {ideal.pendingCount} material(is) sem cotação para compra
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
          <p className="text-xs font-semibold uppercase text-blue-700">Total Cenário Ideal</p>
          <p className="text-2xl font-bold text-[#1D3140] mt-1">{formatCurrency(ideal.total)}</p>
          <p className="text-xs text-gray-500 mt-1">
            {validatedLines.length} validados · {suggestedLines.length} sugeridos
          </p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-xs font-semibold uppercase text-gray-500">vs. Cenário A (pacote)</p>
          <p
            className={`text-xl font-bold mt-1 ${ideal.diffVsA < 0 ? 'text-green-700' : ideal.diffVsA > 0 ? 'text-red-600' : 'text-gray-600'}`}
          >
            {ideal.diffVsA < 0 ? '−' : ideal.diffVsA > 0 ? '+' : ''}
            {formatCurrency(Math.abs(ideal.diffVsA))}
          </p>
          <p className="text-xs text-gray-400 mt-1">Referência: {formatCurrency(scenarioATotal)}</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-xs font-semibold uppercase text-gray-500">vs. Cenário B (por item)</p>
          <p
            className={`text-xl font-bold mt-1 ${ideal.diffVsB < 0 ? 'text-green-700' : ideal.diffVsB > 0 ? 'text-red-600' : 'text-gray-600'}`}
          >
            {ideal.diffVsB < 0 ? '−' : ideal.diffVsB > 0 ? '+' : ''}
            {formatCurrency(Math.abs(ideal.diffVsB))}
          </p>
          <p className="text-xs text-gray-400 mt-1">Referência: {formatCurrency(scenarioBTotal)}</p>
        </div>
      </div>

      <ScenarioItemExpandableTable
        items={filteredIdealItems}
        priceDisplay="supplierQuotes"
        description="Preços das cotações dos fornecedores (não usa a lista de preços do orçamento). Expanda a linha para comparar e validar a compra."
        supplierColumnLabel="Fornecedor"
        totalLabel="Total Cenário Ideal:"
        totalValue={filteredIdealTotal}
        getRowSummary={(item) => {
          const line = lineByMaterialId.get(item.material_id);
          return {
            supplierLabel: line?.supplier_name ?? '',
            unitPrice: line?.preco_normalizado ?? 0,
            lineTotal: line?.line_total ?? 0,
          };
        }}
        renderRowBadge={(item) => {
          const line = lineByMaterialId.get(item.material_id);
          if (!line || line.status === 'pending' || line.status === 'no_demand') return null;
          if (line.status === 'validated') {
            return (
              <span className="mt-1 inline-flex flex-wrap items-center gap-1">
                <span className="inline-flex items-center gap-1 text-[10px] font-medium text-green-700 bg-green-100 border border-green-200 px-1.5 py-0.5 rounded-full">
                  <Check className="h-3 w-3" />
                  Validado
                </span>
                {line.isStale && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-medium text-orange-800 bg-orange-100 border border-orange-200 px-1.5 py-0.5 rounded-full">
                    <AlertTriangle className="h-3 w-3" />
                    Oferta mais barata
                  </span>
                )}
              </span>
            );
          }
          return (
            <span className="mt-1 inline-flex items-center gap-1 text-[10px] font-medium text-amber-700 bg-amber-100 border border-amber-200 px-1.5 py-0.5 rounded-full">
              Sugestão — clique para validar
            </span>
          );
        }}
        highlightQuoteId={(materialId) => {
          const item = filteredIdealItems.find((i) => i.material_id === materialId);
          return item ? getEffectiveQuoteId(item, idealSelections) : null;
        }}
        onOfferSelect={onIdealSelect}
        onManualQuoteRequest={onManualQuoteRequest}
      />

      <AlertDialog {...alertDialog.dialogProps} />
    </div>
  );
}

function RankingView({
  scenarios,
  idealSelections,
  sessionId,
  onIdealSelect,
  onValidateAll,
  onRevalidateStale,
  onCloseIdeal,
  isValidatingAll,
  isRevalidatingStale,
  isClosingIdeal,
  staleCount,
  onManualQuoteRequest,
}: {
  scenarios: ScenariosResult;
  idealSelections: Map<string, string>;
  sessionId: string;
  onIdealSelect: (materialId: string, quoteId: string) => void;
  onValidateAll: () => void;
  onRevalidateStale: () => void;
  onCloseIdeal: () => void | Promise<void>;
  isValidatingAll: boolean;
  isRevalidatingStale: boolean;
  isClosingIdeal: boolean;
  staleCount: number;
  onManualQuoteRequest?: (item: ScenarioItem) => void;
}) {
  const [rankingTab, setRankingTab] = useState<'A' | 'B' | 'Ideal'>('A');
  const idealUnvalidated = useMemo(() => {
    const result = computeIdealScenario(
      scenarios.scenarioB.items,
      idealSelections,
      scenarios.scenarioA[0]?.total_normalizado ?? 0,
      scenarios.scenarioB.total_normalizado
    );
    return result.unvalidatedCount;
  }, [scenarios, idealSelections]);

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
        <button type="button" onClick={() => setRankingTab('Ideal')} className={tabBtnClass(rankingTab === 'Ideal')}>
          <Target className="h-4 w-4" />
          Cenário Ideal
          {idealUnvalidated > 0 && (
            <span className="ml-1 inline-flex items-center px-1.5 py-0.5 bg-amber-100 text-amber-800 text-xs rounded-full border border-amber-200">
              {idealUnvalidated} sug.
            </span>
          )}
          {staleCount > 0 && (
            <span className="ml-1 inline-flex items-center px-1.5 py-0.5 bg-orange-100 text-orange-800 text-xs rounded-full border border-orange-200">
              {staleCount} revisar
            </span>
          )}
        </button>
      </div>
      <div className="pt-2">
        {rankingTab === 'A' && <ScenarioAView scenarios={scenarios} />}
        {rankingTab === 'B' && <ScenarioBView scenarios={scenarios} />}
        {rankingTab === 'Ideal' && (
          <ScenarioIdealView
            scenarios={scenarios}
            idealSelections={idealSelections}
            sessionId={sessionId}
            onIdealSelect={onIdealSelect}
            onValidateAll={onValidateAll}
            onRevalidateStale={onRevalidateStale}
            onCloseIdeal={onCloseIdeal}
            isValidatingAll={isValidatingAll}
            isRevalidatingStale={isRevalidatingStale}
            isClosingIdeal={isClosingIdeal}
            staleCount={staleCount}
            onManualQuoteRequest={onManualQuoteRequest}
          />
        )}
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
      <div className={suppliesTableBorderedScrollClass}>
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50 sticky top-0 z-10">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider bg-gray-50">Fornecedor</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider w-32 bg-gray-50">Itens cobertos</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider w-40 bg-gray-50">Total</th>
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

  return (
    <ScenarioItemExpandableTable
      items={items}
      description="Fracionar a compra: cada item do fornecedor com menor preço na cotação. Apenas itens com necessidade líquida > 0."
      supplierColumnLabel="Melhor fornecedor"
      totalLabel="Total Cenário B:"
      totalValue={scenarios.scenarioB.total_normalizado}
      getRowSummary={(item) => ({
        supplierLabel: item.best_supplier,
        unitPrice: item.best_price_normalized,
        lineTotal: item.best_total,
      })}
      highlightQuoteId={(materialId) => {
        const item = items.find((i) => i.material_id === materialId);
        return item ? getBestOfferQuoteId(item) : null;
      }}
    />
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
  initialIdealSelections,
}: Props) {
  const [scenarios, setScenarios] = useState(initialScenarios);
  const [activeTab, setActiveTab] = useState<'tabelona' | 'ranking'>('tabelona');
  const alertDialog = useAlertDialog();
  const [isPending, startTransition] = useTransition();
  const [isValidatingAll, startValidateAll] = useTransition();
  const [isRevalidatingStale, startRevalidateStale] = useTransition();
  const [isSavingPrice, setIsSavingPrice] = useState(false);
  const [isRemovingMaterial, setIsRemovingMaterial] = useState(false);
  const [isClosingIdeal, setIsClosingIdeal] = useState(false);

  const [idealSelections, setIdealSelections] = useState<Map<string, string>>(() => {
    const m = new Map<string, string>();
    for (const row of initialIdealSelections) {
      m.set(row.material_id, row.quote_id);
    }
    return m;
  });

  useEffect(() => {
    setScenarios(initialScenarios);
  }, [initialScenarios]);

  const syncIdealFromRows = useCallback((rows: IdealSelectionRow[]) => {
    const m = new Map<string, string>();
    for (const row of rows) {
      m.set(row.material_id, row.quote_id);
    }
    setIdealSelections(m);
  }, []);

  const sessionQuoteIds = useMemo(
    () => quotes.map((q) => q.id),
    [quotes]
  );

  const { refresh: refreshScenarios } = useSessionScenariosRefresh({
    budgetId,
    sessionId,
    onScenarios: setScenarios,
    onIdealSelections: syncIdealFromRows,
    quoteIds: sessionQuoteIds,
  });

  const staleByMaterialId = useMemo(
    () => buildStaleValidationMap(scenarios.scenarioB.items, idealSelections),
    [scenarios.scenarioB.items, idealSelections]
  );

  const staleCount = useMemo(
    () => countStaleValidations(scenarios.scenarioB.items, idealSelections),
    [scenarios.scenarioB.items, idealSelections]
  );

  // Filter state
  const [filterState, setFilterState] = useState<ScenarioFilterState>(defaultFilterState);
  const [filtersExpanded, setFiltersExpanded] = useState(false);

  // Material detail modal state
  const [selectedMaterial, setSelectedMaterial] = useState<ScenarioItem | null>(null);
  const [materialModalOpen, setMaterialModalOpen] = useState(false);
  const [manualQuoteMaterial, setManualQuoteMaterial] = useState<ManualQuoteMaterialInfo | null>(
    null
  );
  const [manualQuoteOpen, setManualQuoteOpen] = useState(false);
  const [conciliationSeen, setConciliationSeen] = useState(false);

  useEffect(() => {
    const sync = () => setConciliationSeen(hasSeenConciliation(sessionId));
    sync();
    document.addEventListener('visibilitychange', sync);
    return () => document.removeEventListener('visibilitychange', sync);
  }, [sessionId]);

  const handleMaterialClick = useCallback((item: ScenarioItem) => {
    setSelectedMaterial(item);
    setMaterialModalOpen(true);
  }, []);

  // Quotes que de fato possuem ofertas no payload de cenários (independente do
  // campo `status` da supplier_quote). Usado para renderizar colunas/labels da
  // Tabela de Avaliação e do MaterialDetailModal — o vínculo certo aqui é a
  // presença de offers em `scenarioB.items`, e não o status `conciliado`, que
  // só muda quando o usuário clica em "Concluir conciliação".
  const quotesWithOffers = useMemo(() => {
    const ids = new Set<string>();
    for (const item of scenarios.scenarioB.items) {
      for (const offer of item.all_offers) {
        ids.add(offer.quote_id);
      }
    }
    return quotes.filter((q) => ids.has(q.id));
  }, [scenarios, quotes]);

  const availableQuoteIds = useMemo(
    () => new Set(quotesWithOffers.map((quote) => quote.id)),
    [quotesWithOffers]
  );

  const sanitizedEnabledQuoteIds = useMemo(() => {
    if (filterState.enabledQuoteIds.size === 0) return filterState.enabledQuoteIds;
    const validEnabledIds = new Set(
      Array.from(filterState.enabledQuoteIds).filter((id) => availableQuoteIds.has(id))
    );
    if (validEnabledIds.size === 0) return new Set<string>();
    return validEnabledIds;
  }, [filterState.enabledQuoteIds, availableQuoteIds]);

  const effectiveFilterState = useMemo(
    () => ({ ...filterState, enabledQuoteIds: sanitizedEnabledQuoteIds }),
    [filterState, sanitizedEnabledQuoteIds]
  );

  // ---------------------------------------------------------------------------
  // Fluxos de dados — separação explícita para evitar regressão:
  //
  // rawData (`scenarios`):  vem direto de calculateScenariosAction.
  //   ▶ Alimenta APENAS o Ranking (Cenários A e B). Não passa pelo engine de
  //     filtros para que a aba Ranking nunca seja afetada por toggles do
  //     ScenarioFiltersPanel.
  //
  // filteredData (`filteredScenarios`): rawData transformado por
  //   deriveFilteredScenarios(scenarios, effectiveFilterState).
  //   ▶ Alimenta a Tabela de Avaliação e os cards de resumo. Os totais aqui
  //     são visuais (client-side) e não substituem o cálculo canônico do
  //     servidor.
  // ---------------------------------------------------------------------------
  const filteredScenarios = useMemo(
    () => deriveFilteredScenarios(scenarios, effectiveFilterState),
    [scenarios, effectiveFilterState]
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
        await refreshScenarios();
      }
    });
  };

  const handleRemoveMaterial = useCallback(
    (item: ScenarioItem) => {
      if (isRemovingMaterial) return;

      alertDialog.showConfirm(
        'Remover do Suprimentos',
        `O material "${item.material_name}" deixará de aparecer em todas as sessões de Suprimentos (Tabelona, conciliação, cenários e extração). Ele continua disponível no orçamento.`,
        async () => {
          setIsRemovingMaterial(true);
          try {
            const result = await deactivateMaterialForSuppliesAction(item.material_id);
            if (!result.success) {
              alertDialog.showError(
                'Não foi possível remover',
                result.error ?? 'Erro ao desativar material.'
              );
              return;
            }

            setStockMap((prev) => {
              const next = new Map(prev);
              next.delete(item.material_id);
              return next;
            });
            setIdealSelections((prev) => {
              const next = new Map(prev);
              next.delete(item.material_id);
              return next;
            });
            setSelectedMaterial((current) => {
              if (current?.material_id === item.material_id) {
                setMaterialModalOpen(false);
                return null;
              }
              return current;
            });
            await refreshScenarios();
          } finally {
            setIsRemovingMaterial(false);
          }
        },
        {
          type: 'destructive',
          confirmText: 'Remover',
          cancelText: 'Cancelar',
        }
      );
    },
    [isRemovingMaterial, alertDialog, refreshScenarios]
  );

  const handleNegotiatedPriceSave = useCallback(
    async (quoteItemId: string, precoNegociadoNormalized: number | null) => {
      const item = scenarios.scenarioB.items
        .flatMap((i) => i.all_offers)
        .find((o) => o.quote_item_id === quoteItemId);
      if (!item) return;

      const precoNegociado =
        precoNegociadoNormalized === null
          ? null
          : negotiatedFromNormalized(precoNegociadoNormalized, item.conversion_factor);

      setIsSavingPrice(true);
      const res = await updateNegotiatedPriceAction(sessionId, quoteItemId, precoNegociado);
      setIsSavingPrice(false);
      if (res.success) {
        await refreshScenarios();
      }
    },
    [scenarios, sessionId, refreshScenarios]
  );

  const handleIdealSelect = useCallback(
    (materialId: string, quoteId: string) => {
      const current = idealSelections.get(materialId);
      if (current === quoteId) return;

      setIdealSelections((prev) => {
        const next = new Map(prev);
        next.set(materialId, quoteId);
        return next;
      });

      startTransition(async () => {
        const res = await saveIdealSelectionAction(sessionId, materialId, quoteId);
        if (!res.success) {
          setIdealSelections((prev) => {
            const next = new Map(prev);
            if (current) next.set(materialId, current);
            else next.delete(materialId);
            return next;
          });
        } else {
          await refreshScenarios();
        }
      });
    },
    [idealSelections, sessionId, refreshScenarios]
  );

  const handleManualQuoteRequest = useCallback((item: ScenarioItem) => {
    setManualQuoteMaterial({
      materialId: item.material_id,
      materialName: item.material_name,
      materialCode: item.material_code,
      materialUnit: item.material_unit,
    });
    setManualQuoteOpen(true);
  }, []);

  const handleManualQuoteSaved = useCallback(
    async (quoteId: string) => {
      const materialId = manualQuoteMaterial?.materialId;
      if (!materialId) return;

      setIdealSelections((prev) => {
        const next = new Map(prev);
        next.set(materialId, quoteId);
        return next;
      });

      const res = await saveIdealSelectionAction(sessionId, materialId, quoteId);
      if (!res.success) {
        alertDialog.showError('Cotação salva', res.error ?? 'Não foi possível validar no cenário ideal.');
      }
      await refreshScenarios();
    },
    [manualQuoteMaterial, sessionId, refreshScenarios, alertDialog]
  );

  const effectiveIdealSelections = useMemo(
    () => buildEffectiveSelectionMap(scenarios.scenarioB.items, idealSelections),
    [scenarios.scenarioB.items, idealSelections]
  );

  const handleValidateAll = useCallback(() => {
    const rows: IdealSelectionRow[] = [];
    for (const item of scenarios.scenarioB.items) {
      if (item.net_qty <= 0) continue;
      const quoteId = getBestOfferQuoteId(item);
      if (quoteId) {
        rows.push({ material_id: item.material_id, quote_id: quoteId });
      }
    }
    if (rows.length === 0) return;

    const previous = new Map(idealSelections);
    setIdealSelections((prev) => {
      const next = new Map(prev);
      for (const row of rows) next.set(row.material_id, row.quote_id);
      return next;
    });

    startValidateAll(async () => {
      const res = await bulkSaveIdealSelectionsAction(sessionId, rows);
      if (!res.success) {
        setIdealSelections(previous);
      } else {
        await refreshScenarios();
      }
    });
  }, [scenarios.scenarioB.items, idealSelections, sessionId, refreshScenarios]);

  const handleRevalidateStale = useCallback(() => {
    const rows: IdealSelectionRow[] = [];
    for (const item of scenarios.scenarioB.items) {
      if (item.net_qty <= 0) continue;
      const validatedQuoteId = idealSelections.get(item.material_id);
      const stale = getStaleValidationInfo(item, validatedQuoteId);
      if (stale.isStale && stale.bestQuoteId) {
        rows.push({ material_id: item.material_id, quote_id: stale.bestQuoteId });
      }
    }
    if (rows.length === 0) return;

    const previous = new Map(idealSelections);
    setIdealSelections((prev) => {
      const next = new Map(prev);
      for (const row of rows) next.set(row.material_id, row.quote_id);
      return next;
    });

    startRevalidateStale(async () => {
      const res = await bulkSaveIdealSelectionsAction(sessionId, rows);
      if (!res.success) {
        setIdealSelections(previous);
      } else {
        await refreshScenarios();
      }
    });
  }, [scenarios.scenarioB.items, idealSelections, sessionId, refreshScenarios]);

  const handleCloseIdeal = useCallback(async () => {
    if (isClosingIdeal) return;

    setIsClosingIdeal(true);
    try {
      const res = await closeIdealScenarioAndUpdateMaterialsAction(sessionId);
      if (!res.success) {
        alertDialog.showError(
          'Não foi possível atualizar',
          res.error ?? 'Erro ao fechar o cenário ideal.'
        );
        return;
      }

      const { updated, skippedPending, suggestedApplied } = res.data;
      const details = [
        `${updated} material(is) tiveram o preço atualizado pelo Cenário Ideal.`,
        suggestedApplied > 0
          ? `${suggestedApplied} atualização(ões) usaram sugestão de menor preço.`
          : '',
        skippedPending > 0
          ? `${skippedPending} material(is) sem cotação foram ignorados.`
          : '',
      ]
        .filter(Boolean)
        .join(' ');

      alertDialog.showSuccess('Materiais atualizados', details);
      await refreshScenarios();
    } finally {
      setIsClosingIdeal(false);
    }
  }, [isClosingIdeal, sessionId, alertDialog, refreshScenarios]);

  const pendingQuotes = quotes.filter((q) => q.status !== 'conciliado');

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6">
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

      {pendingQuotes.length > 0 && !conciliationSeen && (
        <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-lg">
          <AlertTriangle className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-amber-800">
            <p className="font-medium">{pendingQuotes.length} cotação(ões) ainda não conciliada(s)</p>
            <p className="text-amber-600 mt-0.5">
              Os cenários usam apenas as cotações conciliadas. Finalize:{' '}
              {pendingQuotes.map((q) => getSupplierDisplayName(q)).join(', ')}.
            </p>
          </div>
        </div>
      )}

      <ScenarioFiltersPanel
        quotes={quotesWithOffers}
        filterState={effectiveFilterState}
        onFilterChange={setFilterState}
        isExpanded={filtersExpanded}
        onExpandedChange={setFiltersExpanded}
      />

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-[#64ABDE]/40 bg-white shadow-md">
        <div className="flex shrink-0 border-b border-gray-200 bg-white/80">
          <button type="button" onClick={() => setActiveTab('tabelona')} className={tabBtnClass(activeTab === 'tabelona')}>
            <Table2 className="h-4 w-4" /> Tabela de Avaliação
          </button>
          <button type="button" onClick={() => setActiveTab('ranking')} className={tabBtnClass(activeTab === 'ranking')}>
            <Trophy className="h-4 w-4" /> Ranking (Cenários A e B)
          </button>
        </div>
        <div className="flex min-h-0 flex-1 flex-col p-5">
          {/* Tabela de Avaliação consome filteredData (passa pelo engine). */}
          {activeTab === 'tabelona' && (
            <ScenarioComparisonTable
              items={filteredScenarios.filteredItems}
              quotes={quotesWithOffers}
              enabledQuoteIds={effectiveFilterState.enabledQuoteIds}
              onMaterialClick={handleMaterialClick}
              idealSelections={effectiveIdealSelections}
              validatedSelections={idealSelections}
              staleByMaterialId={staleByMaterialId}
              onIdealSelect={handleIdealSelect}
              onNegotiatedPriceSave={handleNegotiatedPriceSave}
              isSavingPrice={isSavingPrice}
              onRemoveMaterial={handleRemoveMaterial}
              isRemovingMaterial={isRemovingMaterial}
              onManualQuoteRequest={handleManualQuoteRequest}
            />
          )}
          {/* Ranking consome rawData (`scenarios` direto da action) — nunca passa
              pelo engine de filtros para evitar que toggles do painel afetem a
              aba de Ranking. */}
          {activeTab === 'ranking' && (
            <RankingView
              scenarios={scenarios}
              idealSelections={idealSelections}
              sessionId={sessionId}
              onIdealSelect={handleIdealSelect}
              onValidateAll={handleValidateAll}
              onRevalidateStale={handleRevalidateStale}
              onCloseIdeal={handleCloseIdeal}
              isValidatingAll={isValidatingAll}
              isRevalidatingStale={isRevalidatingStale}
              isClosingIdeal={isClosingIdeal}
              staleCount={staleCount}
              onManualQuoteRequest={handleManualQuoteRequest}
            />
          )}
        </div>
      </div>

      <ManualQuoteDialog
        open={manualQuoteOpen}
        onOpenChange={setManualQuoteOpen}
        sessionId={sessionId}
        budgetId={budgetId}
        material={manualQuoteMaterial}
        onSaved={(quoteId) => void handleManualQuoteSaved(quoteId)}
      />

      <MaterialDetailModal
        item={selectedMaterial}
        quotes={quotesWithOffers}
        enabledQuoteIds={effectiveFilterState.enabledQuoteIds}
        open={materialModalOpen}
        onOpenChange={setMaterialModalOpen}
      />

      <AlertDialog {...alertDialog.dialogProps} />
    </div>
  );
}
