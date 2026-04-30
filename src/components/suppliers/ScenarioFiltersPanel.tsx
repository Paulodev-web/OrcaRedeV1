'use client';

import React, { useCallback } from 'react';
import {
  ChevronDown,
  Filter,
  Search,
  X,
} from 'lucide-react';
import type { ScenarioFilterState, SortOption } from './scenarioFilterEngine';
import { getQuoteLabel } from '@/lib/quoteDisplay';

interface QuoteInfo {
  id: string;
  supplier_name: string;
  pdf_path?: string | null;
  display_name?: string | null;
}

interface Props {
  quotes: QuoteInfo[];
  filterState: ScenarioFilterState;
  onFilterChange: (state: ScenarioFilterState) => void;
  isExpanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
}

export default function ScenarioFiltersPanel({
  quotes,
  filterState,
  onFilterChange,
  isExpanded,
  onExpandedChange,
}: Props) {
  const activeFilterCount = countActiveFilters(filterState, quotes.length);

  const updateFilter = useCallback(
    <K extends keyof ScenarioFilterState>(key: K, value: ScenarioFilterState[K]) => {
      onFilterChange({ ...filterState, [key]: value });
    },
    [filterState, onFilterChange]
  );

  const toggleQuote = useCallback(
    (quoteId: string) => {
      const next = new Set(filterState.enabledQuoteIds);
      if (next.has(quoteId)) {
        next.delete(quoteId);
      } else {
        next.add(quoteId);
      }
      updateFilter('enabledQuoteIds', next);
    },
    [filterState.enabledQuoteIds, updateFilter]
  );

  const selectAllQuotes = useCallback(() => {
    updateFilter('enabledQuoteIds', new Set());
  }, [updateFilter]);

  const clearAllQuotes = useCallback(() => {
    updateFilter('enabledQuoteIds', new Set(quotes.map((q) => q.id)));
  }, [quotes, updateFilter]);

  const clearFilters = useCallback(() => {
    onFilterChange({
      enabledQuoteIds: new Set(),
      searchTerm: '',
      showOnlyUncovered: false,
      showOnlyDivergent: false,
      sortBy: 'name',
      priceMin: null,
      priceMax: null,
      groupBySupplier: true,
      showOnlyDifferences: false,
    });
  }, [onFilterChange]);

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
      <button
        type="button"
        onClick={() => onExpandedChange(!isExpanded)}
        className="flex w-full items-center justify-between px-5 py-4 text-left hover:bg-gray-50/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Filter className="h-5 w-5 text-[#64ABDE]" />
          <span className="text-sm font-semibold text-[#1D3140]">Filtros e visualização</span>
          {activeFilterCount > 0 && (
            <span className="inline-flex items-center justify-center h-5 min-w-[20px] px-1.5 text-xs font-medium text-white bg-[#64ABDE] rounded-full">
              {activeFilterCount}
            </span>
          )}
        </div>
        <ChevronDown
          className={`h-4 w-4 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
        />
      </button>

      {isExpanded && (
        <div className="border-t border-gray-100 px-5 pb-5 space-y-5">
          {/* Busca por material */}
          <div className="pt-4">
            <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
              Buscar material
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                value={filterState.searchTerm}
                onChange={(e) => updateFilter('searchTerm', e.target.value)}
                placeholder="Nome ou código do material..."
                className="w-full rounded-lg border border-gray-200 pl-10 pr-4 py-2 text-sm focus:border-[#64ABDE] focus:outline-none focus:ring-1 focus:ring-[#64ABDE]/30"
              />
              {filterState.searchTerm && (
                <button
                  type="button"
                  onClick={() => updateFilter('searchTerm', '')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>

          {/* Toggle por orçamento */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide">
                Orçamentos visíveis
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={selectAllQuotes}
                  className="text-xs text-[#64ABDE] hover:underline"
                >
                  Todos
                </button>
                <span className="text-gray-300">|</span>
                <button
                  type="button"
                  onClick={clearAllQuotes}
                  className="text-xs text-[#64ABDE] hover:underline"
                >
                  Nenhum
                </button>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {quotes.map((quote) => {
                const isEnabled = filterState.enabledQuoteIds.size === 0 || filterState.enabledQuoteIds.has(quote.id);
                return (
                  <button
                    key={quote.id}
                    type="button"
                    onClick={() => toggleQuote(quote.id)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                      isEnabled
                        ? 'bg-[#64ABDE]/10 border-[#64ABDE]/30 text-[#1D3140]'
                        : 'bg-gray-50 border-gray-200 text-gray-400 line-through'
                    }`}
                  >
                    <span
                      className={`w-2 h-2 rounded-full ${isEnabled ? 'bg-[#64ABDE]' : 'bg-gray-300'}`}
                    />
                    {getQuoteLabel(quote)}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Grid de controles */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Ordenação */}
            <div>
              <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                Ordenar por
              </label>
              <select
                value={filterState.sortBy}
                onChange={(e) => updateFilter('sortBy', e.target.value as SortOption)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-[#64ABDE] focus:outline-none"
              >
                <option value="name">Nome do material</option>
                <option value="price">Menor preço</option>
                <option value="supplier">Fornecedor vencedor</option>
                <option value="economy">Economia potencial</option>
              </select>
            </div>

            {/* Faixa de preço min */}
            <div>
              <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                Preço mínimo
              </label>
              <input
                type="number"
                min={0}
                step="0.01"
                value={filterState.priceMin ?? ''}
                onChange={(e) =>
                  updateFilter('priceMin', e.target.value ? parseFloat(e.target.value) : null)
                }
                placeholder="R$ 0,00"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-[#64ABDE] focus:outline-none"
              />
            </div>

            {/* Faixa de preço max */}
            <div>
              <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                Preço máximo
              </label>
              <input
                type="number"
                min={0}
                step="0.01"
                value={filterState.priceMax ?? ''}
                onChange={(e) =>
                  updateFilter('priceMax', e.target.value ? parseFloat(e.target.value) : null)
                }
                placeholder="Sem limite"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-[#64ABDE] focus:outline-none"
              />
            </div>

            {/* Agrupar por fornecedor */}
            <div>
              <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                Agrupar colunas
              </label>
              <select
                value={filterState.groupBySupplier ? 'supplier' : 'quote'}
                onChange={(e) => updateFilter('groupBySupplier', e.target.value === 'supplier')}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-[#64ABDE] focus:outline-none"
              >
                <option value="supplier">Por fornecedor</option>
                <option value="quote">Por orçamento (PDF)</option>
              </select>
            </div>
          </div>

          {/* Checkboxes */}
          <div className="flex flex-wrap gap-4">
            <label className="inline-flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={filterState.showOnlyUncovered}
                onChange={(e) => updateFilter('showOnlyUncovered', e.target.checked)}
                className="rounded border-gray-300 text-[#64ABDE] focus:ring-[#64ABDE]/30"
              />
              <span className="text-sm text-gray-700">Apenas sem cobertura</span>
            </label>

            <label className="inline-flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={filterState.showOnlyDivergent}
                onChange={(e) => updateFilter('showOnlyDivergent', e.target.checked)}
                className="rounded border-gray-300 text-[#64ABDE] focus:ring-[#64ABDE]/30"
              />
              <span className="text-sm text-gray-700">Apenas divergentes (2+ preços)</span>
            </label>

            <label className="inline-flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={filterState.showOnlyDifferences}
                onChange={(e) => updateFilter('showOnlyDifferences', e.target.checked)}
                className="rounded border-gray-300 text-[#64ABDE] focus:ring-[#64ABDE]/30"
              />
              <span className="text-sm text-gray-700">Onde B difere de A</span>
            </label>
          </div>

          {/* Limpar filtros */}
          {activeFilterCount > 0 && (
            <div className="pt-2 border-t border-gray-100">
              <button
                type="button"
                onClick={clearFilters}
                className="text-sm text-[#64ABDE] hover:underline"
              >
                Limpar todos os filtros
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function countActiveFilters(state: ScenarioFilterState, totalQuotes: number): number {
  let count = 0;
  if (state.enabledQuoteIds.size > 0 && state.enabledQuoteIds.size < totalQuotes) count++;
  if (state.searchTerm.trim()) count++;
  if (state.showOnlyUncovered) count++;
  if (state.showOnlyDivergent) count++;
  if (state.sortBy !== 'name') count++;
  if (state.priceMin !== null) count++;
  if (state.priceMax !== null) count++;
  if (!state.groupBySupplier) count++;
  if (state.showOnlyDifferences) count++;
  return count;
}
