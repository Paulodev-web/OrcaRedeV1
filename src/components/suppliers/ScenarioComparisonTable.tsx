'use client';

import React, { useMemo } from 'react';
import { Award, TrendingDown, AlertCircle } from 'lucide-react';
import type { ScenarioItem } from '@/actions/supplierQuotes';
import { getQuoteLabel } from '@/lib/quoteDisplay';

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

interface Props {
  items: ScenarioItem[];
  quotes: QuoteColumnInfo[];
  enabledQuoteIds: Set<string>;
  onMaterialClick?: (item: ScenarioItem) => void;
}

export default function ScenarioComparisonTable({
  items,
  quotes,
  enabledQuoteIds,
  onMaterialClick,
}: Props) {
  const quoteMap = useMemo(() => new Map(quotes.map((q) => [q.id, q])), [quotes]);
  const availableQuoteIds = useMemo(() => new Set(quotes.map((q) => q.id)), [quotes]);

  // Remove IDs that no longer exist in current dataset.
  const validEnabledQuoteIds = useMemo(() => {
    if (enabledQuoteIds.size === 0) return enabledQuoteIds;
    const validIds = new Set(
      Array.from(enabledQuoteIds).filter((quoteId) => availableQuoteIds.has(quoteId))
    );
    // Empty set means "all visible" in this screen.
    return validIds.size === 0 ? new Set<string>() : validIds;
  }, [enabledQuoteIds, availableQuoteIds]);

  // Filter quotes to only show enabled ones
  const visibleQuotes = useMemo(() => {
    if (validEnabledQuoteIds.size === 0) return quotes;
    return quotes.filter((q) => validEnabledQuoteIds.has(q.id));
  }, [quotes, validEnabledQuoteIds]);

  // Build evaluation data for each row
  const { rows, columnTotals, grandMinTotal } = useMemo(() => {
    const rowsData: EvaluationRowData[] = [];
    const totalsMap = new Map<string, { total: number; covered: number; wins: number }>();

    // Initialize totals for each visible quote
    for (const q of visibleQuotes) {
      totalsMap.set(q.id, { total: 0, covered: 0, wins: 0 });
    }

    let grandMin = 0;

    for (const item of items) {
      // Filter offers to only visible quotes
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

          // Update winner count
          const winnerTotals = totalsMap.get(winner.quote_id);
          if (winnerTotals && item.net_qty > 0) {
            winnerTotals.wins += 1;
          }
        }
      }

      // Update column totals
      for (const offer of visibleOffers) {
        const colTotals = totalsMap.get(offer.quote_id);
        if (colTotals) {
          const offerTotal = offer.preco_normalizado * item.net_qty;
          colTotals.total += offerTotal;
          if (item.net_qty > 0) {
            colTotals.covered += 1;
          }
        }
      }

      // Add to grand minimum total
      if (minTotal !== null && item.net_qty > 0) {
        grandMin += minTotal;
      }

      const winnerQ = winnerQuoteId ? quoteMap.get(winnerQuoteId) : null;

      rowsData.push({
        item,
        minPrice,
        minTotal,
        winnerQuoteId,
        winnerLabel: winnerQ ? getQuoteLabel(winnerQ) : '',
        priceSpread,
        hasDivergence,
        hasNoCoverage,
      });
    }

    const colTotals: ColumnTotals[] = visibleQuotes.map((q) => {
      const t = totalsMap.get(q.id) ?? { total: 0, covered: 0, wins: 0 };
      return {
        quoteId: q.id,
        label: getQuoteLabel(q),
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
        Tabela de avaliação: preços normalizados (÷ fator). Clique em uma linha para ver detalhes do material.
      </p>
      <div className="overflow-x-auto border border-gray-200 rounded-lg">
        <div className="max-h-[600px] overflow-y-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50 sticky top-0 z-20">
              <tr>
                {/* Material column */}
                <th className="sticky left-0 z-30 bg-gray-50 px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[220px] shadow-[2px_0_4px_-2px_rgba(0,0,0,0.1)]">
                  Material
                </th>
                {/* Qty columns */}
                <th className="px-2 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider w-16 bg-gray-50">Nec.</th>
                <th className="px-2 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider w-16 bg-gray-50">Est.</th>
                <th className="px-2 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider w-16 bg-gray-50">Compra</th>
                {/* Quote columns - 2 sub-columns each */}
                {visibleQuotes.map((q) => (
                  <th
                    key={q.id}
                    colSpan={2}
                    className="px-2 py-2 text-center text-xs font-medium text-gray-600 uppercase tracking-wider bg-gray-50 border-l border-gray-200"
                  >
                    <span className="block truncate max-w-[180px]" title={getQuoteLabel(q)}>
                      {getQuoteLabel(q)}
                    </span>
                  </th>
                ))}
                {/* Minimum and Winner columns */}
                <th className="px-3 py-3 text-right text-xs font-medium text-green-700 uppercase tracking-wider w-24 bg-green-50 border-l-2 border-green-200">
                  Mínimo
                </th>
                <th className="px-3 py-3 text-left text-xs font-medium text-green-700 uppercase tracking-wider min-w-[120px] bg-green-50">
                  Vencedor
                </th>
              </tr>
              {/* Sub-header row for unit/total */}
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
                const { item, minPrice, minTotal, winnerQuoteId, winnerLabel, hasNoCoverage } = row;
                const isFullyStocked = item.net_qty === 0;
                const isEvenRow = idx % 2 === 0;
                const rowBg = isEvenRow ? 'bg-white' : 'bg-gray-50/50';

                // Build offer map by quote_id
                const offerMap = new Map(item.all_offers.map((o) => [o.quote_id, o]));

                return (
                  <tr
                    key={item.material_id}
                    onClick={() => onMaterialClick?.(item)}
                    className={`hover:bg-[#64ABDE]/5 transition-colors cursor-pointer ${isFullyStocked ? 'opacity-50' : ''} ${rowBg}`}
                  >
                    {/* Material */}
                    <td className={`sticky left-0 z-10 px-4 py-2.5 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.1)] ${rowBg}`}>
                      <p className="font-medium text-[#1D3140] truncate max-w-[200px]" title={item.material_name}>
                        {item.material_name}
                      </p>
                      <p className="text-xs text-gray-400 font-mono">{item.material_code}</p>
                    </td>
                    {/* Quantities */}
                    <td className="px-2 py-2.5 text-right text-gray-600 text-xs">{formatNumber(item.required_qty)}</td>
                    <td className="px-2 py-2.5 text-right text-gray-400 text-xs">
                      {item.stock_qty > 0 ? formatNumber(item.stock_qty) : '—'}
                    </td>
                    <td className={`px-2 py-2.5 text-right text-xs font-medium ${isFullyStocked ? 'text-green-600' : 'text-[#1D3140]'}`}>
                      {isFullyStocked ? '✓' : formatNumber(item.net_qty)}
                    </td>
                    {/* Quote columns */}
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

                      const unitCellClass = isWinner
                        ? 'bg-green-100 font-bold text-green-800'
                        : 'text-gray-700';
                      const totalCellClass = isWinner
                        ? 'bg-green-50 font-semibold text-green-700'
                        : 'text-gray-600';

                      return (
                        <React.Fragment key={q.id}>
                          <td className={`px-2 py-2.5 text-right text-xs border-l border-gray-100 ${unitCellClass}`}>
                            {formatCurrency(offer.preco_normalizado)}
                            {offer.conversion_factor !== 1 && (
                              <span className="block text-[10px] text-gray-400 font-normal">÷{formatNumber(offer.conversion_factor)}</span>
                            )}
                          </td>
                          <td className={`px-2 py-2.5 text-right text-xs ${totalCellClass}`}>
                            {formatCurrency(offer.preco_normalizado * item.net_qty)}
                          </td>
                        </React.Fragment>
                      );
                    })}
                    {/* Minimum column */}
                    <td className="px-3 py-2.5 text-right border-l-2 border-green-200 bg-green-50/50">
                      {hasNoCoverage ? (
                        <span className="text-xs text-amber-600 font-medium">Sem cotação</span>
                      ) : (
                        <span className="text-xs font-bold text-green-700">
                          {minPrice !== null ? formatCurrency(minPrice) : '—'}
                        </span>
                      )}
                    </td>
                    {/* Winner column */}
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
            {/* Footer with totals */}
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
