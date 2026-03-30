'use server';

import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient, requireAuthUserId } from '@/lib/supabaseServer';

type ActionResult = { success: boolean; error?: string };

/**
 * Remove obra em acompanhamento e dados relacionados (conexões, postes rastreados).
 * Garante que o orçamento vinculado pertence ao usuário autenticado.
 */
export async function deleteWorkTrackingAction(publicId: string): Promise<ActionResult> {
  try {
    const supabase = await createSupabaseServerClient();
    const userId = await requireAuthUserId(supabase);

    const { data: tracking, error: fetchError } = await supabase
      .from('work_trackings')
      .select('id, budget_id')
      .eq('public_id', publicId)
      .maybeSingle();

    if (fetchError) {
      return { success: false, error: fetchError.message };
    }
    if (!tracking) {
      return { success: false, error: 'Obra não encontrada.' };
    }
    if (!tracking.budget_id) {
      return { success: false, error: 'Obra sem orçamento vinculado; não é possível excluir.' };
    }

    const { data: budget, error: budgetError } = await supabase
      .from('budgets')
      .select('user_id')
      .eq('id', tracking.budget_id)
      .maybeSingle();

    if (budgetError) {
      return { success: false, error: budgetError.message };
    }
    if (!budget || budget.user_id !== userId) {
      return { success: false, error: 'Você não tem permissão para excluir esta obra.' };
    }

    const internalId = tracking.id;

    const { error: connErr } = await supabase.from('post_connections').delete().eq('tracking_id', internalId);
    if (connErr) {
      return { success: false, error: `Erro ao remover conexões: ${connErr.message}` };
    }

    const { error: postsErr } = await supabase.from('tracked_posts').delete().eq('tracking_id', internalId);
    if (postsErr) {
      return { success: false, error: `Erro ao remover postes rastreados: ${postsErr.message}` };
    }

    const { error: delErr } = await supabase.from('work_trackings').delete().eq('id', internalId);
    if (delErr) {
      return { success: false, error: delErr.message };
    }

    revalidatePath('/');
    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro inesperado ao excluir a obra.';
    return { success: false, error: message };
  }
}
