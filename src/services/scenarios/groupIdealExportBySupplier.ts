import type { IdealSelectionRow, ScenariosResult } from '@/actions/supplierQuotes';
import {
  buildEffectiveSelectionMap,
  getBestOfferQuoteId,
} from '@/lib/scenarioIdealEngine';
import { originalNormalizedPrice } from '@/lib/supplierPrice';
import { slugifyFileName, uniqueSlug } from '@/lib/slugify';
import type { IdealExportRow, SupplierExportData } from '@/types/exportIdeal';

export function buildSelectionMap(selections: IdealSelectionRow[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const row of selections) {
    map.set(row.material_id, row.quote_id);
  }
  return map;
}

/** Materiais com net_qty > 0 sem oferta resolvível (nem validado nem menor preço). */
export function countPendingMaterials(
  items: ScenariosResult['scenarioB']['items'],
  validatedMap: Map<string, string>
): number {
  const effective = buildEffectiveSelectionMap(items, validatedMap);
  let count = 0;
  for (const item of items) {
    if (item.net_qty > 0 && !effective.has(item.material_id)) count += 1;
  }
  return count;
}

/**
 * Agrupa linhas de exportação por fornecedor do Cenário Ideal.
 * Usa seleção validada; se ausente, menor preço normalizado (Cenário B).
 */
export function groupIdealExportBySupplier(
  scenarios: ScenariosResult,
  selections: IdealSelectionRow[]
): SupplierExportData[] {
  const validatedMap = buildSelectionMap(selections);
  const effectiveMap = buildEffectiveSelectionMap(scenarios.scenarioB.items, validatedMap);
  const groups = new Map<string, IdealExportRow[]>();

  for (const item of scenarios.scenarioB.items) {
    if (item.net_qty <= 0) continue;

    const quoteId =
      effectiveMap.get(item.material_id) ?? getBestOfferQuoteId(item);
    if (!quoteId) continue;

    const offer = item.all_offers.find((o) => o.quote_id === quoteId);
    if (!offer) continue;

    const precoOriginalNorm = originalNormalizedPrice(
      offer.preco_unit,
      offer.conversion_factor
    );
    const precoNegociadoNorm = offer.preco_normalizado;
    const hasNegociado = offer.preco_negociado != null;
    const diferenca = hasNegociado ? precoOriginalNorm - precoNegociadoNorm : 0;
    const precoTotal = precoNegociadoNorm * item.net_qty;

    const row: IdealExportRow = {
      codigo: item.material_code,
      material: item.material_name,
      precoOriginalNorm,
      precoNegociadoNorm: hasNegociado ? precoNegociadoNorm : precoOriginalNorm,
      diferenca,
      quantidade: item.net_qty,
      precoTotal,
    };

    const existing = groups.get(offer.supplier_name);
    if (existing) {
      existing.push(row);
    } else {
      groups.set(offer.supplier_name, [row]);
    }
  }

  const usedSlugs = new Set<string>();
  const result: SupplierExportData[] = [];

  for (const [supplierName, rows] of groups) {
    rows.sort((a, b) => a.material.localeCompare(b.material, 'pt-BR'));
    const grandTotal = rows.reduce((sum, r) => sum + r.precoTotal, 0);
    const baseSlug = slugifyFileName(supplierName);
    const fileSlug = uniqueSlug(baseSlug, usedSlugs);
    result.push({ supplierName, fileSlug, rows, grandTotal });
  }

  result.sort((a, b) => a.supplierName.localeCompare(b.supplierName, 'pt-BR'));
  return result;
}
