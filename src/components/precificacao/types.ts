export type PricingLineSource = 'budget' | 'manual';

/** Linha única que representa o custo direto de materiais importado do orçamento (não listar item a item). */
export const BUDGET_CONSOLIDATED_LINE_ID = '__budget_materials_consolidated__';

export interface PricingMaterialLine {
  id: string;
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  source: PricingLineSource;
}
