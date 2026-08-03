import type { Metadata } from 'next';

import { createSupabaseServerClient, requireAuthUserId } from '@/lib/supabaseServer';
import { listProposals, type ProposalListItem } from '@/services/proposals/repository';
import { getSavedPricingBudgetForBudget } from '@/services/pricing/savedPricingBudgets';
import { PropostaStep } from '@/components/orcamentos/PropostaStep';

export const metadata: Metadata = {
  title: 'Proposta — OrcaRede',
  description: 'Propostas comerciais geradas a partir deste orçamento.',
};

interface PropostaPageProps {
  params: Promise<{ budgetId: string }>;
}

/** Etapa 4 da esteira: as propostas deste orçamento. */
export default async function PropostaPage({ params }: PropostaPageProps) {
  const { budgetId } = await params;

  let proposals: ProposalListItem[] = [];
  let hasPricing = false;

  // Como na etapa 3: o layout já validou o acesso ao orçamento, então falha de
  // leitura aqui degrada para lista vazia em vez de derrubar a etapa.
  try {
    const supabase = await createSupabaseServerClient();
    const userId = await requireAuthUserId(supabase);
    const [all, pricing] = await Promise.all([
      listProposals(supabase, userId),
      getSavedPricingBudgetForBudget(supabase, userId, budgetId),
    ]);
    proposals = all.filter((proposal) => proposal.budgetId === budgetId);
    hasPricing = pricing !== null;
  } catch {
    proposals = [];
  }

  return <PropostaStep budgetId={budgetId} proposals={proposals} hasPricing={hasPricing} />;
}
