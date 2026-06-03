'use client';

import React, { useState } from 'react';
import { Award, ChevronDown } from 'lucide-react';
import type { ScenarioItem } from '@/actions/supplierQuotes';
import { suppliesTableBorderedScrollClass } from '@/lib/suppliesLayout';
import { originalNormalizedPrice } from '@/lib/supplierPrice';

/** comparison = detalhe PDF/fator; supplierQuotes = só preços de cotação (Cenário Ideal). */
export type ScenarioPriceDisplay = 'comparison' | 'supplierQuotes';

const formatCurrency = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

const formatNumber = (v: number) =>
  new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);

export interface RowSummary {
  supplierLabel: string;
  unitPrice: number;
  lineTotal: number;
}

interface Props {
  items: ScenarioItem[];
  description?: string;
  supplierColumnLabel?: string;
  totalLabel: string;
  totalValue: number;
  getRowSummary: (item: ScenarioItem) => RowSummary;
  renderRowBadge?: (item: ScenarioItem) => React.ReactNode;
  highlightQuoteId?: (materialId: string) => string | null;
  onOfferSelect?: (materialId: string, quoteId: string) => void;
  onManualQuoteRequest?: (item: ScenarioItem) => void;
  emptyMessage?: React.ReactNode;
  /** Cenário Ideal usa supplierQuotes — sem colunas técnicas de PDF/normalizado. */
  priceDisplay?: ScenarioPriceDisplay;
}

export default function ScenarioItemExpandableTable({
  items,
  description,
  supplierColumnLabel = 'Melhor fornecedor',
  totalLabel,
  totalValue,
  getRowSummary,
  renderRowBadge,
  highlightQuoteId,
  onOfferSelect,
  onManualQuoteRequest,
  emptyMessage,
  priceDisplay = 'comparison',
}: Props) {
  const supplierQuotesMode = priceDisplay === 'supplierQuotes';
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (items.length === 0) {
    return (
      emptyMessage ?? (
        <div className="flex flex-col items-center justify-center h-32 text-sm text-gray-400">
          <p>Nenhum material no orçamento consolidado.</p>
        </div>
      )
    );
  }

  return (
    <div className="space-y-4">
      {description && <p className="text-xs text-gray-500">{description}</p>}
      <div className={suppliesTableBorderedScrollClass}>
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50 sticky top-0 z-10">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider bg-gray-50">
                Material
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider w-20 bg-gray-50">
                Compra
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-40 bg-gray-50">
                {supplierColumnLabel}
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider w-32 bg-gray-50">
                Preço unit.
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider w-32 bg-gray-50">
                Total
              </th>
              <th className="px-4 py-3 w-8 bg-gray-50" />
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-100">
            {items.map((item, idx) => {
              const isExpanded = expandedId === item.material_id;
              const hasMultiple = item.all_offers.length > 1;
              const hasNoOffers = item.all_offers.length === 0;
              const isEvenRow = idx % 2 === 0;
              const isNoPurchase =
                item.is_session_excluded || item.net_qty <= 0;
              const summary = getRowSummary(item);
              const highlightedQuoteId = highlightQuoteId?.(item.material_id) ?? null;

              return (
                <React.Fragment key={item.material_id}>
                  <tr
                    className={`transition-colors ${
                      isExpanded
                        ? 'bg-[#64ABDE]/10'
                        : isEvenRow
                          ? 'bg-white hover:bg-gray-50'
                          : 'bg-gray-50/50 hover:bg-gray-100'
                    } ${isNoPurchase ? 'opacity-55' : ''}`}
                  >
                    <td className="px-4 py-3">
                      <p className="text-sm font-medium text-[#1D3140]">{item.material_name}</p>
                      <p className="text-xs text-gray-400">
                        <span className="font-mono">{item.material_code}</span>
                      </p>
                      {renderRowBadge?.(item)}
                    </td>
                    <td className="px-4 py-3 text-right text-sm text-gray-600">
                      {item.is_session_excluded
                        ? '—'
                        : item.net_qty <= 0
                          ? '✓'
                          : formatNumber(item.net_qty)}
                    </td>
                    <td className="px-4 py-3">
                      {summary.supplierLabel ? (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-50 border border-green-200 px-2 py-1 rounded-full max-w-[200px]">
                          <Award className="h-3 w-3 flex-shrink-0" />
                          <span className="truncate" title={summary.supplierLabel}>
                            {summary.supplierLabel}
                          </span>
                        </span>
                      ) : hasNoOffers && onManualQuoteRequest && !item.is_session_excluded && item.net_qty > 0 ? (
                        <button
                          type="button"
                          onClick={() => onManualQuoteRequest(item)}
                          className="text-xs font-medium text-[#64ABDE] hover:text-[#1D3140] hover:underline"
                        >
                          Cotação manual
                        </button>
                      ) : (
                        <span className="text-xs text-amber-600">
                          {item.is_session_excluded ? '—' : 'Sem cotação'}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <p className="text-sm font-bold text-[#1D3140]">
                        {summary.unitPrice > 0 ? formatCurrency(summary.unitPrice) : '—'}
                      </p>
                      {summary.unitPrice > 0 && item.material_unit && (
                        <p className="text-[10px] text-gray-400">/{item.material_unit}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <p className="text-sm font-semibold text-[#64ABDE]">
                        {summary.lineTotal > 0 ? formatCurrency(summary.lineTotal) : '—'}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {(hasMultiple || (hasNoOffers && onManualQuoteRequest && item.net_qty > 0 && !item.is_session_excluded)) && (
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedId(isExpanded ? null : item.material_id)
                          }
                          className="p-1 text-gray-400 hover:text-gray-600 rounded transition-colors"
                          aria-expanded={isExpanded}
                          aria-label={hasNoOffers ? 'Adicionar cotação manual' : 'Comparar fornecedores'}
                        >
                          <ChevronDown
                            className={`h-4 w-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                          />
                        </button>
                      )}
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr className="bg-[#64ABDE]/5">
                      <td colSpan={6} className="px-4 py-3">
                        {hasNoOffers && onManualQuoteRequest ? (
                          <button
                            type="button"
                            onClick={() => onManualQuoteRequest(item)}
                            className="text-sm font-medium text-[#64ABDE] hover:text-[#1D3140] hover:underline"
                          >
                            + Adicionar cotação manual
                          </button>
                        ) : (
                          <div className="space-y-2">
                            {item.all_offers.map((offer) => {
                              const isHighlighted = offer.quote_id === highlightedQuoteId;
                              const unitDisplay = supplierQuotesMode
                                ? offer.preco_normalizado
                                : originalNormalizedPrice(
                                    offer.preco_unit,
                                    offer.conversion_factor
                                  );
                              const lineTotal = offer.preco_normalizado * item.net_qty;

                              return (
                                <div
                                  key={offer.quote_item_id}
                                  className={`flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm ${
                                    isHighlighted
                                      ? 'border-[#64ABDE] bg-[#64ABDE]/10'
                                      : 'border-gray-200 bg-white'
                                  }`}
                                >
                                  <span className="font-medium text-[#1D3140]">
                                    {offer.supplier_name}
                                  </span>
                                  <div className="flex items-center gap-4">
                                    <span className="text-gray-600">
                                      {formatCurrency(unitDisplay)}
                                      {!supplierQuotesMode && offer.conversion_factor !== 1 && (
                                        <span className="text-xs text-gray-400 ml-1">
                                          (norm. {formatCurrency(offer.preco_normalizado)})
                                        </span>
                                      )}
                                    </span>
                                    {item.net_qty > 0 && (
                                      <span className="font-semibold text-[#64ABDE]">
                                        {formatCurrency(lineTotal)}
                                      </span>
                                    )}
                                    {onOfferSelect && item.net_qty > 0 && (
                                      <button
                                        type="button"
                                        onClick={() =>
                                          onOfferSelect(item.material_id, offer.quote_id)
                                        }
                                        className={`text-xs font-medium px-2 py-1 rounded ${
                                          isHighlighted
                                            ? 'bg-[#64ABDE] text-white'
                                            : 'text-[#64ABDE] hover:bg-[#64ABDE]/10'
                                        }`}
                                      >
                                        {isHighlighted ? 'Selecionado' : 'Selecionar'}
                                      </button>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex justify-end pt-2 border-t border-gray-100">
        <p className="text-sm text-gray-600">
          {totalLabel}{' '}
          <span className="font-bold text-[#1D3140]">{formatCurrency(totalValue)}</span>
        </p>
      </div>
    </div>
  );
}
