import {
  resolveCostItemValue,
  type CostItem,
  type CostItemWithPercent,
  type ServicePricingResult,
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
 * - Materiais vêm do orçamento importado e passam por fora (repassados ao cliente sem margem).
 * - Valor do Serviço (VS) = percentual aplicado sobre os materiais (ex.: 100k × 40% = 40k),
 *   ou digitado diretamente. É a verba disponível para executar a obra.
 * - Custos do Serviço: N linhas livres, cada uma resolvida pelo seu tipo:
 *   unitário (qtd × valor), mão de obra (pessoas × dias × diária) ou
 *   percentual (% do total ao cliente ou do VS — ex.: comissão de vendedor).
 * - Lucro Bruto = VS - Σ custos.
 * - Imposto incide SOBRE O VS (não sobre materiais nem sobre lucro).
 * - Lucro Líquido = Lucro Bruto - Imposto.
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
    const valor = resolveCostItemValue(custo, { valorServico: vs, valorMateriais: materiais });
    const percentualDoVS = vs > 0 ? (valor / vs) * 100 : 0;

    return {
      ...custo,
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
 * Calcula o Valor do Serviço a partir do total de materiais e do percentual definido.
 *
 * Fórmula: VS = materiais × (percent / 100)
 * Ex.: materiais = 100k, percent = 40 → VS = 40k (total ao cliente = 140k).
 */
export function calcularValorServicoPorPercentual(
  valorMateriais: number,
  percentMateriais: number
): number {
  const materiais = Math.max(toSafeNumber(valorMateriais), 0);
  const percent = Math.max(toSafeNumber(percentMateriais), 0);

  return materiais * (percent / 100);
}

/**
 * Calcula o percentual sobre materiais a partir do Valor do Serviço digitado.
 *
 * Fórmula: percent = (VS / materiais) × 100
 * Retorna 0 se materiais <= 0.
 */
export function calcularPercentualPorValorServico(
  valorServico: number,
  valorMateriais: number
): number {
  const vs = Math.max(toSafeNumber(valorServico), 0);
  const materiais = Math.max(toSafeNumber(valorMateriais), 0);

  if (materiais <= 0) {
    return 0;
  }

  return (vs / materiais) * 100;
}
