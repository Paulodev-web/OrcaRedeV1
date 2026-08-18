import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getSavedPricingBudgetForBudget } from '@/services/pricing/savedPricingBudgets';
import { buildPlannedSnapshot } from './buildPlannedSnapshot';
import { resolveContractValue } from './resolveContractValue';

export class DreOpenError extends Error {}

/**
 * Abre a DRE de um orçamento: resolve a receita (§3), congela o orçado (§5.3)
 * e grava `work_dre`. Os 6 grupos nascem abertos por trigger
 * (`work_dre_seed_group_status`, 20260818121000).
 *
 * Lança `DreOpenError` com mensagem para o usuário quando falta receita ou
 * precificação — nunca abre a DRE com um número inventado.
 */
export async function openDre(supabase: SupabaseClient, userId: string, budgetId: string): Promise<string> {
  const revenue = await resolveContractValue(supabase, budgetId);
  if (!revenue) {
    throw new DreOpenError(
      'Não há valor de contrato para este orçamento. Feche uma proposta ou salve uma precificação principal antes de abrir a DRE.'
    );
  }

  const pricing = await getSavedPricingBudgetForBudget(supabase, userId, budgetId);
  if (!pricing) {
    throw new DreOpenError('Não há precificação salva para este orçamento — não é possível congelar o orçado.');
  }

  const plannedSnapshot = buildPlannedSnapshot(pricing);

  const { data, error } = await supabase
    .from('work_dre')
    .insert({
      budget_id: budgetId,
      user_id: userId,
      contract_value: revenue.contractValue,
      revenue_source: revenue.source,
      proposal_id: revenue.proposalId,
      planned_snapshot: plannedSnapshot,
    })
    .select('id')
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? 'Erro ao abrir a DRE.');
  }

  return data.id as string;
}
