'use client';

import React, { useMemo, useState, useCallback } from 'react';
import { Award, TrendingDown, AlertCircle, Pencil, Loader2 } from 'lucide-react';
import type { ScenarioItem } from '@/actions/supplierQuotes';
import { getSupplierDisplayName } from '@/lib/supplierDisplay';
import { originalNormalizedPrice } from '@/lib/supplierPrice';

const formatCurrency = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

const formatNumber = (v: number) =>
  new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);

export interface QuoteColumnInfo {
  id: string;
  supplier_name: string;
  pdf_path?: string | null;
  display_name?: string | null;
}

export interface EvaluationRowData {
  item: ScenarioItem;
  minPrice: number | null;
  minTotal: number | null;
  winnerQuoteId: string | null;
  winnerLabel: string;
  priceSpread: number;
  hasDivergence: boolean;
  hasNoCoverage: boolean;
}

export interface ColumnTotals {
  quoteId: string;
  label: string;
  totalValue: number;
  itemsCovered: number;
  winsCount: number;
}

type ScenarioOffer = ScenarioItem['all_offers'][number];

function PriceUnitCell({
  offer,
  isWinner,
  isIdealSelected,
  disabled,
  isSavingPrice,
  onIdealSelect,
  onNegotiatedPriceSave,
}: {
  offer: ScenarioOffer;
  isWinner: boolean;
  isIdealSelected: boolean;
  disabled: boolean;
  isSavingPrice?: boolean;
  onIdealSelect?: () => void;
  onNegotiatedPriceSave?: (quoteItemId: string, precoNegociado: number | null) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);

  const isNegotiated = offer.preco_negociado != null;
  const originalNorm = originalNormalizedPrice(offer.preco_unit, offer.conversion_factor);

  const tooltip = isNegotiated
    ? `Original: ${formatCurrency(originalNorm)} | Negociado: ${formatCurrency(offer.preco_normalizado)}`
    : `Preço do PDF: ${formatCurrency(originalNorm)}`;

  const startEdit = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!onNegotiatedPriceSave || disabled) return;
      setDraft(String(offer.preco_normalizado));
      setEditing(true);
    },
    [offer.preco_normalizado, onNegotiatedPriceSave, disabled]
  );

  const commitEdit = useCallback(async () => {
    if (!onNegotiatedPriceSave) return;
    const trimmed = draft.trim();
    if (trimmed === '') {
      setSaving(true);
      await onNegotiatedPriceSave(offer.quote_item_id, null);
      setSaving(false);
      setEditing(false);
      return;
    }
    const parsed = parseFloat(trimmed.replace(',', '.'));
    if (Number.isNaN(parsed) || parsed <= 0) {
      setEditing(false);
      return;
    }
    setSaving(true);
    await onNegotiatedPriceSave(offer.quote_item_id, parsed);
    setSaving(false);
    setEditing(false);
  }, [draft, offer.quote_item_id, onNegotiatedPriceSave]);

  const handleCellClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!editing && onIdealSelect && !disabled) {
      onIdealSelect();
    }
  };

  let cellClass = isWinner ? 'bg-green-100 font-bold text-green-800' : 'text-gray-700';
  if (isNegotiated) {
    cellClass = isWinner
      ? 'bg-green-50 font-bold text-blue-800'
      : 'text-blue-700 bg-blue-50';
  }
  if (isIdealSelected) {
    cellClass += ' ring-2 ring-blue-500 ring-inset';
  }

  if (editing) {
    return (
      <td
        className={`px-2 py-1.5 text-right text-xs border-l border-gray-100 ${cellClass}`}
        onClick={(e) => e.stopPropagation()}
      >
        <input
          type="number"
          min={0}
          step="any"
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => void commitEdit()}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void commitEdit();
            if (e.key === 'Escape') setEditing(false);
          }}
          className="w-full min-w-[72px] rounded border border-blue-300 px-1 py-0.5 text-right text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
          disabled={saving || isSavingPrice}
        />
      </td>
    );
  }

  return (
    <td
      className={`group relative px-2 py-2.5 text-right text-xs border-l border-gray-100 cursor-pointer ${cellClass}`}
      title={tooltip}
      onClick={handleCellClick}
    >
      <span>{formatCurrency(offer.preco_normalizado)}</span>
      {isNegotiated && (
        <span className="block text-[10px] text-gray-400 line-through font-normal">
          {formatCurrency(originalNorm)}
        </span>
      )}
      {offer.conversion_factor !== 1 && (
        <span className="block text-[10px] text-gray-400 font-normal">÷{formatNumber(offer.conversion_factor)}</span>
      )}
      {onNegotiatedPriceSave && !disabled && (
        <button
          type="button"
          onClick={startEdit}
          className="absolute right-0.5 top-0.5 rounded p-0.5 text-gray-400 opacity-0 transition-opacity hover:bg-white hover:text-blue-600 group-hover:opacity-100"
          title="Editar preço negociado"
          aria-label="Editar preço negociado"
        >
          {saving || isSavingPrice ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Pencil className="h-3 w-3" />
          )}
        </button>
      )}
    </td>
  );
}

interface Props {
  items: ScenarioItem[];
  quotes: QuoteColumnInfo[];
  enabledQuoteIds: Set<string>;
  onMaterialClick?: (item: ScenarioItem) => void;
  idealSelections?: Map<string, string>;
  onIdealSelect?: (materialId: string, quoteId: string) => void;
  onNegotiatedPriceSave?: (quoteItemId: string, precoNegociadoNormalized: number | null) => Promise<void>;
  isSavingPrice?: boolean;
}

export default function ScenarioComparisonTable({
  items,
  quotes,
  enabledQuoteIds,
  onMaterialClick,
  idealSelections,
  onIdealSelect,
  onNegotiatedPriceSave,
  isSavingPrice,
}: Props) {
  const quoteMap = useMemo(() => new Map(quotes.map((q) => [q.id, q])), [quotes]);
  const availableQuoteIds = useMemo(() => new Set(quotes.map((q) => q.id)), [quotes]);

  const validEnabledQuoteIds = useMemo(() => {
    if (enabledQuoteIds.size === 0) return enabledQuoteIds;
    const validIds = new Set(
      Array.from(enabledQuoteIds).filter((quoteId) => availableQuoteIds.has(quoteId))
    );
    return validIds.size === 0 ? new Set<string>() : validIds;
  }, [enabledQuoteIds, availableQuoteIds]);

  const visibleQuotes = useMemo(() => {
    if (validEnabledQuoteIds.size === 0) return quotes;
    return quotes.filter((q) => validEnabledQuoteIds.has(q.id));
  }, [quotes, validEnabledQuoteIds]);

  const { rows, columnTotals, grandMinTotal } = useMemo(() => {
    const rowsData: EvaluationRowData[] = [];
    const totalsMap = new Map<string, { total: number; covered: number; wins: number }>();

    for (const q of visibleQuotes) {
      totalsMap.set(q.id, { total: 0, covered: 0, wins: 0 });
    }

    let grandMin = 0;

    for (const item of items) {
      const visibleOffers = validEnabledQuoteIds.size === 0
        ? item.all_offers
        : item.all_offers.filter((o) => validEnabledQuoteIds.has(o.quote_id));

      const hasNoCoverage = visibleOffers.length === 0;
      const hasDivergence = visibleOffers.length >= 2;

      let minPrice: number | null = null;
      let minTotal: number | null = null;
      let winnerQuoteId: string | null = null;
      let priceSpread = 0;

      if (visibleOffers.length > 0) {
        const prices = visibleOffers.map((o) => o.preco_normalizado);
        minPrice = Math.min(...prices);
        const maxPrice = Math.max(...prices);
        priceSpread = maxPrice - minPrice;

        const winner = visibleOffers.find((o) => o.preco_normalizado === minPrice);
        if (winner) {
          winnerQuoteId = winner.quote_id;
          minTotal = minPrice * item.net_qty;

          const winnerTotals = totalsMap.get(winner.quote_id);
          if (winnerTotals && item.net_qty > 0) {
            winnerTotals.wins += 1;
          }
        }
      }

      for (const offer of visibleOffers) {
        const colTotals = totalsMap.get(offer.quote_id);
        if (colTotals) {
          colTotals.total += offer.preco_normalizado * item.net_qty;
          if (item.net_qty > 0) {
            colTotals.covered += 1;
          }
        }
      }

      if (minTotal !== null && item.net_qty > 0) {
        grandMin += minTotal;
      }

      const winnerQ = winnerQuoteId ? quoteMap.get(winnerQuoteId) : null;

      rowsData.push({
        item,
        minPrice,
        minTotal,
        winnerQuoteId,
        winnerLabel: winnerQ ? getSupplierDisplayName(winnerQ) : '',
        priceSpread,
        hasDivergence,
        hasNoCoverage,
      });
    }

    const colTotals: ColumnTotals[] = visibleQuotes.map((q) => {
      const t = totalsMap.get(q.id) ?? { total: 0, covered: 0, wins: 0 };
      return {
        quoteId: q.id,
        label: getSupplierDisplayName(q),
        totalValue: t.total,
        itemsCovered: t.covered,
        winsCount: t.wins,
      };
    });

    return { rows: rowsData, columnTotals: colTotals, grandMinTotal: grandMin };
  }, [items, visibleQuotes, validEnabledQuoteIds, quoteMap]);

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-40 text-sm text-gray-400 border border-dashed border-gray-200 rounded-lg">
        <AlertCircle className="h-8 w-8 mb-2 text-gray-300" />
        <p>Nenhum material para comparar.</p>
        <p className="text-xs mt-1">Ajuste os filtros ou concilie as cotações primeiro.</p>
      </div>
    );
  }

  if (quotes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-40 text-sm text-gray-400 border border-dashed border-gray-200 rounded-lg">
        <AlertCircle className="h-8 w-8 mb-2 text-gray-300" />
        <p>Nenhum orçamento disponível para comparação.</p>
        <p className="text-xs mt-1">Concilie ao menos uma cotação para montar a tabela.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-500">
        Preços normalizados (÷ fator). Clique no preço unitário para o Cenário Ideal; use o lápis para negociar.
        Clique na linha para detalhes do material.
      </p>
      <div className="overflow-x-auto border border-gray-200 rounded-lg">
        <div className="max-h-[600px] overflow-y-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50 sticky top-0 z-20">
              <tr>
                <th className="sticky left-0 z-30 bg-gray-50 px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[220px] shadow-[2px_0_4px_-2px_rgba(0,0,0,0.1)]">
                  Material
                </th>
                <th className="px-2 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider w-16 bg-gray-50">Nec.</th>
                <th className="px-2 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider w-16 bg-gray-50">Est.</th>
                <th className="px-2 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider w-16 bg-gray-50">Compra</th>
                {visibleQuotes.map((q) => (
                  <th
                    key={q.id}
                    colSpan={2}
                    className="px-2 py-2 text-center text-xs font-medium text-gray-600 uppercase tracking-wider bg-gray-50 border-l border-gray-200"
                  >
                    <span className="block truncate max-w-[180px]" title={getSupplierDisplayName(q)}>
                      {getSupplierDisplayName(q)}
                    </span>
                  </th>
                ))}
                <th className="px-3 py-3 text-right text-xs font-medium text-green-700 uppercase tracking-wider w-24 bg-green-50 border-l-2 border-green-200">
                  Mínimo
                </th>
                <th className="px-3 py-3 text-left text-xs font-medium text-green-700 uppercase tracking-wider min-w-[120px] bg-green-50">
                  Vencedor
                </th>
              </tr>
              <tr className="bg-gray-100">
                <th className="sticky left-0 z-30 bg-gray-100 px-4 py-1.5 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.1)]" />
                <th className="px-2 py-1.5 bg-gray-100" />
                <th className="px-2 py-1.5 bg-gray-100" />
                <th className="px-2 py-1.5 bg-gray-100" />
                {visibleQuotes.map((q) => (
                  <React.Fragment key={`sub-${q.id}`}>
                    <th className="px-2 py-1.5 text-right text-[10px] font-medium text-gray-400 uppercase bg-gray-100 border-l border-gray-200 w-20">
                      Unit.
                    </th>
                    <th className="px-2 py-1.5 text-right text-[10px] font-medium text-gray-400 uppercase bg-gray-100 w-24">
                      Total
                    </th>
                  </React.Fragment>
                ))}
                <th className="px-3 py-1.5 text-right text-[10px] font-medium text-green-600 uppercase bg-green-50 border-l-2 border-green-200">
                  Unit.
                </th>
                <th className="px-3 py-1.5 bg-green-50" />
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-100">
              {rows.map((row, idx) => {
                const { item, minPrice, winnerQuoteId, winnerLabel, hasNoCoverage } = row;
                const isFullyStocked = item.net_qty === 0;
                const isEvenRow = idx % 2 === 0;
                const rowBg = isEvenRow ? 'bg-white' : 'bg-gray-50/50';
                const offerMap = new Map(item.all_offers.map((o) => [o.quote_id, o]));
                const idealQuoteId = idealSelections?.get(item.material_id);

                return (
                  <tr
                    key={item.material_id}
                    onClick={() => onMaterialClick?.(item)}
                    className={`hover:bg-[#64ABDE]/5 transition-colors cursor-pointer ${isFullyStocked ? 'opacity-50' : ''} ${rowBg}`}
                  >
                    <td className={`sticky left-0 z-10 px-4 py-2.5 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.1)] ${rowBg}`}>
                      <p className="font-medium text-[#1D3140] truncate max-w-[200px]" title={item.material_name}>
                        {item.material_name}
                      </p>
                      <p className="text-xs text-gray-400 font-mono">{item.material_code}</p>
                    </td>
                    <td className="px-2 py-2.5 text-right text-gray-600 text-xs">{formatNumber(item.required_qty)}</td>
                    <td className="px-2 py-2.5 text-right text-gray-400 text-xs">
                      {item.stock_qty > 0 ? formatNumber(item.stock_qty) : '—'}
                    </td>
                    <td className={`px-2 py-2.5 text-right text-xs font-medium ${isFullyStocked ? 'text-green-600' : 'text-[#1D3140]'}`}>
                      {isFullyStocked ? '✓' : formatNumber(item.net_qty)}
                    </td>
                    {visibleQuotes.map((q) => {
                      const offer = offerMap.get(q.id);
                      const isWinner = offer && q.id === winnerQuoteId;

                      if (!offer) {
                        return (
                          <React.Fragment key={q.id}>
                            <td className="px-2 py-2.5 text-right text-gray-300 text-xs border-l border-gray-100">—</td>
                            <td className="px-2 py-2.5 text-right text-gray-300 text-xs">—</td>
                          </React.Fragment>
                        );
                      }

                      const totalCellClass = isWinner
                        ? 'bg-green-50 font-semibold text-green-700'
                        : 'text-gray-600';
                      const isIdealSelected = idealQuoteId === q.id;

                      return (
                        <React.Fragment key={q.id}>
                          <PriceUnitCell
                            offer={offer}
                            isWinner={!!isWinner}
                            isIdealSelected={isIdealSelected}
                            disabled={isFullyStocked}
                            isSavingPrice={isSavingPrice}
                            onIdealSelect={
                              onIdealSelect
                                ? () => onIdealSelect(item.material_id, q.id)
                                : undefined
                            }
                            onNegotiatedPriceSave={onNegotiatedPriceSave}
                          />
                          <td
                            className={`px-2 py-2.5 text-right text-xs ${totalCellClass} ${isIdealSelected ? 'ring-2 ring-blue-500 ring-inset bg-blue-50/50' : ''}`}
                            onClick={(e) => e.stopPropagation()}
                          >
                            {formatCurrency(offer.preco_normalizado * item.net_qty)}
                          </td>
                        </React.Fragment>
                      );
                    })}
                    <td className="px-3 py-2.5 text-right border-l-2 border-green-200 bg-green-50/50">
                      {hasNoCoverage ? (
                        <span className="text-xs text-amber-600 font-medium">Sem cotação</span>
                      ) : (
                        <span className="text-xs font-bold text-green-700">
                          {minPrice !== null ? formatCurrency(minPrice) : '—'}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 bg-green-50/50">
                      {!isFullyStocked && winnerLabel && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-medium text-green-700 bg-green-100 border border-green-200 px-1.5 py-0.5 rounded-full truncate max-w-[110px]" title={winnerLabel}>
                          <Award className="h-3 w-3 flex-shrink-0" />
                          <span className="truncate">{winnerLabel}</span>
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="bg-gray-100 sticky bottom-0 z-10 border-t-2 border-gray-300">
              <tr className="font-semibold">
                <td className="sticky left-0 z-20 bg-gray-100 px-4 py-3 text-sm text-gray-700 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.1)]">
                  <div className="flex items-center gap-2">
                    <TrendingDown className="h-4 w-4 text-gray-500" />
                    Totais
                  </div>
                </td>
                <td className="px-2 py-3 bg-gray-100" />
                <td className="px-2 py-3 bg-gray-100" />
                <td className="px-2 py-3 bg-gray-100" />
                {columnTotals.map((col) => (
                  <React.Fragment key={`total-${col.quoteId}`}>
                    <td className="px-2 py-3 text-right text-xs text-gray-500 border-l border-gray-200 bg-gray-100">
                      <span className="block text-[10px]">{col.winsCount} vitórias</span>
                    </td>
                    <td className="px-2 py-3 text-right text-sm text-gray-800 bg-gray-100">
                      {formatCurrency(col.totalValue)}
                    </td>
                  </React.Fragment>
                ))}
                <td className="px-3 py-3 text-right border-l-2 border-green-200 bg-green-100">
                  <span className="text-sm font-bold text-green-800">
                    {formatCurrency(grandMinTotal)}
                  </span>
                </td>
                <td className="px-3 py-3 bg-green-100">
                  <span className="text-[10px] text-green-700">Melhor cenário</span>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}
