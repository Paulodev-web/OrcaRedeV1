'use server';

import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient, requireAuthUserId } from '@/lib/supabaseServer';

type ActionResult = { success: boolean; error?: string };

export async function addUtilityCompanyAction(name: string): Promise<ActionResult> {
  try {
    const supabase = await createSupabaseServerClient();
    const userId = await requireAuthUserId(supabase);

    const { error } = await supabase
      .from('utility_companies')
      .insert({ name: name.trim(), user_id: userId });

    if (error) {
      if (error.code === '23505') {
        return { success: false, error: `Já existe uma concessionária com o nome "${name.trim()}".` };
      }
      return { success: false, error: error.message };
    }

    revalidatePath('/');
    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro inesperado ao adicionar concessionária.';
    return { success: false, error: message };
  }
}

export async function updateUtilityCompanyAction(id: string, name: string): Promise<ActionResult> {
  try {
    const supabase = await createSupabaseServerClient();

    const { error } = await supabase
      .from('utility_companies')
      .update({ name: name.trim() })
      .eq('id', id);

    if (error) {
      if (error.code === '23505') {
        return { success: false, error: `Já existe uma concessionária com o nome "${name.trim()}".` };
      }
      return { success: false, error: error.message };
    }

    revalidatePath('/');
    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro inesperado ao atualizar concessionária.';
    return { success: false, error: message };
  }
}

export async function deleteUtilityCompanyAction(id: string): Promise<ActionResult> {
  try {
    const supabase = await createSupabaseServerClient();

    // Verify the company is not referenced by any budget before deleting
    const { data: budgetsUsingCompany, error: checkError } = await supabase
      .from('budgets')
      .select('id, project_name')
      .eq('company_id', id)
      .limit(5);

    if (checkError) {
      return { success: false, error: 'Erro ao verificar se a concessionária está sendo utilizada.' };
    }

    if (budgetsUsingCompany && budgetsUsingCompany.length > 0) {
      const projectNames = budgetsUsingCompany.map((b) => b.project_name).join(', ');
      const suffix = budgetsUsingCompany.length > 1 ? ` e outros...` : '';
      return {
        success: false,
        error:
          budgetsUsingCompany.length === 1
            ? `Esta concessionária não pode ser excluída pois está sendo utilizada no orçamento: ${projectNames}`
            : `Esta concessionária não pode ser excluída pois está sendo utilizada em ${budgetsUsingCompany.length} orçamentos: ${projectNames}${suffix}`,
      };
    }

    const { error } = await supabase
      .from('utility_companies')
      .delete()
      .eq('id', id);

    if (error) {
      return { success: false, error: error.message };
    }

    revalidatePath('/');
    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro inesperado ao excluir concessionária.';
    return { success: false, error: message };
  }
}
