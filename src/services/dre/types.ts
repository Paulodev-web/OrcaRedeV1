import type { Database } from '@/types/supabase';

/** Espelha o ENUM `public.dre_group` — as 6 linhas da DRE (MD/PLANO-DRE-OBRA.md §5.1). */
export type DreGroup = Database['public']['Enums']['dre_group'];

export const DRE_GROUPS: DreGroup[] = ['material', 'mao_de_obra', 'imposto', 'frete', 'comissao', 'adicional'];

export function dreGroupLabel(grupo: DreGroup): string {
  switch (grupo) {
    case 'material':
      return 'Material';
    case 'mao_de_obra':
      return 'Mão de obra';
    case 'imposto':
      return 'Imposto';
    case 'frete':
      return 'Frete';
    case 'comissao':
      return 'Comissão';
    case 'adicional':
    default:
      return 'Adicional';
  }
}

/** Orçado congelado por grupo, gravado em `work_dre.planned_snapshot` na abertura. */
export type DrePlannedSnapshot = Record<DreGroup, number> & {
  sourcePricingId: string | null;
  frozenAt: string;
};

export type DreRevenueSource = 'proposal' | 'pricing';

export interface DreContractValue {
  contractValue: number;
  source: DreRevenueSource;
  proposalId: string | null;
}

export interface DreGroupRow {
  grupo: DreGroup;
  planejado: number;
  realizado: number;
  fechado: boolean;
  variacao: number;
  variacaoPercent: number | null;
}

export interface DreResult {
  contractValue: number;
  revenueSource: DreRevenueSource;
  groups: DreGroupRow[];
  totalPlanejado: number;
  /** Custo considerando: grupo fechado usa realizado, grupo aberto usa o orçado como proxy (§4). */
  custoProjetado: number;
  lucroProjetado: number;
  margemProjetadaPercent: number;
  /** Só existe quando os 6 grupos estão fechados — nunca aproximado. */
  custoReal: number | null;
  lucroReal: number | null;
  margemRealPercent: number | null;
  gruposAbertos: number;
  gruposTotal: number;
}

export interface DreFreightGap {
  /** OCs com freight_value NULL somadas ao grupo frete — nunca contam como R$0 sem aviso (§5.4). */
  ordersWithoutFreight: number;
  ordersTotal: number;
}
