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
