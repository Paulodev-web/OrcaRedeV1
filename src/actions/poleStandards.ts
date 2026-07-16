'use server';

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createSupabaseServerClient, requireAuthUserId } from '@/lib/supabaseServer';

type ActionResult = { success: boolean; error?: string };

interface GroupEntry {
  template_id: string;
  quantity: number;
}

interface MaterialEntry {
  material_id: string;
  quantity: number;
}

interface AddPoleStandardInput {
  name: string;
  description?: string;
  company_ids: string[];
  post_type_id?: string | null;
  groups: GroupEntry[];
  materials: MaterialEntry[];
}

interface UpdatePoleStandardInput {
  name: string;
  description?: string;
  company_ids: string[];
  post_type_id?: string | null;
  groups: GroupEntry[];
  materials: MaterialEntry[];
}

export async function addPoleStandardAction(data: AddPoleStandardInput): Promise<ActionResult> {
  try {
    const supabase = await createSupabaseServerClient();
    const userId = await requireAuthUserId(supabase);

    if (data.company_ids.length === 0) {
      return { success: false, error: 'Nenhuma concessionária especificada.' };
    }

    // Um único padrão, compartilhado por todas as concessionárias selecionadas
    // via pole_standard_companies — nada de criar uma linha por concessionária.
    const { data: standard, error: standardError } = await supabase
      .from('pole_standards')
      .insert({
        name: data.name,
        description: data.description || null,
        post_type_id: data.post_type_id || null,
        user_id: userId,
      })
      .select('id')
      .single();

    if (standardError) {
      return { success: false, error: `Erro ao criar padrão de poste: ${standardError.message}` };
    }

    const companiesData = data.company_ids.map((companyId) => ({
      pole_standard_id: standard.id,
      company_id: companyId,
    }));

    const { error: companiesError } = await supabase.from('pole_standard_companies').insert(companiesData);
    if (companiesError) {
      return { success: false, error: `Erro ao vincular concessionárias ao padrão: ${companiesError.message}` };
    }

    if (data.groups.length > 0) {
      const groupsData = data.groups.map((g) => ({
        pole_standard_id: standard.id,
        template_id: g.template_id,
        quantity: g.quantity,
      }));

      const { error: groupsError } = await supabase.from('pole_standard_groups').insert(groupsData);
      if (groupsError) {
        return { success: false, error: `Erro ao adicionar grupos ao padrão: ${groupsError.message}` };
      }
    }

    if (data.materials.length > 0) {
      const materialsData = data.materials.map((m) => ({
        pole_standard_id: standard.id,
        material_id: m.material_id,
        quantity: m.quantity,
      }));

      const { error: materialsError } = await supabase.from('pole_standard_materials').insert(materialsData);
      if (materialsError) {
        return { success: false, error: `Erro ao adicionar materiais ao padrão: ${materialsError.message}` };
      }
    }

    revalidatePath('/');
    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro inesperado ao criar padrão de poste.';
    return { success: false, error: message };
  }
}

export async function updatePoleStandardAction(
  standardId: string,
  data: UpdatePoleStandardInput
): Promise<ActionResult> {
  try {
    const supabase = await createSupabaseServerClient();

    if (data.company_ids.length === 0) {
      return { success: false, error: 'Nenhuma concessionária especificada.' };
    }

    const { error: updateError } = await supabase
      .from('pole_standards')
      .update({
        name: data.name,
        description: data.description || null,
        post_type_id: data.post_type_id || null,
      })
      .eq('id', standardId);

    if (updateError) {
      return { success: false, error: `Erro ao atualizar padrão de poste: ${updateError.message}` };
    }

    // Sincroniza as concessionárias vinculadas: adiciona as recém-marcadas,
    // remove as desmarcadas. Editar o padrão nunca cria uma cópia nova.
    const { data: existingLinks, error: existingLinksError } = await supabase
      .from('pole_standard_companies')
      .select('company_id')
      .eq('pole_standard_id', standardId);

    if (existingLinksError) {
      return { success: false, error: `Erro ao ler concessionárias vinculadas: ${existingLinksError.message}` };
    }

    const existingCompanyIds = new Set((existingLinks || []).map((l) => l.company_id));
    const nextCompanyIds = new Set(data.company_ids);

    const toAdd = data.company_ids.filter((id) => !existingCompanyIds.has(id));
    const toRemove = [...existingCompanyIds].filter((id) => !nextCompanyIds.has(id));

    if (toAdd.length > 0) {
      const { error: addLinksError } = await supabase
        .from('pole_standard_companies')
        .insert(toAdd.map((companyId) => ({ pole_standard_id: standardId, company_id: companyId })));
      if (addLinksError) {
        return { success: false, error: `Erro ao vincular concessionárias ao padrão: ${addLinksError.message}` };
      }
    }

    if (toRemove.length > 0) {
      const { error: removeLinksError } = await supabase
        .from('pole_standard_companies')
        .delete()
        .eq('pole_standard_id', standardId)
        .in('company_id', toRemove);
      if (removeLinksError) {
        return { success: false, error: `Erro ao desvincular concessionárias do padrão: ${removeLinksError.message}` };
      }
    }

    const { error: deleteGroupsError } = await supabase
      .from('pole_standard_groups')
      .delete()
      .eq('pole_standard_id', standardId);

    if (deleteGroupsError) {
      return { success: false, error: `Erro ao atualizar grupos do padrão: ${deleteGroupsError.message}` };
    }

    if (data.groups.length > 0) {
      const groupsData = data.groups.map((g) => ({
        pole_standard_id: standardId,
        template_id: g.template_id,
        quantity: g.quantity,
      }));

      const { error: insertGroupsError } = await supabase.from('pole_standard_groups').insert(groupsData);
      if (insertGroupsError) {
        return { success: false, error: `Erro ao inserir grupos no padrão: ${insertGroupsError.message}` };
      }
    }

    const { error: deleteMaterialsError } = await supabase
      .from('pole_standard_materials')
      .delete()
      .eq('pole_standard_id', standardId);

    if (deleteMaterialsError) {
      return { success: false, error: `Erro ao atualizar materiais do padrão: ${deleteMaterialsError.message}` };
    }

    if (data.materials.length > 0) {
      const materialsData = data.materials.map((m) => ({
        pole_standard_id: standardId,
        material_id: m.material_id,
        quantity: m.quantity,
      }));

      const { error: insertMaterialsError } = await supabase.from('pole_standard_materials').insert(materialsData);
      if (insertMaterialsError) {
        return { success: false, error: `Erro ao inserir materiais no padrão: ${insertMaterialsError.message}` };
      }
    }

    const cascadeResult = await cascadePoleStandardToAppliedPosts(supabase, standardId, data);
    if (!cascadeResult.success) {
      return cascadeResult;
    }

    revalidatePath('/');
    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro inesperado ao atualizar padrão de poste.';
    return { success: false, error: message };
  }
}

/**
 * Propaga uma edição do padrão (tipo de poste, grupos e materiais avulsos) para
 * todo poste de orçamento onde esse padrão já foi aplicado (budget_posts.pole_standard_id).
 * Só mexe em grupos/materiais que foram originados pelo próprio padrão (mesma
 * pole_standard_id) — itens que o usuário adicionou manualmente depois no poste
 * não têm essa marcação e ficam intactos.
 */
async function cascadePoleStandardToAppliedPosts(
  supabase: SupabaseClient,
  standardId: string,
  data: UpdatePoleStandardInput
): Promise<ActionResult> {
  const { data: linkedPosts, error: linkedPostsError } = await supabase
    .from('budget_posts')
    .select('id')
    .eq('pole_standard_id', standardId);

  if (linkedPostsError) {
    return { success: false, error: `Erro ao buscar postes vinculados ao padrão: ${linkedPostsError.message}` };
  }

  if (!linkedPosts || linkedPosts.length === 0) {
    return { success: true };
  }

  const postIds = linkedPosts.map((p) => p.id);

  // 1) Tipo de poste segue o padrão em todos os postes vinculados. Se o padrão
  // não tem tipo fixo ("escolher ao aplicar"), não mexemos no tipo já escolhido
  // em cada poste — cada um decidiu o seu ao aplicar o padrão.
  if (data.post_type_id) {
    const { error: postTypeSyncError } = await supabase
      .from('budget_posts')
      .update({ post_type_id: data.post_type_id })
      .in('id', postIds);

    if (postTypeSyncError) {
      return { success: false, error: `Erro ao propagar tipo de poste: ${postTypeSyncError.message}` };
    }
  }

  // 2) Grupos de itens: remove as instâncias que vieram deste padrão (o ON DELETE
  // CASCADE do banco já apaga os post_item_group_materials delas) e recria de
  // acordo com a composição atual do padrão.
  const { error: deleteGroupsCascadeError } = await supabase
    .from('post_item_groups')
    .delete()
    .eq('pole_standard_id', standardId);

  if (deleteGroupsCascadeError) {
    return { success: false, error: `Erro ao remover grupos antigos do padrão nos orçamentos: ${deleteGroupsCascadeError.message}` };
  }

  if (data.groups.length > 0) {
    const templateIds = data.groups.map((g) => g.template_id);

    const [{ data: templates, error: templatesError }, { data: templateMaterialsRows, error: templateMaterialsError }] =
      await Promise.all([
        supabase.from('item_group_templates').select('id, name').in('id', templateIds),
        supabase
          .from('template_materials')
          .select('template_id, material_id, quantity, materials (price)')
          .in('template_id', templateIds),
      ]);

    if (templatesError) {
      return { success: false, error: `Erro ao buscar templates de grupo: ${templatesError.message}` };
    }
    if (templateMaterialsError) {
      return { success: false, error: `Erro ao buscar materiais dos templates: ${templateMaterialsError.message}` };
    }

    const templateNameMap = new Map((templates ?? []).map((t) => [t.id, t.name as string]));
    const materialsByTemplate = new Map<string, { material_id: string; quantity: number; price: number }[]>();
    for (const row of templateMaterialsRows ?? []) {
      const list = materialsByTemplate.get(row.template_id) ?? [];
      list.push({
        material_id: row.material_id,
        quantity: row.quantity,
        price: (row.materials as { price?: number } | null)?.price ?? 0,
      });
      materialsByTemplate.set(row.template_id, list);
    }

    const groupRowsToInsert: {
      id: string;
      budget_post_id: string;
      template_id: string;
      name: string;
      pole_standard_id: string;
    }[] = [];
    const groupMaterialRowsToInsert: {
      post_item_group_id: string;
      material_id: string;
      quantity: number;
      price_at_addition: number;
    }[] = [];

    for (const postId of postIds) {
      for (const g of data.groups) {
        for (let i = 0; i < g.quantity; i++) {
          const newGroupId = randomUUID();
          groupRowsToInsert.push({
            id: newGroupId,
            budget_post_id: postId,
            template_id: g.template_id,
            name: templateNameMap.get(g.template_id) || '',
            pole_standard_id: standardId,
          });

          for (const m of materialsByTemplate.get(g.template_id) ?? []) {
            groupMaterialRowsToInsert.push({
              post_item_group_id: newGroupId,
              material_id: m.material_id,
              quantity: m.quantity,
              price_at_addition: m.price,
            });
          }
        }
      }
    }

    if (groupRowsToInsert.length > 0) {
      const { error: groupsInsertError } = await supabase.from('post_item_groups').insert(groupRowsToInsert);
      if (groupsInsertError) {
        return { success: false, error: `Erro ao recriar grupos do padrão nos orçamentos: ${groupsInsertError.message}` };
      }
    }

    if (groupMaterialRowsToInsert.length > 0) {
      const { error: groupMaterialsInsertError } = await supabase
        .from('post_item_group_materials')
        .insert(groupMaterialRowsToInsert);
      if (groupMaterialsInsertError) {
        return { success: false, error: `Erro ao recriar materiais dos grupos nos orçamentos: ${groupMaterialsInsertError.message}` };
      }
    }
  }

  // 3) Materiais avulsos: remove os que vieram deste padrão e recria conforme a
  // composição atual (inclui o material do próprio tipo de poste, já que ele
  // entra na lista de materiais avulsos do padrão). Materiais adicionados
  // manualmente ao poste depois (sem pole_standard_id) permanecem intactos.
  const { error: deleteMaterialsCascadeError } = await supabase
    .from('post_materials')
    .delete()
    .eq('pole_standard_id', standardId);

  if (deleteMaterialsCascadeError) {
    return {
      success: false,
      error: `Erro ao remover materiais avulsos antigos do padrão nos orçamentos: ${deleteMaterialsCascadeError.message}`,
    };
  }

  if (data.materials.length > 0) {
    const materialIds = data.materials.map((m) => m.material_id);
    const { data: materialPrices, error: materialPricesError } = await supabase
      .from('materials')
      .select('id, price')
      .in('id', materialIds);

    if (materialPricesError) {
      return { success: false, error: `Erro ao buscar preços dos materiais: ${materialPricesError.message}` };
    }

    const priceMap = new Map((materialPrices ?? []).map((m) => [m.id, m.price || 0]));

    const materialRowsToInsert = postIds.flatMap((postId) =>
      data.materials.map((m) => ({
        post_id: postId,
        material_id: m.material_id,
        quantity: m.quantity,
        price_at_addition: priceMap.get(m.material_id) || 0,
        pole_standard_id: standardId,
      }))
    );

    const { error: materialsCascadeInsertError } = await supabase.from('post_materials').insert(materialRowsToInsert);
    if (materialsCascadeInsertError) {
      return {
        success: false,
        error: `Erro ao recriar materiais avulsos do padrão nos orçamentos: ${materialsCascadeInsertError.message}`,
      };
    }
  }

  return { success: true };
}

export async function deletePoleStandardAction(id: string): Promise<ActionResult> {
  try {
    const supabase = await createSupabaseServerClient();

    // ON DELETE CASCADE remove pole_standard_companies/groups/materials automaticamente
    const { error } = await supabase.from('pole_standards').delete().eq('id', id);

    if (error) {
      return { success: false, error: error.message };
    }

    revalidatePath('/');
    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro inesperado ao excluir padrão de poste.';
    return { success: false, error: message };
  }
}
