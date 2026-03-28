'use server';

import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabaseServer';

type ActionResult = { success: boolean; error?: string };

interface PostTypeInput {
  name: string;
  code?: string;
  description?: string;
  shape?: string;
  height_m?: number;
  price: number;
}

function isDuplicateCodeError(message: string | undefined, table: 'materials' | 'post_types'): boolean {
  if (!message) return false;
  if (table === 'materials') {
    return message.includes('materials_code_user_id_key') || message.includes('materials_code_key');
  }
  return message.includes('post_types_code_user_id_key') || message.includes('post_types_code_key');
}

export async function addPostTypeAction(data: PostTypeInput): Promise<ActionResult> {
  try {
    const supabase = await createSupabaseServerClient();

    // Step 1: create the linked material
    const { data: newMaterial, error: materialError } = await supabase
      .from('materials')
      .insert({
        name: data.name.trim(),
        code: data.code?.trim() || null,
        description: data.description?.trim() || null,
        unit: 'unidade',
        price: data.price,
      })
      .select('id')
      .single();

    if (materialError) {
      if (materialError.code === '23505' && isDuplicateCodeError(materialError.message, 'materials')) {
        return {
          success: false,
          error: `O código "${data.code}" já está sendo usado por outro material/tipo de poste. Por favor, escolha um código diferente.`,
        };
      }
      return { success: false, error: `Erro ao criar material: ${materialError.message}` };
    }

    // Step 2: create the post_type linked to the material
    const { error: postTypeError } = await supabase.from('post_types').insert({
      name: data.name.trim(),
      code: data.code?.trim() || null,
      description: data.description?.trim() || null,
      shape: data.shape?.trim() || null,
      height_m: data.height_m || null,
      price: data.price,
      material_id: newMaterial.id,
    });

    if (postTypeError) {
      // Rollback: delete the material we just created
      await supabase.from('materials').delete().eq('id', newMaterial.id);

      if (postTypeError.code === '23505' && isDuplicateCodeError(postTypeError.message, 'post_types')) {
        return {
          success: false,
          error: `O código "${data.code}" já está sendo usado por outro tipo de poste. Por favor, escolha um código diferente.`,
        };
      }
      return { success: false, error: `Erro ao adicionar tipo de poste: ${postTypeError.message}` };
    }

    revalidatePath('/');
    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro inesperado ao adicionar tipo de poste.';
    return { success: false, error: message };
  }
}

export async function updatePostTypeAction(id: string, data: PostTypeInput): Promise<ActionResult> {
  try {
    const supabase = await createSupabaseServerClient();

    // Step 1: fetch current material_id
    const { data: currentPostType, error: fetchError } = await supabase
      .from('post_types')
      .select('material_id')
      .eq('id', id)
      .single();

    if (fetchError) {
      return { success: false, error: `Erro ao buscar tipo de poste: ${fetchError.message}` };
    }

    // Step 2: update linked material if it exists
    if (currentPostType.material_id) {
      const { error: materialError } = await supabase
        .from('materials')
        .update({
          name: data.name.trim(),
          code: data.code?.trim() || null,
          description: data.description?.trim() || null,
          price: data.price,
        })
        .eq('id', currentPostType.material_id);

      if (materialError) {
        if (materialError.code === '23505' && isDuplicateCodeError(materialError.message, 'materials')) {
          return {
            success: false,
            error: `O código "${data.code}" já está sendo usado por outro material/tipo de poste. Por favor, escolha um código diferente.`,
          };
        }
        return { success: false, error: `Erro ao atualizar material: ${materialError.message}` };
      }
    }

    // Step 3: update the post_type
    const { error: postTypeError } = await supabase
      .from('post_types')
      .update({
        name: data.name.trim(),
        code: data.code?.trim() || null,
        description: data.description?.trim() || null,
        shape: data.shape?.trim() || null,
        height_m: data.height_m || null,
        price: data.price,
      })
      .eq('id', id);

    if (postTypeError) {
      if (postTypeError.code === '23505' && isDuplicateCodeError(postTypeError.message, 'post_types')) {
        return {
          success: false,
          error: `O código "${data.code}" já está sendo usado por outro tipo de poste. Por favor, escolha um código diferente.`,
        };
      }
      return { success: false, error: `Erro ao atualizar tipo de poste: ${postTypeError.message}` };
    }

    revalidatePath('/');
    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro inesperado ao atualizar tipo de poste.';
    return { success: false, error: message };
  }
}

export async function deletePostTypeAction(id: string): Promise<ActionResult> {
  try {
    const supabase = await createSupabaseServerClient();

    // Step 1: fetch material_id before deleting
    const { data: postTypeData, error: fetchError } = await supabase
      .from('post_types')
      .select('material_id')
      .eq('id', id)
      .single();

    if (fetchError) {
      return { success: false, error: `Erro ao buscar tipo de poste: ${fetchError.message}` };
    }

    // Step 2: delete the post_type
    const { error: deleteError } = await supabase.from('post_types').delete().eq('id', id);

    if (deleteError) {
      return { success: false, error: deleteError.message };
    }

    // Step 3: best-effort delete of the linked material (may be referenced in budgets)
    if (postTypeData.material_id) {
      await supabase.from('materials').delete().eq('id', postTypeData.material_id);
      // Intentionally ignoring errors here — material may be in use by budgets
    }

    revalidatePath('/');
    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro inesperado ao excluir tipo de poste.';
    return { success: false, error: message };
  }
}
