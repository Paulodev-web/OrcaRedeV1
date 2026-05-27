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
  emptyMessage,
  priceDisplay = 'comparison',
}: Props) {
  const supplierQuotesMode = priceDisplay === 'supplierQuotes';
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const activeItems = items.filter((i) => i.net_qty > 0);

  if (activeItems.length === 0) {
    return (
      emptyMessage ?? (
        <div className="flex flex-col items-center justify-center h-32 text-sm text-gray-400">
          <p>Todos os materiais estão cobertos pelo estoque.</p>
          <p className="text-xs mt-1">Ou nenhum item corresponde aos filtros ativos.</p>
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
            {activeItems.map((item, idx) => {
              const isExpanded = expandedId === item.material_id;
              const hasMultiple = item.all_offers.length > 1;
              const isEvenRow = idx % 2 === 0;
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
                    }`}
                  >
                    <td className="px-4 py-3">
                      <p className="text-sm font-medium text-[#1D3140]">{item.material_name}</p>
                      <p className="text-xs text-gray-400">
                        <span className="font-mono">{item.material_code}</span>
                      </p>
                      {renderRowBadge?.(item)}
                    </td>
                    <td className="px-4 py-3 text-right text-sm text-gray-600">
                      {formatNumber(item.net_qty)}
                    </td>
                    <td className="px-4 py-3">
                      {summary.supplierLabel ? (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-50 border border-green-200 px-2 py-1 rounded-full max-w-[200px]">
                          <Award className="h-3 w-3 flex-shrink-0" />
                          <span className="truncate" title={summary.supplierLabel}>
                            {summary.supplierLabel}
                          </span>
                        </span>
                      ) : (
                        <span className="text-xs text-amber-600">Sem cotação</span>
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
                      {hasMultiple && (
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedId(isExpanded ? null : item.material_id)
                          }
                          className="p-1 text-gray-400 hover:text-gray-600 rounded transition-colors"
                          aria-expanded={isExpanded}
                          aria-label="Comparar fornecedores"
                        >
                          <ChevronDown
                            className={`h-4 w-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                          />
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
                                <th className="px-3 py-2 text-left text-xs font-medium uppercase text-[#1D3140]">
                                  Fornecedor
                                </th>
                                {!supplierQuotesMode && (
                                  <>
                                    <th className="px-3 py-2 text-right text-xs font-medium uppercase text-[#1D3140]">
                                      Preço no PDF
                                    </th>
                                    <th className="px-3 py-2 text-right text-xs font-medium uppercase text-[#1D3140]">
                                      Fator
                                    </th>
                                  </>
                                )}
                                <th className="px-3 py-2 text-right text-xs font-medium uppercase text-[#1D3140]">
                                  Preço unit.
                                  {item.material_unit ? (
                                    <span className="font-normal normal-case text-gray-500">
                                      {' '}
                                      /{item.material_unit}
                                    </span>
                                  ) : null}
                                </th>
                                <th className="px-3 py-2 text-right text-xs font-medium uppercase text-[#1D3140]">
                                  Total
                                </th>
                                {onOfferSelect && (
                                  <th className="px-3 py-2 text-center text-xs font-medium uppercase text-[#1D3140] w-24">
                                    Ação
                                  </th>
                                )}
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-[#64ABDE]/10 bg-white">
                              {item.all_offers
                                .slice()
                                .sort((a, b) => a.preco_normalizado - b.preco_normalizado)
                                .map((offer, i) => {
                                  const isBest = i === 0;
                                  const isHighlighted =
                                    highlightedQuoteId === offer.quote_id;
                                  const isNegotiated = offer.preco_negociado != null;
                                  const pdfUnitNorm = originalNormalizedPrice(
                                    offer.preco_unit,
                                    offer.conversion_factor
                                  );
                                  return (
                                    <tr
                                      key={offer.quote_id}
                                      className={`${
                                        isHighlighted
                                          ? 'bg-blue-50 ring-1 ring-inset ring-blue-400'
                                          : isBest
                                            ? 'bg-green-50'
                                            : 'hover:bg-gray-50'
                                      } ${onOfferSelect ? 'cursor-pointer' : ''}`}
                                      onClick={
                                        onOfferSelect
                                          ? () =>
                                              onOfferSelect(
                                                item.material_id,
                                                offer.quote_id
                                              )
                                          : undefined
                                      }
                                    >
                                      <td className="px-3 py-2 text-xs font-medium text-gray-800">
                                        {isBest && (
                                          <Award className="inline h-3 w-3 text-green-600 mr-1" />
                                        )}
                                        {offer.supplier_name}
                                      </td>
                                      {!supplierQuotesMode && (
                                        <>
                                          <td className="px-3 py-2 text-xs text-right text-gray-600">
                                            {formatCurrency(offer.preco_unit)}
                                          </td>
                                          <td className="px-3 py-2 text-xs text-right text-gray-400">
                                            {formatNumber(offer.conversion_factor)}×
                                          </td>
                                        </>
                                      )}
                                      <td
                                        className={`px-3 py-2 text-xs text-right font-semibold ${
                                          isBest ? 'text-green-700' : 'text-gray-700'
                                        }`}
                                      >
                                        {formatCurrency(offer.preco_normalizado)}
                                        {isNegotiated && (
                                          <span className="block text-[10px] font-normal text-blue-600">
                                            Negociado
                                          </span>
                                        )}
                                        {supplierQuotesMode &&
                                          isNegotiated &&
                                          pdfUnitNorm !== offer.preco_normalizado && (
                                            <span className="block text-[10px] font-normal text-gray-400 line-through">
                                              {formatCurrency(pdfUnitNorm)}
                                            </span>
                                          )}
                                        {supplierQuotesMode && offer.conversion_factor !== 1 && (
                                          <span className="block text-[10px] font-normal text-gray-400">
                                            PDF: {formatCurrency(offer.preco_unit)} · fator{' '}
                                            {formatNumber(offer.conversion_factor)}×
                                          </span>
                                        )}
                                      </td>
                                      <td className="px-3 py-2 text-xs text-right text-gray-700">
                                        {formatCurrency(offer.total_normalizado)}
                                      </td>
                                      {onOfferSelect && (
                                        <td className="px-3 py-2 text-center text-xs">
                                          {isHighlighted ? (
                                            <span className="font-medium text-blue-700">
                                              Selecionado
                                            </span>
                                          ) : (
                                            <span className="text-[#64ABDE] hover:underline">
                                              Validar
                                            </span>
                                          )}
                                        </td>
                                      )}
                                    </tr>
                                  );
                                })}
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
              <td
                colSpan={4}
                className="px-4 py-3 text-sm font-semibold text-gray-700 text-right"
              >
                {totalLabel}
              </td>
              <td className="px-4 py-3 text-right text-sm font-bold text-[#1D3140]">
                {formatCurrency(totalValue)}
              </td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
