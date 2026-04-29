/** Origem da Receita Bruta no fluxo de precificação. */
export type RevenueSource = 'budget' | 'manual';

/** Linha de custo variável adicionada livremente pelo usuário (mão de obra, diária, alimentação etc.). */
export interface CostItem {
  id: string;
  descricao: string;
  valor: number;
}

/** Custo variável enriquecido com seu percentual sobre a Receita Bruta. */
export interface CostItemBreakdown extends CostItem {
  percentualReceita: number;
}

/** Resultado do cálculo de Margem de Contribuição. */
export interface ContributionMarginResult {
  receitaBruta: number;
  totalCustos: number;
  totalCustosPercent: number;
  margemContribuicao: number;
  margemContribuicaoPercent: number;
  impostoPercent: number;
  impostoValor: number;
  impostoSobreReceitaPercent: number;
  lucroLiquido: number;
  lucroLiquidoPercent: number;
  custos: CostItemBreakdown[];
}
