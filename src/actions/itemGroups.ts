'use server';

import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient, requireAuthUserId } from '@/lib/supabaseServer';

type ActionResult = { success: boolean; error?: string };

interface MaterialEntry {
  material_id: string;
  quantity: number;
}

interface AddItemGroupInput {
  name: string;
  description?: string;
  company_ids: string[];
  materials: MaterialEntry[];
}

interface UpdateItemGroupInput {
  name: string;
  description?: string;
  company_id: string;
  materials: MaterialEntry[];
}

export async function addItemGroupAction(data: AddItemGroupInput): Promise<ActionResult> {
  try {
    const supabase = await createSupabaseServerClient();
    const userId = await requireAuthUserId(supabase);

    if (data.company_ids.length === 0) {
      return { success: false, error: 'Nenhuma concessionária especificada.' };
    }

    // Create one independent group per company
    for (const companyId of data.company_ids) {
      const { data: groupTemplate, error: groupError } = await supabase
        .from('item_group_templates')
        .insert({
          name: data.name,
          description: data.description || null,
          company_id: companyId,
          user_id: userId,
        })
        .select('id')
        .single();

      if (groupError) {
        return { success: false, error: `Erro ao criar grupo: ${groupError.message}` };
      }

      if (data.materials.length > 0) {
        const materialsData = data.materials.map((m) => ({
          template_id: groupTemplate.id,
          material_id: m.material_id,
          quantity: m.quantity,
        }));

        const { error: materialsError } = await supabase
          .from('template_materials')
          .insert(materialsData);

        if (materialsError) {
          return { success: false, error: `Erro ao adicionar materiais ao grupo: ${materialsError.message}` };
        }
      }
    }

    revalidatePath('/');
    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro inesperado ao adicionar grupo.';
    return { success: false, error: message };
  }
}

export async function updateItemGroupAction(
  groupId: string,
  data: UpdateItemGroupInput
): Promise<ActionResult> {
  try {
    const supabase = await createSupabaseServerClient();

    // Step 1: update the main template record
    const { error: updateError } = await supabase
      .from('item_group_templates')
      .update({
        name: data.name,
        description: data.description || null,
        company_id: data.company_id,
      })
      .eq('id', groupId);

    if (updateError) {
      return { success: false, error: `Erro ao atualizar template do grupo: ${updateError.message}` };
    }

    // Step 2: replace template_materials (delete all + insert new)
    const { error: deleteError } = await supabase
      .from('template_materials')
      .delete()
      .eq('template_id', groupId);

    if (deleteError) {
      return { success: false, error: `Erro ao remover materiais do template: ${deleteError.message}` };
    }

    if (data.materials.length > 0) {
      const materialsData = data.materials.map((m) => ({
        template_id: groupId,
        material_id: m.material_id,
        quantity: m.quantity,
      }));

      const { error: insertError } = await supabase.from('template_materials').insert(materialsData);

      if (insertError) {
        return { success: false, error: `Erro ao inserir materiais no template: ${insertError.message}` };
      }
    }

    // Step 3: sync all active post_item_groups instances that use this template
    const { data: groupInstances, error: instancesError } = await supabase
      .from('post_item_groups')
      .select('id')
      .eq('template_id', groupId);

    if (instancesError) {
      return { success: false, error: `Erro ao buscar instâncias do grupo: ${instancesError.message}` };
    }

    if (groupInstances && groupInstances.length > 0) {
      const newMaterialsMap = new Map(data.materials.map((m) => [m.material_id, m]));

      for (const instance of groupInstances) {
        // 3a: update instance name
        await supabase
          .from('post_item_groups')
          .update({ name: data.name })
          .eq('id', instance.id);

        // 3b: fetch current materials of this instance
        const { data: currentMaterials, error: currentError } = await supabase
          .from('post_item_group_materials')
          .select('material_id, quantity, price_at_addition')
          .eq('post_item_group_id', instance.id);

        if (currentError) continue;

        const currentMaterialsMap = new Map(
          (currentMaterials ?? []).map((m) => [m.material_id, m])
        );

        // 3c: remove materials no longer in template
        const toRemove = Array.from(currentMaterialsMap.keys()).filter(
          (mid) => !newMaterialsMap.has(mid)
        );

        if (toRemove.length > 0) {
          await supabase
            .from('post_item_group_materials')
            .delete()
            .eq('post_item_group_id', instance.id)
            .in('material_id', toRemove);
        }

        // 3d: add materials new to template
        const toAdd = Array.from(newMaterialsMap.keys()).filter(
          (mid) => !currentMaterialsMap.has(mid)
        );

        if (toAdd.length > 0) {
          const { data: priceData } = await supabase
            .from('materials')
            .select('id, price')
            .in('id', toAdd);

          const priceMap = new Map((priceData ?? []).map((m) => [m.id, m.price || 0]));

          const toInsert = toAdd.map((mid) => ({
            post_item_group_id: instance.id,
            material_id: mid,
            quantity: newMaterialsMap.get(mid)!.quantity,
            price_at_addition: priceMap.get(mid) || 0,
          }));

          await supabase.from('post_item_group_materials').insert(toInsert);
        }

        // 3e: update quantities of existing materials that changed
        for (const [mid, newEntry] of newMaterialsMap) {
          if (!currentMaterialsMap.has(mid)) continue;
          const currentQty = currentMaterialsMap.get(mid)!.quantity;
          if (newEntry.quantity !== currentQty) {
            await supabase
              .from('post_item_group_materials')
              .update({ quantity: newEntry.quantity })
              .eq('post_item_group_id', instance.id)
              .eq('material_id', mid);
          }
        }
      }
    }

    revalidatePath('/');
    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro inesperado ao atualizar grupo.';
    return { success: false, error: message };
  }
}

export async function deleteItemGroupAction(id: string): Promise<ActionResult> {
  try {
    const supabase = await createSupabaseServerClient();

    // ON DELETE CASCADE in the DB removes template_materials automatically
    const { error } = await supabase.from('item_group_templates').delete().eq('id', id);

    if (error) {
      return { success: false, error: error.message };
    }

    revalidatePath('/');
    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro inesperado ao excluir grupo.';
    return { success: false, error: message };
  }
}
