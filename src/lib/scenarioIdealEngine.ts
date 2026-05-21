import type { ScenarioItem } from '@/actions/supplierQuotes';

export interface IdealScenarioLine {
  material_id: string;
  material_name: string;
  material_code: string;
  net_qty: number;
  quote_id: string;
  supplier_name: string;
  preco_normalizado: number;
  line_total: number;
  status: 'selected' | 'pending' | 'no_demand';
}

export interface IdealScenarioResult {
  lines: IdealScenarioLine[];
  total: number;
  pendingCount: number;
  diffVsA: number;
  diffVsB: number;
}

export function computeIdealScenario(
  items: ScenarioItem[],
  selections: Map<string, string>,
  scenarioATotal: number,
  scenarioBTotal: number
): IdealScenarioResult {
  const lines: IdealScenarioLine[] = [];
  let total = 0;
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
      });
      continue;
    }

    const quoteId = selections.get(item.material_id);
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
      });
      continue;
    }

    const line_total = offer.preco_normalizado * item.net_qty;
    total += line_total;
    lines.push({
      material_id: item.material_id,
      material_name: item.material_name,
      material_code: item.material_code,
      net_qty: item.net_qty,
      quote_id: offer.quote_id,
      supplier_name: offer.supplier_name,
      preco_normalizado: offer.preco_normalizado,
      line_total,
      status: 'selected',
    });
  }

  return {
    lines: lines.sort((a, b) => a.material_name.localeCompare(b.material_name, 'pt-BR')),
    total,
    pendingCount,
    diffVsA: total - scenarioATotal,
    diffVsB: total - scenarioBTotal,
  };
}
