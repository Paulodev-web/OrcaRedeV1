'use server';

import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient, requireAuthUserId } from '@/lib/supabaseServer';
import {
  buildSavedPricingUpsertRow,
  getSavedPricingBudgetById,
} from '@/services/pricing/savedPricingBudgets';
import type {
  SavedPricingBudget,
  SavePricingBudgetInput,
} from '@/components/precificacao/types';

type ActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string };

function revalidatePricingPaths() {
  revalidatePath('/tools/precificacao');
  revalidatePath('/tools/precificacao/dashboard');
}

export async function savePricingBudgetAction(
  input: SavePricingBudgetInput
): Promise<ActionResult<{ saved: SavedPricingBudget }>> {
  try {
    const supabase = await createSupabaseServerClient();
    const userId = await requireAuthUserId(supabase);

    if (!input.budgetId) {
      return { success: false, error: 'Selecione um orçamento antes de salvar a precificação.' };
    }

    const { data: budget, error: budgetError } = await supabase
      .from('budgets')
      .select('id, project_name, client_name, city, user_id')
      .eq('id', input.budgetId)
      .eq('user_id', userId)
      .maybeSingle();

    if (budgetError) {
      return { success: false, error: budgetError.message };
    }

    if (!budget) {
      return { success: false, error: 'Orçamento não encontrado para este usuário.' };
    }

    const budgetRow = budget as {
      project_name?: string | null;
      client_name?: string | null;
      city?: string | null;
    };

    const row = buildSavedPricingUpsertRow(
      {
        ...input,
        budgetName: budgetRow.project_name || input.budgetName,
        clientName: budgetRow.client_name ?? input.clientName ?? null,
        city: budgetRow.city ?? input.city ?? null,
      },
      userId
    );

    const { data: savedRow, error: saveError } = await supabase
      .from('saved_pricing_budgets')
      .upsert(row, { onConflict: 'user_id,budget_id' })
      .select('id')
      .single();

    if (saveError || !savedRow) {
      return { success: false, error: saveError?.message ?? 'Erro ao salvar precificação.' };
    }

    const saved = await getSavedPricingBudgetById(
      supabase,
      userId,
      (savedRow as { id: string }).id
    );

    if (!saved) {
      return { success: false, error: 'Precificação salva, mas não foi possível recarregar o card.' };
    }

    revalidatePricingPaths();
    return { success: true, data: { saved } };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro inesperado ao salvar precificação.';
    return { success: false, error: message };
  }
}

export async function deletePricingBudgetAction(id: string): Promise<ActionResult> {
  try {
    const supabase = await createSupabaseServerClient();
    const userId = await requireAuthUserId(supabase);

    const { error } = await supabase
      .from('saved_pricing_budgets')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);

    if (error) {
      return { success: false, error: error.message };
    }

    revalidatePricingPaths();
    return { success: true, data: undefined };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro inesperado ao excluir precificação.';
    return { success: false, error: message };
  }
}
