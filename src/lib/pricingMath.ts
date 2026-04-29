import type {
  ContributionMarginResult,
  CostItem,
  CostItemBreakdown,
} from '@/components/precificacao/types';

function toSafeNumber(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return value;
}

function clampPercent(value: number, { min, max }: { min: number; max: number }): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  if (value < min) {
    return min;
  }

  if (value > max) {
    return max;
  }

  return value;
}

/**
 * Calcula Margem de Contribuição, imposto sobre MC e Lucro Líquido
 * a partir da Receita Bruta, lista de custos variáveis e percentual de imposto.
 *
 * Regras:
 * - Receita Bruta (RB) é o valor consolidado de materiais (orçamento) ou inserido manualmente.
 * - Custos variáveis são livres (descrição + valor) e cada um expõe o seu % sobre a RB.
 * - Margem de Contribuição (MC) = RB - Σ custos variáveis.
 * - Imposto incide SOBRE A MC (não sobre RB).
 * - Lucro Líquido = MC - imposto.
 */
export function calculateContributionMargin(
  receitaBruta: number,
  custos: CostItem[],
  impostoPercent: number
): ContributionMarginResult {
  const rb = Math.max(toSafeNumber(receitaBruta), 0);
  const safeImpostoPercent = clampPercent(impostoPercent, { min: 0, max: 100 });

  const breakdown: CostItemBreakdown[] = custos.map((custo) => {
    const valor = toSafeNumber(custo.valor);
    const percentualReceita = rb > 0 ? (valor / rb) * 100 : 0;

    return {
      id: custo.id,
      descricao: custo.descricao,
      valor,
      percentualReceita,
    };
  });

  const totalCustos = breakdown.reduce((acc, item) => acc + item.valor, 0);
  const totalCustosPercent = rb > 0 ? (totalCustos / rb) * 100 : 0;

  const margemContribuicao = rb - totalCustos;
  const margemContribuicaoPercent = rb > 0 ? (margemContribuicao / rb) * 100 : 0;

  const impostoValor = margemContribuicao * (safeImpostoPercent / 100);
  const impostoSobreReceitaPercent = rb > 0 ? (impostoValor / rb) * 100 : 0;

  const lucroLiquido = margemContribuicao - impostoValor;
  const lucroLiquidoPercent = rb > 0 ? (lucroLiquido / rb) * 100 : 0;

  return {
    receitaBruta: rb,
    totalCustos,
    totalCustosPercent,
    margemContribuicao,
    margemContribuicaoPercent,
    impostoPercent: safeImpostoPercent,
    impostoValor,
    impostoSobreReceitaPercent,
    lucroLiquido,
    lucroLiquidoPercent,
    custos: breakdown,
  };
}
