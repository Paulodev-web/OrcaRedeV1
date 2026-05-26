/** Linha de custo do serviço adicionada livremente pelo usuário (mão de obra, diária, alimentação etc.). */
export interface CostItem {
  id: string;
  descricao: string;
  valor: number;
}

/** Custo enriquecido com seu percentual sobre o Valor do Serviço. */
export interface CostItemWithPercent extends CostItem {
  percentualDoVS: number;
}

/** Modo de entrada da precificação: usuário digita valor do serviço diretamente ou percentual de lucro desejado. */
export type PricingInputMode = 'valor' | 'lucro';

/** Como a precificação salva deve se comportar quando o orçamento original mudar. */
export type PricingSaveMode = 'snapshot' | 'live';

/** Resultado do cálculo de precificação de serviço. */
export interface ServicePricingResult {
  valorServico: number;
  totalCustos: number;
  totalCustosPercent: number;
  custosDetalhados: CostItemWithPercent[];
  lucroBruto: number;
  lucroBrutoPercent: number;
  impostoPercent: number;
  impostoValor: number;
  lucroLiquido: number;
  lucroLiquidoPercent: number;
  valorMateriais: number;
  precoTotalCliente: number;
}

/** Material consolidado no momento da precificação/exportação. */
export interface PricingMaterialSnapshot {
  materialId: string;
  codigo: string;
  nome: string;
  unidade: string;
  precoUnit: number;
  quantidade: number;
  subtotal: number;
}

export interface SavePricingBudgetInput {
  budgetId: string;
  budgetName: string;
  clientName?: string | null;
  city?: string | null;
  saveMode: PricingSaveMode;
  pricingInputMode: PricingInputMode;
  valorServicoInput: number;
  lucroPercentInput: number;
  impostoPercent: number;
  costItems: CostItem[];
  materialsSnapshot: PricingMaterialSnapshot[];
  result: ServicePricingResult;
}

export interface SavedPricingBudget {
  id: string;
  userId: string;
  budgetId: string;
  budgetName: string;
  clientName: string | null;
  city: string | null;
  saveMode: PricingSaveMode;
  pricingInputMode: PricingInputMode;
  valorServicoInput: number;
  lucroPercentInput: number;
  impostoPercent: number;
  costItems: CostItem[];
  materialsSnapshot: PricingMaterialSnapshot[];
  result: ServicePricingResult;
  createdAt: string;
  updatedAt: string;
}
