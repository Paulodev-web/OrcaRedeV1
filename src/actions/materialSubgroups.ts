'use server';

import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient, requireAuthUserId } from '@/lib/supabaseServer';

type ActionResult = { success: boolean; error?: string };

export async function addMaterialSubgroupAction(name: string): Promise<ActionResult> {
  try {
    const supabase = await createSupabaseServerClient();
    const userId = await requireAuthUserId(supabase);

    const { error } = await supabase
      .from('material_subgroups')
      .insert({ name: name.trim(), user_id: userId });

    if (error) {
      if (error.code === '23505') {
        return { success: false, error: `Já existe um subgrupo com o nome "${name.trim()}".` };
      }
      return { success: false, error: error.message };
    }

    revalidatePath('/');
    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro inesperado ao adicionar subgrupo.';
    return { success: false, error: message };
  }
}

export async function updateMaterialSubgroupAction(id: string, name: string): Promise<ActionResult> {
  try {
    const supabase = await createSupabaseServerClient();
    const userId = await requireAuthUserId(supabase);

    const { error } = await supabase
      .from('material_subgroups')
      .update({ name: name.trim() })
      .eq('id', id)
      .eq('user_id', userId);

    if (error) {
      if (error.code === '23505') {
        return { success: false, error: `Já existe um subgrupo com o nome "${name.trim()}".` };
      }
      return { success: false, error: error.message };
    }

    revalidatePath('/');
    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro inesperado ao atualizar subgrupo.';
    return { success: false, error: message };
  }
}

export async function deleteMaterialSubgroupAction(id: string): Promise<ActionResult> {
  try {
    const supabase = await createSupabaseServerClient();
    const userId = await requireAuthUserId(supabase);

    const { error } = await supabase
      .from('material_subgroups')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);

    if (error) {
      return { success: false, error: error.message };
    }

    revalidatePath('/');
    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro inesperado ao excluir subgrupo.';
    return { success: false, error: message };
  }
}
