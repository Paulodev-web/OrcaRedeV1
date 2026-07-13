'use server';

import { revalidatePath } from 'next/cache';
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

    revalidatePath('/');
    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro inesperado ao atualizar padrão de poste.';
    return { success: false, error: message };
  }
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
