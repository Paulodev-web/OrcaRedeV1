'use server';

import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient, requireAuthUserId } from '@/lib/supabaseServer';

type ActionResult = { success: boolean; error?: string };

interface MaterialInput {
  codigo: string;
  descricao: string;
  precoUnit: number;
  unidade: string;
}

export async function addMaterialAction(material: MaterialInput): Promise<ActionResult> {
  try {
    const supabase = await createSupabaseServerClient();
    const userId = await requireAuthUserId(supabase);

    const { error } = await supabase.from('materials').insert({
      code: material.codigo,
      name: material.descricao,
      price: material.precoUnit,
      unit: material.unidade,
      user_id: userId,
    });

    if (error) {
      if (error.code === '23505') {
        return { success: false, error: `Já existe um material com o código "${material.codigo}".` };
      }
      return { success: false, error: error.message };
    }

    revalidatePath('/');
    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro inesperado ao adicionar material.';
    return { success: false, error: message };
  }
}

export async function updateMaterialAction(id: string, material: MaterialInput): Promise<ActionResult> {
  try {
    const supabase = await createSupabaseServerClient();

    const { error } = await supabase
      .from('materials')
      .update({
        code: material.codigo,
        name: material.descricao,
        price: material.precoUnit,
        unit: material.unidade,
      })
      .eq('id', id);

    if (error) {
      if (error.code === '23505') {
        return { success: false, error: `Já existe um material com o código "${material.codigo}".` };
      }
      return { success: false, error: error.message };
    }

    revalidatePath('/');
    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro inesperado ao atualizar material.';
    return { success: false, error: message };
  }
}

export async function deleteMaterialAction(id: string): Promise<ActionResult> {
  try {
    const supabase = await createSupabaseServerClient();

    const { error } = await supabase.from('materials').delete().eq('id', id);

    if (error) {
      return { success: false, error: error.message };
    }

    revalidatePath('/');
    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro inesperado ao excluir material.';
    return { success: false, error: message };
  }
}

export async function deactivateMaterialForSuppliesAction(
  materialId: string
): Promise<ActionResult> {
  try {
    const supabase = await createSupabaseServerClient();
    const userId = await requireAuthUserId(supabase);

    const { data: updated, error: updateError } = await supabase
      .from('materials')
      .update({ active_in_supplies: false })
      .eq('id', materialId)
      .eq('user_id', userId)
      .select('id')
      .maybeSingle();

    if (updateError) {
      return { success: false, error: updateError.message };
    }

    if (!updated) {
      return { success: false, error: 'Material não encontrado.' };
    }

    await Promise.all([
      supabase
        .from('scenario_ideal_selections')
        .delete()
        .eq('material_id', materialId)
        .eq('user_id', userId),
      supabase
        .from('session_material_stock_inputs')
        .delete()
        .eq('material_id', materialId)
        .eq('user_id', userId),
    ]);

    revalidatePath('/fornecedores');
    return { success: true };
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : 'Erro ao remover material do Suprimentos.';
    return { success: false, error: message };
  }
}
