import type { Metadata } from 'next';

import { createSupabaseServerClient, requireAuthUserId } from '@/lib/supabaseServer';
import { getSavedPricingBudgetForBudget } from '@/services/pricing/savedPricingBudgets';
import { PrecificacaoStep } from '@/components/orcamentos/PrecificacaoStep';
import type { SavedPricingBudget } from '@/components/precificacao/types';

export const metadata: Metadata = {
  title: 'Precificação — OrcaRede',
  description: 'Valor do serviço, custos e preço final do orçamento.',
};

interface PrecificacaoPageProps {
  params: Promise<{ budgetId: string }>;
}

/** Etapa 3 da esteira: a precificação do orçamento. */
export default async function PrecificacaoPage({ params }: PrecificacaoPageProps) {
  const { budgetId } = await params;

  // Falha aqui não pode derrubar a etapa: o layout já garantiu que o orçamento
  // existe e é do usuário, então seguir sem precificação salva é degradar para
  // "ainda não precificado", não erro.
  let saved: SavedPricingBudget | null = null;
  try {
    const supabase = await createSupabaseServerClient();
    const userId = await requireAuthUserId(supabase);
    saved = await getSavedPricingBudgetForBudget(supabase, userId, budgetId);
  } catch {
    saved = null;
  }

  return <PrecificacaoStep budgetId={budgetId} initialSaved={saved} />;
}
