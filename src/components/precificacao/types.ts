/** Tipo de cálculo de uma linha de custo do serviço. */
export type CostItemTipo = 'unitario' | 'maoDeObra' | 'percentual';

/** Base sobre a qual um custo percentual incide. */
export type PercentualBase = 'total' | 'servico';

/** Linha de custo do serviço adicionada livremente pelo usuário (mão de obra, diária, comissão etc.). */
export interface CostItem {
  id: string;
  descricao: string;
  tipo: CostItemTipo;
  /** Quantidade (ex.: 10 diárias) — usado no tipo 'unitario'. */
  unidade: number;
  /** Valor por unidade (R$) no tipo 'unitario'; valor por pessoa/dia (diária) no tipo 'maoDeObra'. */
  valorUnitario: number;
  /** Número de pessoas — usado no tipo 'maoDeObra'. */
  pessoas: number;
  /** Número de dias — usado no tipo 'maoDeObra'. */
  dias: number;
  /** Percentual (%) — usado no tipo 'percentual' (ex.: comissão de vendedor 3%). */
  percentual: number;
  /** Base do percentual: total ao cliente (materiais + serviço) ou só o valor do serviço. */
  percentualBase: PercentualBase;
  /** Total resolvido da linha (para 'percentual', depende do VS/materiais no momento do cálculo). */
  valor: number;
}

export interface CostResolutionContext {
  valorServico: number;
  valorMateriais: number;
}

/** Resolve o valor (R$) de uma linha de custo conforme seu tipo. */
export function resolveCostItemValue(item: CostItem, ctx: CostResolutionContext): number {
  const safe = (value: number) => (Number.isFinite(value) && value > 0 ? value : 0);

  switch (item.tipo) {
    case 'maoDeObra':
      return safe(item.pessoas) * safe(item.dias) * safe(item.valorUnitario);
    case 'percentual': {
      const base =
        item.percentualBase === 'servico'
          ? safe(ctx.valorServico)
          : safe(ctx.valorServico) + safe(ctx.valorMateriais);
      return (safe(item.percentual) / 100) * base;
    }
    case 'unitario':
    default:
      return safe(item.unidade) * safe(item.valorUnitario);
  }
}

const formulaCurrency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const formulaNumber = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 });

/** Rótulo curto do tipo de custo (UI e export). */
export function costItemTipoLabel(tipo: CostItemTipo): string {
  if (tipo === 'maoDeObra') return 'Mão de obra';
  if (tipo === 'percentual') return 'Percentual';
  return 'Qtd. × Valor';
}

/** Descrição da fórmula da linha (ex.: "3 pessoas × 4 dias × R$ 70,00" ou "3% do total"). */
export function describeCostItemFormula(item: CostItem): string {
  if (item.tipo === 'maoDeObra') {
    return `${formulaNumber.format(item.pessoas)} pessoa(s) × ${formulaNumber.format(item.dias)} dia(s) × ${formulaCurrency.format(item.valorUnitario)}`;
  }

  if (item.tipo === 'percentual') {
    const base = item.percentualBase === 'servico' ? 'do serviço' : 'do total (materiais + serviço)';
    return `${formulaNumber.format(item.percentual)}% ${base}`;
  }

  return `${formulaNumber.format(item.unidade)} × ${formulaCurrency.format(item.valorUnitario)}`;
}

/** Custo enriquecido com seu percentual sobre o Valor do Serviço. */
export interface CostItemWithPercent extends CostItem {
  percentualDoVS: number;
}

/**
 * Modo de entrada da precificação:
 * - 'percentual': usuário digita o % sobre os materiais e o VS é derivado (materiais × %).
 * - 'valor': usuário digita o VS diretamente e o % sobre materiais é derivado.
 */
export type PricingInputMode = 'percentual' | 'valor';

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
  percentMateriaisInput: number;
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
  percentMateriaisInput: number;
  impostoPercent: number;
  costItems: CostItem[];
  materialsSnapshot: PricingMaterialSnapshot[];
  result: ServicePricingResult;
  createdAt: string;
  updatedAt: string;
}
