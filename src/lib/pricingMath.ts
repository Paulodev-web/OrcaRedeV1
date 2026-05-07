import type {
  CostItem,
  CostItemWithPercent,
  ServicePricingResult,
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
 * Calcula a precificação do serviço.
 *
 * Modelo:
 * - Valor do Serviço (VS) é o preço cobrado pelo serviço (digitado ou calculado via lucro%).
 * - Custos do Serviço: N linhas livres (mão de obra, diária, etc.), cada uma com % sobre VS.
 * - Lucro Bruto = VS - Σ custos.
 * - Imposto incide SOBRE O VS (não sobre materiais nem sobre lucro).
 * - Lucro Líquido = Lucro Bruto - Imposto.
 * - Materiais passam por fora (informativos) e somam no Total ao Cliente.
 * - Preço Total ao Cliente = Materiais + VS.
 */
export function calculateServicePricing(
  valorServico: number,
  custos: CostItem[],
  impostoPercent: number,
  valorMateriais: number
): ServicePricingResult {
  const vs = Math.max(toSafeNumber(valorServico), 0);
  const safeImpostoPercent = clampPercent(impostoPercent, { min: 0, max: 100 });
  const materiais = Math.max(toSafeNumber(valorMateriais), 0);

  const custosDetalhados: CostItemWithPercent[] = custos.map((custo) => {
    const valor = toSafeNumber(custo.valor);
    const percentualDoVS = vs > 0 ? (valor / vs) * 100 : 0;

    return {
      id: custo.id,
      descricao: custo.descricao,
      valor,
      percentualDoVS,
    };
  });

  const totalCustos = custosDetalhados.reduce((acc, item) => acc + item.valor, 0);
  const totalCustosPercent = vs > 0 ? (totalCustos / vs) * 100 : 0;

  const lucroBruto = vs - totalCustos;
  const lucroBrutoPercent = vs > 0 ? (lucroBruto / vs) * 100 : 0;

  const impostoValor = vs * (safeImpostoPercent / 100);

  const lucroLiquido = lucroBruto - impostoValor;
  const lucroLiquidoPercent = vs > 0 ? (lucroLiquido / vs) * 100 : 0;

  const precoTotalCliente = materiais + vs;

  return {
    valorServico: vs,
    totalCustos,
    totalCustosPercent,
    custosDetalhados,
    lucroBruto,
    lucroBrutoPercent,
    impostoPercent: safeImpostoPercent,
    impostoValor,
    lucroLiquido,
    lucroLiquidoPercent,
    valorMateriais: materiais,
    precoTotalCliente,
  };
}

/**
 * Calcula o Valor do Serviço a partir do total de custos e do percentual de lucro desejado.
 *
 * Fórmula: VS = totalCustos / (1 - lucroPercent/100)
 *
 * Retorna `null` se lucroPercent >= 100 (inválido, pois resultaria em divisão por zero ou negativo).
 * Retorna 0 se totalCustos <= 0.
 */
export function calcularValorServicoPorLucro(
  totalCustos: number,
  lucroPercentDesejado: number
): number | null {
  const custos = toSafeNumber(totalCustos);
  const lucroPercent = toSafeNumber(lucroPercentDesejado);

  if (lucroPercent >= 100) {
    return null;
  }

  if (custos <= 0) {
    return 0;
  }

  const divisor = 1 - lucroPercent / 100;
  if (divisor <= 0) {
    return null;
  }

  return custos / divisor;
}

/**
 * Calcula o percentual de lucro bruto a partir do Valor do Serviço e total de custos.
 *
 * Fórmula: lucroPercent = ((VS - totalCustos) / VS) * 100
 *
 * Retorna 0 se VS <= 0.
 */
export function calcularLucroPorValorServico(
  valorServico: number,
  totalCustos: number
): number {
  const vs = toSafeNumber(valorServico);
  const custos = toSafeNumber(totalCustos);

  if (vs <= 0) {
    return 0;
  }

  return ((vs - custos) / vs) * 100;
}
