'use server';

import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient, requireAuthUserId } from '@/lib/supabaseServer';

type ActionResult = { success: boolean; error?: string };

export async function addFolderAction(
  name: string,
  color?: string,
  parentId?: string | null
): Promise<ActionResult> {
  try {
    const supabase = await createSupabaseServerClient();
    const userId = await requireAuthUserId(supabase);

    const { error } = await supabase.from('budget_folders').insert({
      name: name.trim(),
      color: color || null,
      parent_id: parentId || null,
      user_id: userId,
    });

    if (error) {
      return { success: false, error: error.message };
    }

    revalidatePath('/');
    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro inesperado ao criar pasta.';
    return { success: false, error: message };
  }
}

export async function updateFolderAction(
  id: string,
  name: string,
  color?: string
): Promise<ActionResult> {
  try {
    const supabase = await createSupabaseServerClient();

    const { error } = await supabase
      .from('budget_folders')
      .update({
        name: name.trim(),
        color: color || null,
      })
      .eq('id', id);

    if (error) {
      return { success: false, error: error.message };
    }

    revalidatePath('/');
    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro inesperado ao atualizar pasta.';
    return { success: false, error: message };
  }
}

export async function deleteFolderAction(id: string): Promise<ActionResult> {
  try {
    const supabase = await createSupabaseServerClient();

    // Step 1: fetch the folder's parent so we can reparent its children
    const { data: folderToDelete, error: fetchError } = await supabase
      .from('budget_folders')
      .select('parent_id')
      .eq('id', id)
      .single();

    if (fetchError) {
      return { success: false, error: `Erro ao buscar pasta: ${fetchError.message}` };
    }

    // Step 2: nullify folder_id on all budgets that were inside this folder
    const { error: budgetsError } = await supabase
      .from('budgets')
      .update({ folder_id: null })
      .eq('folder_id', id);

    if (budgetsError) {
      return { success: false, error: `Erro ao mover orçamentos da pasta: ${budgetsError.message}` };
    }

    // Step 3: reparent child folders to the deleted folder's parent (or root)
    const { error: subfoldersError } = await supabase
      .from('budget_folders')
      .update({ parent_id: folderToDelete.parent_id || null })
      .eq('parent_id', id);

    if (subfoldersError) {
      return { success: false, error: `Erro ao mover subpastas: ${subfoldersError.message}` };
    }

    // Step 4: delete the folder itself
    const { error: deleteError } = await supabase
      .from('budget_folders')
      .delete()
      .eq('id', id);

    if (deleteError) {
      return { success: false, error: deleteError.message };
    }

    revalidatePath('/');
    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro inesperado ao excluir pasta.';
    return { success: false, error: message };
  }
}

export async function moveBudgetToFolderAction(
  budgetId: string,
  folderId: string | null
): Promise<ActionResult> {
  try {
    const supabase = await createSupabaseServerClient();

    const { error } = await supabase
      .from('budgets')
      .update({ folder_id: folderId })
      .eq('id', budgetId);

    if (error) {
      return { success: false, error: error.message };
    }

    revalidatePath('/');
    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro inesperado ao mover orçamento.';
    return { success: false, error: message };
  }
}

export async function moveFolderToFolderAction(
  folderId: string,
  newParentId: string | null
): Promise<ActionResult> {
  try {
    const supabase = await createSupabaseServerClient();

    // Anti-cycle check: fetch all folders and walk the ancestor chain server-side
    if (newParentId) {
      const { data: allFolders, error: fetchError } = await supabase
        .from('budget_folders')
        .select('id, parent_id');

      if (fetchError) {
        return { success: false, error: `Erro ao verificar hierarquia de pastas: ${fetchError.message}` };
      }

      // Build a parent map and walk up from newParentId to detect if folderId appears
      const parentMap = new Map((allFolders ?? []).map((f) => [f.id, f.parent_id]));
      let currentId: string | null = newParentId;
      while (currentId) {
        if (currentId === folderId) {
          return {
            success: false,
            error: 'Não é possível mover uma pasta para dentro de si mesma ou de suas subpastas.',
          };
        }
        currentId = parentMap.get(currentId) ?? null;
      }
    }

    const { error } = await supabase
      .from('budget_folders')
      .update({ parent_id: newParentId })
      .eq('id', folderId);

    if (error) {
      return { success: false, error: error.message };
    }

    revalidatePath('/');
    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro inesperado ao mover pasta.';
    return { success: false, error: message };
  }
}
