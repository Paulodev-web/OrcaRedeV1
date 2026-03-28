'use server';

import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabaseServer';

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

    const { error } = await supabase.from('materials').insert({
      code: material.codigo,
      name: material.descricao,
      price: material.precoUnit,
      unit: material.unidade,
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
