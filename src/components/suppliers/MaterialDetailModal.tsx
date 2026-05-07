'use client';

import React, { useMemo } from 'react';
import { Award, Package, TrendingUp, TrendingDown, AlertCircle, Info } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import type { ScenarioItem } from '@/actions/supplierQuotes';
import { getQuoteLabel } from '@/lib/quoteDisplay';
import { computeItemMetrics } from './scenarioFilterEngine';

const formatCurrency = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

const formatNumber = (v: number) =>
  new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);

const formatPercent = (v: number) =>
  new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(v);

export interface QuoteInfo {
  id: string;
  supplier_name: string;
  pdf_path?: string | null;
  display_name?: string | null;
}

interface Props {
  item: ScenarioItem | null;
  quotes: QuoteInfo[];
  enabledQuoteIds: Set<string>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function MaterialDetailModal({
  item,
  quotes,
  enabledQuoteIds,
  open,
  onOpenChange,
}: Props) {
  const quoteMap = useMemo(() => new Map(quotes.map((q) => [q.id, q])), [quotes]);

  const analysis = useMemo(() => {
    if (!item) return null;

    const metrics = computeItemMetrics(item, enabledQuoteIds);
    const visibleOffers = enabledQuoteIds.size === 0
      ? item.all_offers
      : item.all_offers.filter((o) => enabledQuoteIds.has(o.quote_id));

    // Sort offers by price (lowest first)
    const sortedOffers = [...visibleOffers].sort((a, b) => a.preco_normalizado - b.preco_normalizado);

    return {
      metrics,
      sortedOffers,
      winnerQuote: metrics.winnerQuoteId ? quoteMap.get(metrics.winnerQuoteId) : null,
    };
  }, [item, enabledQuoteIds, quoteMap]);

  if (!item || !analysis) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Detalhe do Material</DialogTitle>
          </DialogHeader>
          <div className="px-6 py-8 text-center text-gray-400">
            <AlertCircle className="h-8 w-8 mx-auto mb-2" />
            Nenhum material selecionado.
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  const { metrics, sortedOffers, winnerQuote } = analysis;
  const isFullyStocked = item.net_qty === 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5 text-[#64ABDE]" />
            {item.material_name}
          </DialogTitle>
          <DialogDescription>
            <span className="font-mono text-xs">{item.material_code}</span>
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 py-4 space-y-6 overflow-y-auto max-h-[60vh]">
          {/* Resumo do Material */}
          <div className="grid grid-cols-3 gap-4">
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-center">
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Necessidade</p>
              <p className="text-lg font-bold text-[#1D3140]">{formatNumber(item.required_qty)}</p>
            </div>
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-center">
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Estoque</p>
              <p className="text-lg font-bold text-gray-600">
                {item.stock_qty > 0 ? formatNumber(item.stock_qty) : '—'}
              </p>
            </div>
            <div className={`rounded-lg border p-3 text-center ${isFullyStocked ? 'border-green-200 bg-green-50' : 'border-[#64ABDE]/30 bg-[#64ABDE]/5'}`}>
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Compra</p>
              <p className={`text-lg font-bold ${isFullyStocked ? 'text-green-600' : 'text-[#1D3140]'}`}>
                {isFullyStocked ? '✓ Atendido' : formatNumber(item.net_qty)}
              </p>
            </div>
          </div>

          {isFullyStocked && (
            <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
              <Info className="h-4 w-4 flex-shrink-0" />
              Este material já está completamente atendido pelo estoque.
            </div>
          )}

          {/* Comparação de Preços */}
          {!isFullyStocked && sortedOffers.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                <TrendingDown className="h-4 w-4 text-[#64ABDE]" />
                Comparação de Preços
              </h3>
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">Orçamento</th>
                      <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500 uppercase">Preço Unit.</th>
                      <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500 uppercase">Valor Total</th>
                      <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500 uppercase">vs Melhor</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {sortedOffers.map((offer, idx) => {
                      const quote = quoteMap.get(offer.quote_id);
                      const label = quote ? getQuoteLabel(quote) : offer.supplier_name;
                      const isWinner = offer.quote_id === metrics.winnerQuoteId;
                      const pctDiff = metrics.percentVsBest.get(offer.quote_id) ?? 0;
                      const totalValue = offer.preco_normalizado * item.net_qty;

                      return (
                        <tr
                          key={offer.quote_id}
                          className={isWinner ? 'bg-green-50' : idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}
                        >
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              {isWinner && (
                                <Award className="h-4 w-4 text-green-600 flex-shrink-0" />
                              )}
                              <span className={`truncate max-w-[180px] ${isWinner ? 'font-semibold text-green-800' : 'text-gray-700'}`} title={label}>
                                {label}
                              </span>
                            </div>
                          </td>
                          <td className={`px-4 py-3 text-right ${isWinner ? 'font-bold text-green-800' : 'text-gray-700'}`}>
                            {formatCurrency(offer.preco_normalizado)}
                            {offer.conversion_factor !== 1 && (
                              <span className="block text-xs text-gray-400 font-normal">
                                ÷ {formatNumber(offer.conversion_factor)}
                              </span>
                            )}
                          </td>
                          <td className={`px-4 py-3 text-right ${isWinner ? 'font-semibold text-green-700' : 'text-gray-600'}`}>
                            {formatCurrency(totalValue)}
                          </td>
                          <td className="px-4 py-3 text-right">
                            {isWinner ? (
                              <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-100 px-2 py-0.5 rounded-full">
                                Melhor
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700">
                                <TrendingUp className="h-3 w-3" />
                                +{formatPercent(pctDiff)}%
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
          )}

          {/* Sem Cobertura */}
          {!isFullyStocked && sortedOffers.length === 0 && (
            <div className="flex flex-col items-center justify-center py-8 text-gray-400">
              <AlertCircle className="h-10 w-10 mb-2 text-amber-400" />
              <p className="text-sm font-medium text-amber-600">Sem cobertura</p>
              <p className="text-xs text-gray-500 mt-1">
                Nenhum orçamento cobre este material com os filtros atuais.
              </p>
            </div>
          )}

          {/* Resumo de Economia */}
          {!isFullyStocked && metrics.priceSpread > 0 && (
            <div className="rounded-lg border border-[#64ABDE]/30 bg-[#64ABDE]/5 p-4">
              <h3 className="text-sm font-semibold text-[#1D3140] mb-2 flex items-center gap-2">
                <TrendingDown className="h-4 w-4 text-green-600" />
                Economia Potencial
              </h3>
              <p className="text-sm text-gray-600">
                A diferença entre o menor e o maior preço é de{' '}
                <span className="font-semibold text-green-700">{formatCurrency(metrics.priceSpread)}</span>
                {' '}por unidade.
              </p>
              {item.net_qty > 0 && (
                <p className="text-sm text-gray-600 mt-1">
                  Para a quantidade de compra ({formatNumber(item.net_qty)} un.), isso representa{' '}
                  <span className="font-semibold text-green-700">
                    {formatCurrency(metrics.priceSpread * item.net_qty)}
                  </span>
                  {' '}de economia potencial.
                </p>
              )}
            </div>
          )}

          {/* Vencedor */}
          {!isFullyStocked && winnerQuote && (
            <div className="rounded-lg border border-green-200 bg-green-50 p-4">
              <div className="flex items-center gap-3">
                <div className="flex-shrink-0">
                  <Award className="h-8 w-8 text-green-600" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-green-800">
                    Melhor opção: {getQuoteLabel(winnerQuote)}
                  </p>
                  <p className="text-xs text-green-600 mt-0.5">
                    {formatCurrency(metrics.minPrice ?? 0)} / unidade
                    {' • '}
                    Total: {formatCurrency((metrics.minPrice ?? 0) * item.net_qty)}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
