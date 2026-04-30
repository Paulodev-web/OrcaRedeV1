/**
 * Engine de filtros client-side para cenários.
 * Os totais derivados são apenas visuais — não substituem o cálculo canônico do servidor.
 */

import type { ScenariosResult, ScenarioItem, ScenarioSupplier } from '@/actions/supplierQuotes';

export type SortOption = 'price' | 'name' | 'supplier';

export interface ScenarioFilterState {
  enabledQuoteIds: Set<string>;
  searchTerm: string;
  showOnlyUncovered: boolean;
  sortBy: SortOption;
  priceMin: number | null;
  priceMax: number | null;
  groupBySupplier: boolean;
  showOnlyDifferences: boolean;
}

export const defaultFilterState: ScenarioFilterState = {
  enabledQuoteIds: new Set(),
  searchTerm: '',
  showOnlyUncovered: false,
  sortBy: 'name',
  priceMin: null,
  priceMax: null,
  groupBySupplier: true,
  showOnlyDifferences: false,
};

export interface FilteredScenariosResult extends ScenariosResult {
  filteredItems: ScenarioItem[];
  isFiltered: boolean;
}

/**
 * Deriva cenários filtrados com base no estado de filtros.
 * Recalcula totais client-side para refletir apenas orçamentos/itens visíveis.
 */
export function deriveFilteredScenarios(
  base: ScenariosResult,
  filterState: ScenarioFilterState
): FilteredScenariosResult {
  const { enabledQuoteIds, searchTerm, showOnlyUncovered, sortBy, priceMin, priceMax, showOnlyDifferences } = filterState;

  const hasActiveFilters =
    enabledQuoteIds.size > 0 ||
    searchTerm.trim() !== '' ||
    showOnlyUncovered ||
    priceMin !== null ||
    priceMax !== null ||
    showOnlyDifferences;

  // Se não há filtros ativos, retorna os dados originais
  if (!hasActiveFilters) {
    const sorted = sortItems(base.scenarioB.items, sortBy);
    return {
      ...base,
      filteredItems: sorted,
      isFiltered: false,
    };
  }

  const searchLower = searchTerm.toLowerCase().trim();

  // Filtra e recalcula cada item
  const filteredItems: ScenarioItem[] = [];
  let scenarioBTotal = 0;

  for (const item of base.scenarioB.items) {
    // Filtra ofertas por quote_id habilitado
    let offers = item.all_offers;
    if (enabledQuoteIds.size > 0) {
      offers = offers.filter((o) => enabledQuoteIds.has(o.quote_id));
    }

    // Se não sobrou nenhuma oferta após filtro de quotes, item pode ser considerado "não coberto"
    const hasCoverage = offers.length > 0;

    // Filtro por busca (nome ou código do material)
    if (searchLower) {
      const matchesSearch =
        item.material_name.toLowerCase().includes(searchLower) ||
        item.material_code.toLowerCase().includes(searchLower);
      if (!matchesSearch) continue;
    }

    // Filtro "só não cobertos"
    if (showOnlyUncovered && hasCoverage) continue;

    // Recalcula best offer com as ofertas filtradas
    let bestSupplier = item.best_supplier;
    let bestPriceNormalized = item.best_price_normalized;
    let bestTotal = item.best_total;

    if (hasCoverage) {
      const best = offers.reduce((a, b) => (a.preco_normalizado < b.preco_normalizado ? a : b));
      bestSupplier = best.supplier_name;
      bestPriceNormalized = best.preco_normalizado;
      bestTotal = best.preco_normalizado * item.net_qty;
    } else if (enabledQuoteIds.size > 0) {
      bestSupplier = '';
      bestPriceNormalized = 0;
      bestTotal = 0;
    }

    // Filtro por faixa de preço (aplica no menor preço normalizado visível)
    if (priceMin !== null && bestPriceNormalized < priceMin) continue;
    if (priceMax !== null && bestPriceNormalized > priceMax) continue;

    const filteredItem: ScenarioItem = {
      ...item,
      all_offers: offers,
      best_supplier: bestSupplier,
      best_price_normalized: bestPriceNormalized,
      best_total: bestTotal,
    };

    filteredItems.push(filteredItem);
    if (item.net_qty > 0 && hasCoverage) {
      scenarioBTotal += bestTotal;
    }
  }

  // Recalcula cenário A com os quotes habilitados
  const supplierTotals = new Map<string, { quote_id: string; total: number; items_covered: number }>();

  for (const item of filteredItems) {
    if (item.net_qty === 0) continue;

    for (const offer of item.all_offers) {
      const existing = supplierTotals.get(offer.supplier_name);
      const offerTotal = offer.preco_normalizado * item.net_qty;
      if (existing) {
        existing.total += offerTotal;
        existing.items_covered += 1;
      } else {
        supplierTotals.set(offer.supplier_name, {
          quote_id: offer.quote_id,
          total: offerTotal,
          items_covered: 1,
        });
      }
    }
  }

  const totalItemsWithDemand = filteredItems.filter((i) => i.net_qty > 0).length;
  const scenarioA: ScenarioSupplier[] = Array.from(supplierTotals.entries())
    .map(([supplier_name, data]) => ({
      supplier_name,
      quote_id: data.quote_id,
      items_covered: data.items_covered,
      total_items: totalItemsWithDemand,
      total_normalizado: data.total,
    }))
    .sort((a, b) => a.total_normalizado - b.total_normalizado);

  const cheapestATotal = scenarioA[0]?.total_normalizado ?? 0;
  const savingVsA = cheapestATotal - scenarioBTotal;

  // Filtro "mostrar apenas onde B difere de A"
  let finalItems = filteredItems;
  if (showOnlyDifferences && scenarioA.length > 0) {
    const cheapestASupplier = scenarioA[0].supplier_name;
    finalItems = filteredItems.filter((item) => {
      if (item.net_qty === 0) return false;
      return item.best_supplier !== cheapestASupplier;
    });
  }

  // Ordena
  const sortedItems = sortItems(finalItems, sortBy);

  return {
    scenarioA,
    scenarioB: {
      items: base.scenarioB.items,
      total_normalizado: scenarioBTotal,
      saving_vs_cheapest_a: savingVsA,
    },
    budget_total_reference: cheapestATotal,
    filteredItems: sortedItems,
    isFiltered: true,
  };
}

function sortItems(items: ScenarioItem[], sortBy: SortOption): ScenarioItem[] {
  const sorted = [...items];
  switch (sortBy) {
    case 'price':
      sorted.sort((a, b) => a.best_price_normalized - b.best_price_normalized);
      break;
    case 'name':
      sorted.sort((a, b) => a.material_name.localeCompare(b.material_name, 'pt-BR'));
      break;
    case 'supplier':
      sorted.sort((a, b) => a.best_supplier.localeCompare(b.best_supplier, 'pt-BR'));
      break;
  }
  return sorted;
}

/**
 * Extrai todos os quote_ids únicos dos cenários.
 */
export function extractUniqueQuoteIds(scenarios: ScenariosResult): string[] {
  const ids = new Set<string>();
  for (const item of scenarios.scenarioB.items) {
    for (const offer of item.all_offers) {
      ids.add(offer.quote_id);
    }
  }
  return Array.from(ids);
}
