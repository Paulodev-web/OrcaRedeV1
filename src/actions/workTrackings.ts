'use server';

import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient, requireAuthUserId } from '@/lib/supabaseServer';
import { toValidUuid } from '@/lib/tracking/trackingUtils';

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

/**
 * Oculta um poste rastreado do mapa (soft-delete: is_visible = false).
 * Remove conexões ligadas ao poste. Garante ownership via budget_id.
 */
export async function hideTrackedPostAction(
  trackingPublicId: string,
  postId: string
): Promise<ActionResult> {
  try {
    const supabase = await createSupabaseServerClient();
    const userId = await requireAuthUserId(supabase);
    const dbPostId = toValidUuid(postId);

    const { data: tracking, error: fetchError } = await supabase
      .from('work_trackings')
      .select('id, budget_id')
      .eq('public_id', trackingPublicId)
      .maybeSingle();

    if (fetchError) return { success: false, error: fetchError.message };
    if (!tracking?.budget_id) return { success: false, error: 'Obra não encontrada.' };

    const { data: budget, error: budgetError } = await supabase
      .from('budgets')
      .select('user_id')
      .eq('id', tracking.budget_id)
      .maybeSingle();

    if (budgetError) return { success: false, error: budgetError.message };
    if (!budget || budget.user_id !== userId) {
      return { success: false, error: 'Você não tem permissão para ocultar este poste.' };
    }

    const { data: postRow, error: postFetchError } = await supabase
      .from('tracked_posts')
      .select('id, is_visible')
      .eq('id', dbPostId)
      .eq('tracking_id', tracking.id)
      .maybeSingle();

    if (postFetchError) return { success: false, error: postFetchError.message };
    if (!postRow) return { success: false, error: 'Poste não encontrado nesta obra.' };
    if (postRow.is_visible === false) return { success: true };

    const { error: connFromErr } = await supabase
      .from('post_connections')
      .delete()
      .eq('from_post_id', dbPostId);
    if (connFromErr) return { success: false, error: `Erro ao remover conexões: ${connFromErr.message}` };

    const { error: connToErr } = await supabase
      .from('post_connections')
      .delete()
      .eq('to_post_id', dbPostId);
    if (connToErr) return { success: false, error: `Erro ao remover conexões: ${connToErr.message}` };

    const { error: postErr } = await supabase
      .from('tracked_posts')
      .update({ is_visible: false, updated_at: new Date().toISOString() })
      .eq('id', dbPostId)
      .eq('tracking_id', tracking.id);
    if (postErr) return { success: false, error: `Erro ao ocultar poste: ${postErr.message}` };

    revalidatePath('/');
    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro inesperado ao ocultar o poste.';
    return { success: false, error: message };
  }
}

/** @deprecated Use hideTrackedPostAction — mantido por compatibilidade */
export async function deleteTrackedPostAction(
  trackingPublicId: string,
  postId: string
): Promise<ActionResult> {
  return hideTrackedPostAction(trackingPublicId, postId);
}
