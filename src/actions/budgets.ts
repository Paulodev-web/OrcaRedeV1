'use server';

import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient, requireAuthUserId } from '@/lib/supabaseServer';
import type { SupabaseClient } from '@supabase/supabase-js';

type ActionResult = { success: boolean; error?: string };

interface AddBudgetInput {
  project_name: string;
  client_name?: string;
  city?: string;
  company_id: string;
  is_template?: boolean;
}

interface UpdateBudgetInput {
  project_name?: string;
  client_name?: string;
  city?: string;
  company_id?: string;
  is_template?: boolean;
}

export async function addBudgetAction(data: AddBudgetInput): Promise<ActionResult> {
  try {
    const supabase = await createSupabaseServerClient();
    const userId = await requireAuthUserId(supabase);

    const { error } = await supabase.from('budgets').insert({
      project_name: data.project_name,
      client_name: data.client_name || null,
      city: data.city || null,
      company_id: data.company_id,
      status: 'Em Andamento',
      render_version: 2,
      user_id: userId,
      is_template: data.is_template ?? false,
    });

    if (error) {
      return { success: false, error: error.message };
    }

    revalidatePath('/');
    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro inesperado ao criar orçamento.';
    return { success: false, error: message };
  }
}

export async function updateBudgetAction(id: string, data: UpdateBudgetInput): Promise<ActionResult> {
  try {
    const supabase = await createSupabaseServerClient();

    const updateData: Record<string, unknown> = {};
    if (data.project_name !== undefined) updateData.project_name = data.project_name;
    if (data.client_name !== undefined) updateData.client_name = data.client_name || null;
    if (data.city !== undefined) updateData.city = data.city || null;
    if (data.company_id !== undefined) updateData.company_id = data.company_id;
    if (data.is_template !== undefined) updateData.is_template = data.is_template;

    const { error } = await supabase
      .from('budgets')
      .update(updateData)
      .eq('id', id);

    if (error) {
      return { success: false, error: error.message };
    }

    revalidatePath('/');
    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro inesperado ao atualizar orçamento.';
    return { success: false, error: message };
  }
}

export async function deleteBudgetAction(id: string): Promise<ActionResult> {
  try {
    const supabase = await createSupabaseServerClient();

    const { error } = await supabase.from('budgets').delete().eq('id', id);

    if (error) {
      return { success: false, error: error.message };
    }

    revalidatePath('/');
    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro inesperado ao excluir orçamento.';
    return { success: false, error: message };
  }
}

export async function finalizeBudgetAction(budgetId: string): Promise<ActionResult> {
  try {
    const supabase = await createSupabaseServerClient();

    const { error } = await supabase.rpc('finalize_budget', {
      p_budget_id: budgetId,
    });

    if (error) {
      return { success: false, error: `Falha ao finalizar o orçamento: ${error.message}` };
    }

    revalidatePath('/');
    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro inesperado ao finalizar orçamento.';
    return { success: false, error: message };
  }
}

/**
 * Copia postes, grupos de itens e materiais avulsos de um orçamento de origem
 * para um orçamento já criado. Compartilhada por duplicateBudgetAction (cópia de
 * um orçamento qualquer) e createBudgetFromTemplateAction (criação a partir de modelo).
 */
async function cloneBudgetStructure(
  supabase: SupabaseClient,
  sourceBudgetId: string,
  newBudgetId: string
): Promise<ActionResult> {
  const { data: originalPosts, error: postsError } = await supabase
    .from('budget_posts')
    .select(`
      *,
      post_item_groups (
        id,
        name,
        template_id,
        post_item_group_materials (
          material_id,
          quantity,
          price_at_addition
        )
      ),
      post_materials (
        material_id,
        quantity,
        price_at_addition
      )
    `)
    .eq('budget_id', sourceBudgetId)
    .range(0, 1000);

  if (postsError) {
    return { success: false, error: `Erro ao buscar postes originais: ${postsError.message}` };
  }

  if (!originalPosts || originalPosts.length === 0) {
    return { success: true };
  }

  for (const originalPost of originalPosts) {
    const { data: newPost, error: postError } = await supabase
      .from('budget_posts')
      .insert({
        budget_id: newBudgetId,
        post_type_id: originalPost.post_type_id,
        name: originalPost.name,
        x_coord: originalPost.x_coord,
        y_coord: originalPost.y_coord,
      })
      .select()
      .single();

    if (postError) {
      return { success: false, error: `Erro ao duplicar poste: ${postError.message}` };
    }

    if (originalPost.post_item_groups && originalPost.post_item_groups.length > 0) {
      for (const originalGroup of originalPost.post_item_groups) {
        const { data: newGroup, error: groupError } = await supabase
          .from('post_item_groups')
          .insert({
            budget_post_id: newPost.id,
            template_id: originalGroup.template_id,
            name: originalGroup.name,
          })
          .select()
          .single();

        if (groupError) {
          return { success: false, error: `Erro ao duplicar grupo: ${groupError.message}` };
        }

        if (
          originalGroup.post_item_group_materials &&
          originalGroup.post_item_group_materials.length > 0
        ) {
          const groupMaterials = originalGroup.post_item_group_materials.map(
            (material: { material_id: string; quantity: number; price_at_addition: number }) => ({
              post_item_group_id: newGroup.id,
              material_id: material.material_id,
              quantity: material.quantity,
              price_at_addition: material.price_at_addition,
            })
          );

          const { error: materialsError } = await supabase
            .from('post_item_group_materials')
            .insert(groupMaterials);

          if (materialsError) {
            return { success: false, error: `Erro ao duplicar materiais do grupo: ${materialsError.message}` };
          }
        }
      }
    }

    if (originalPost.post_materials && originalPost.post_materials.length > 0) {
      const looseMaterials = originalPost.post_materials.map(
        (material: { material_id: string; quantity: number; price_at_addition: number }) => ({
          post_id: newPost.id,
          material_id: material.material_id,
          quantity: material.quantity,
          price_at_addition: material.price_at_addition,
        })
      );

      const { error: looseMaterialsError } = await supabase
        .from('post_materials')
        .insert(looseMaterials);

      if (looseMaterialsError) {
        return { success: false, error: `Erro ao duplicar materiais avulsos: ${looseMaterialsError.message}` };
      }
    }
  }

  return { success: true };
}

export async function duplicateBudgetAction(budgetId: string): Promise<ActionResult & { newBudgetId?: string }> {
  try {
    const supabase = await createSupabaseServerClient();
    const userId = await requireAuthUserId(supabase);

    const { data: originalBudget, error: budgetError } = await supabase
      .from('budgets')
      .select('*')
      .eq('id', budgetId)
      .single();

    if (budgetError) {
      return { success: false, error: `Erro ao buscar orçamento original: ${budgetError.message}` };
    }

    const { data: newBudget, error: createError } = await supabase
      .from('budgets')
      .insert({
        project_name: `${originalBudget.project_name} (Cópia)`,
        client_name: originalBudget.client_name,
        city: originalBudget.city,
        company_id: originalBudget.company_id,
        status: 'Em Andamento',
        plan_image_url: originalBudget.plan_image_url,
        render_version: originalBudget.render_version || 1,
        user_id: userId,
        is_template: false,
      })
      .select()
      .single();

    if (createError) {
      return { success: false, error: `Erro ao criar novo orçamento: ${createError.message}` };
    }

    const cloneResult = await cloneBudgetStructure(supabase, budgetId, newBudget.id);
    if (!cloneResult.success) {
      return cloneResult;
    }

    revalidatePath('/');
    return { success: true, newBudgetId: newBudget.id };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro inesperado ao duplicar orçamento.';
    return { success: false, error: message };
  }
}

interface CreateBudgetFromTemplateInput {
  project_name: string;
  client_name?: string;
  city?: string;
  company_id: string;
}

export async function createBudgetFromTemplateAction(
  templateId: string,
  data: CreateBudgetFromTemplateInput
): Promise<ActionResult & { newBudgetId?: string }> {
  try {
    const supabase = await createSupabaseServerClient();
    const userId = await requireAuthUserId(supabase);

    const { data: templateBudget, error: templateError } = await supabase
      .from('budgets')
      .select('*')
      .eq('id', templateId)
      .single();

    if (templateError) {
      return { success: false, error: `Erro ao buscar modelo: ${templateError.message}` };
    }

    const { data: newBudget, error: createError } = await supabase
      .from('budgets')
      .insert({
        project_name: data.project_name,
        client_name: data.client_name || null,
        city: data.city || null,
        company_id: data.company_id,
        status: 'Em Andamento',
        plan_image_url: templateBudget.plan_image_url,
        render_version: templateBudget.render_version || 2,
        user_id: userId,
        is_template: false,
        template_source_id: templateId,
      })
      .select()
      .single();

    if (createError) {
      return { success: false, error: `Erro ao criar orçamento a partir do modelo: ${createError.message}` };
    }

    const cloneResult = await cloneBudgetStructure(supabase, templateId, newBudget.id);
    if (!cloneResult.success) {
      return cloneResult;
    }

    revalidatePath('/');
    return { success: true, newBudgetId: newBudget.id };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro inesperado ao criar orçamento a partir do modelo.';
    return { success: false, error: message };
  }
}
