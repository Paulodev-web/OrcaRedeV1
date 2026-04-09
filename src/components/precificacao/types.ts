export type PricingLineSource = 'budget' | 'manual';

export interface PricingMaterialLine {
  id: string;
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  source: PricingLineSource;
}
