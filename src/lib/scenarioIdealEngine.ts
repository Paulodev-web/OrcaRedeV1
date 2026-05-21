import type { ScenarioItem } from '@/actions/supplierQuotes';

export type IdealLineStatus = 'validated' | 'suggested' | 'pending' | 'no_demand';

export interface IdealScenarioLine {
  material_id: string;
  material_name: string;
  material_code: string;
  net_qty: number;
  quote_id: string;
  supplier_name: string;
  preco_normalizado: number;
  line_total: number;
  status: IdealLineStatus;
  isValidated: boolean;
}

export interface IdealScenarioResult {
  lines: IdealScenarioLine[];
  total: number;
  /** Itens com compra sem validação explícita no banco */
  unvalidatedCount: number;
  /** Itens sem oferta resolvível (sem sugestão nem validado) */
  pendingCount: number;
  diffVsA: number;
  diffVsB: number;
}

export function getBestOfferQuoteId(item: ScenarioItem): string | null {
  if (item.net_qty <= 0 || item.all_offers.length === 0) return null;
  const best = item.all_offers.reduce((a, b) =>
    a.preco_normalizado < b.preco_normalizado ? a : b
  );
  return best.quote_id;
}

export function isValidated(materialId: string, validatedMap: Map<string, string>): boolean {
  return validatedMap.has(materialId);
}

export function getEffectiveQuoteId(
  item: ScenarioItem,
  validatedMap: Map<string, string>
): string | null {
  const validated = validatedMap.get(item.material_id);
  if (validated) return validated;
  return getBestOfferQuoteId(item);
}

export function buildEffectiveSelectionMap(
  items: ScenarioItem[],
  validatedMap: Map<string, string>
): Map<string, string> {
  const effective = new Map<string, string>();
  for (const item of items) {
    if (item.net_qty <= 0) continue;
    const quoteId = getEffectiveQuoteId(item, validatedMap);
    if (quoteId) effective.set(item.material_id, quoteId);
  }
  return effective;
}

export function countUnvalidatedMaterials(
  items: ScenarioItem[],
  validatedMap: Map<string, string>
): number {
  let count = 0;
  for (const item of items) {
    if (item.net_qty > 0 && !validatedMap.has(item.material_id)) count += 1;
  }
  return count;
}

export function computeIdealScenario(
  items: ScenarioItem[],
  validatedMap: Map<string, string>,
  scenarioATotal: number,
  scenarioBTotal: number
): IdealScenarioResult {
  const effectiveMap = buildEffectiveSelectionMap(items, validatedMap);
  const lines: IdealScenarioLine[] = [];
  let total = 0;
  let unvalidatedCount = 0;
  let pendingCount = 0;

  for (const item of items) {
    if (item.net_qty <= 0) {
      lines.push({
        material_id: item.material_id,
        material_name: item.material_name,
        material_code: item.material_code,
        net_qty: item.net_qty,
        quote_id: '',
        supplier_name: '',
        preco_normalizado: 0,
        line_total: 0,
        status: 'no_demand',
        isValidated: false,
      });
      continue;
    }

    const hasValidated = validatedMap.has(item.material_id);
    if (!hasValidated) unvalidatedCount += 1;

    const quoteId = effectiveMap.get(item.material_id);
    if (!quoteId) {
      pendingCount += 1;
      lines.push({
        material_id: item.material_id,
        material_name: item.material_name,
        material_code: item.material_code,
        net_qty: item.net_qty,
        quote_id: '',
        supplier_name: '',
        preco_normalizado: 0,
        line_total: 0,
        status: 'pending',
        isValidated: false,
      });
      continue;
    }

    const offer = item.all_offers.find((o) => o.quote_id === quoteId);
    if (!offer) {
      pendingCount += 1;
      lines.push({
        material_id: item.material_id,
        material_name: item.material_name,
        material_code: item.material_code,
        net_qty: item.net_qty,
        quote_id: quoteId,
        supplier_name: '',
        preco_normalizado: 0,
        line_total: 0,
        status: 'pending',
        isValidated: hasValidated,
      });
      continue;
    }

    const line_total = offer.preco_normalizado * item.net_qty;
    total += line_total;
    const status: IdealLineStatus = hasValidated ? 'validated' : 'suggested';

    lines.push({
      material_id: item.material_id,
      material_name: item.material_name,
      material_code: item.material_code,
      net_qty: item.net_qty,
      quote_id: offer.quote_id,
      supplier_name: offer.supplier_name,
      preco_normalizado: offer.preco_normalizado,
      line_total,
      status,
      isValidated: hasValidated,
    });
  }

  return {
    lines: lines.sort((a, b) => a.material_name.localeCompare(b.material_name, 'pt-BR')),
    total,
    unvalidatedCount,
    pendingCount,
    diffVsA: total - scenarioATotal,
    diffVsB: total - scenarioBTotal,
  };
}
