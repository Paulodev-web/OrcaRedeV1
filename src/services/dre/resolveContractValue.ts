import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { DreContractValue } from './types';

/**
 * Resolve o valor de contrato da DRE (MD/PLANO-DRE-OBRA.md §3), nesta ordem:
 *
 *   1. `proposals.accepted_pricing_option_id` → `grand_total` da opção. Fonte
 *      canônica: é o que o cliente assinou, congelado, imune a reprecificação
 *      posterior. Se houver mais de uma proposta aceita para o orçamento
 *      (não deveria, mas nada no banco impede), usa a aceita mais recente.
 *   2. Sem proposta aceita: `saved_pricing_budgets` com `is_primary` →
 *      `preco_total_cliente`.
 *   3. Sem nenhum dos dois: retorna null. A DRE não abre — receita chutada é
 *      pior que DRE nenhuma.
 */
export async function resolveContractValue(
  supabase: SupabaseClient,
  budgetId: string
): Promise<DreContractValue | null> {
  // O embed precisa nomear a constraint: desde 20260818120000, proposals e
  // proposal_pricing_options têm DUAS FKs entre si —
  // proposal_pricing_options.proposal_id (a original) e
  // proposals.accepted_pricing_option_id (a nova). Sem o nome explícito, o
  // PostgREST não sabe qual seguir e falha com "more than one relationship
  // was found" em toda chamada, não só quando há proposta aceita.
  const { data: proposal, error: proposalError } = await supabase
    .from('proposals')
    .select(
      'id, accepted_pricing_option_id, accepted_at, ' +
        'proposal_pricing_options!proposals_accepted_pricing_option_id_fkey(grand_total)'
    )
    .eq('budget_id', budgetId)
    .not('accepted_pricing_option_id', 'is', null)
    .order('accepted_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (proposalError) {
    throw new Error(proposalError.message);
  }

  if (proposal) {
    const row = proposal as unknown as {
      id: string;
      proposal_pricing_options: { grand_total: number } | { grand_total: number }[];
    };
    const option = Array.isArray(row.proposal_pricing_options)
      ? row.proposal_pricing_options[0]
      : row.proposal_pricing_options;

    if (option && option.grand_total > 0) {
      return { contractValue: option.grand_total, source: 'proposal', proposalId: row.id };
    }
  }

  const { data: pricing, error: pricingError } = await supabase
    .from('saved_pricing_budgets')
    .select('preco_total_cliente')
    .eq('budget_id', budgetId)
    .eq('is_primary', true)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (pricingError) {
    throw new Error(pricingError.message);
  }

  if (pricing && pricing.preco_total_cliente > 0) {
    return { contractValue: pricing.preco_total_cliente, source: 'pricing', proposalId: null };
  }

  return null;
}
