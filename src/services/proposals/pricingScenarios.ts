import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

import { round2, toNumber } from './derive';

/**
 * Cenários de precificação de um orçamento (Escopo §7.4 / §8.6).
 *
 * Leitura direta da tabela em vez de reusar `listSavedPricingBudgets`
 * (src/services/pricing/savedPricingBudgets.ts) por dois motivos: aqui só
 * interessam os totais já materializados em coluna — nada de recalcular o
 * snapshot "live" item a item —, e `scenario_name` / `is_primary` são colunas
 * novas que aquele serviço ainda não projeta.
 */

export interface PricingScenarioSummary {
  id: string;
  budgetId: string;
  scenarioName: string;
  isPrimary: boolean;
  /** ProposalGlobals.materialTotal — materiais faturados direto pelo fornecedor. */
  materialTotal: number;
  /** ProposalGlobals.laborTotal — o VS da precificação. */
  laborTotal: number;
  /** Sempre `materialTotal + laborTotal`: é o que a validação do PDF cobra. */
  grandTotal: number;
  updatedAt: string;
}

const COLUMNS =
  'id, budget_id, scenario_name, is_primary, valor_materiais, valor_servico, updated_at';

function mapScenario(raw: Record<string, unknown>): PricingScenarioSummary {
  const materialTotal = round2(Math.max(toNumber(raw.valor_materiais), 0));
  const laborTotal = round2(Math.max(toNumber(raw.valor_servico), 0));

  return {
    id: String(raw.id ?? ''),
    budgetId: String(raw.budget_id ?? ''),
    scenarioName: typeof raw.scenario_name === 'string' ? raw.scenario_name : 'Principal',
    isPrimary: raw.is_primary === true,
    materialTotal,
    laborTotal,
    // NÃO usa preco_total_cliente: se aquela coluna divergir um centavo da soma,
    // a proposta reprova em `globals/split-mismatch` na hora de gerar o PDF.
    grandTotal: round2(materialTotal + laborTotal),
    updatedAt: typeof raw.updated_at === 'string' ? raw.updated_at : '',
  };
}

export async function listPricingScenariosForBudget(
  supabase: SupabaseClient,
  userId: string,
  budgetId: string,
): Promise<PricingScenarioSummary[]> {
  const { data, error } = await supabase
    .from('saved_pricing_budgets')
    .select(COLUMNS)
    .eq('user_id', userId)
    .eq('budget_id', budgetId)
    .order('is_primary', { ascending: false })
    .order('updated_at', { ascending: false });

  if (error) throw new Error(error.message);
  return ((data ?? []) as Record<string, unknown>[]).map(mapScenario);
}

export async function getPricingScenarios(
  supabase: SupabaseClient,
  userId: string,
  ids: string[],
): Promise<PricingScenarioSummary[]> {
  if (ids.length === 0) return [];

  const { data, error } = await supabase
    .from('saved_pricing_budgets')
    .select(COLUMNS)
    .eq('user_id', userId)
    .in('id', ids);

  if (error) throw new Error(error.message);

  const rows = ((data ?? []) as Record<string, unknown>[]).map(mapScenario);
  // Preserva a ordem em que o usuário escolheu os cenários.
  return ids
    .map((id) => rows.find((row) => row.id === id))
    .filter((row): row is PricingScenarioSummary => row !== undefined);
}
