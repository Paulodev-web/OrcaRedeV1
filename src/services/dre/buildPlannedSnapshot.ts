import { DRE_COST_GROUPS } from '@/components/precificacao/types';
import type { SavedPricingBudget } from '@/components/precificacao/types';
import type { DrePlannedSnapshot } from './types';

/**
 * Monta o orçado por grupo a partir de uma precificação resolvida, no formato
 * gravado em `work_dre.planned_snapshot` (MD/PLANO-DRE-OBRA.md §5.3).
 *
 * Congela o número no momento da chamada — quem chama decide quando "agora" é
 * (normalmente: na abertura da DRE). Chamar de novo mais tarde com uma
 * precificação `live` diferente NÃO atualiza a DRE já aberta; recongelar é
 * ação explícita do usuário, nunca efeito colateral de reabrir a tela.
 *
 * `imposto` soma DUAS fontes que não se sobrepõem: o campo global
 * `impostoValor` (% sobre o Valor do Serviço) e qualquer `CostItem` que o
 * usuário tenha classificado manualmente como grupo `imposto` (ex.: ISS
 * lançado como linha percentual). Hoje a primeira fonte está sempre zerada —
 * não existe input de imposto na UI (ver MD/PLANO-DRE-OBRA.md, achado da
 * Fase 2) — mas a soma já fica correta para quando esse input for wireado.
 */
export function buildPlannedSnapshot(pricing: SavedPricingBudget): DrePlannedSnapshot {
  const totals: Record<string, number> = Object.fromEntries(DRE_COST_GROUPS.map((g) => [g, 0]));

  for (const item of pricing.costItems) {
    totals[item.grupo] = (totals[item.grupo] ?? 0) + Math.max(item.valor, 0);
  }

  totals.imposto = (totals.imposto ?? 0) + Math.max(pricing.result.impostoValor, 0);

  return {
    material: Math.max(pricing.result.valorMateriais, 0),
    mao_de_obra: totals.mao_de_obra,
    imposto: totals.imposto,
    frete: totals.frete,
    comissao: totals.comissao,
    adicional: totals.adicional,
    sourcePricingId: pricing.id,
    frozenAt: new Date().toISOString(),
  };
}
