'use server';

import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient, requireAuthUserId } from '@/lib/supabaseServer';
import {
  syncMaterialPriceAcrossUserBudgets,
  syncMaterialPriceEverywhere,
  type SyncMaterialPriceEverywhereResult,
} from '@/services/budgets/syncMaterialPrice';
import {
  classifyMaterialSubgroupsBatch,
  chunkMaterials,
  DEFAULT_SUBGROUP_CLASSIFY_BATCH_SIZE,
  SUBGROUP_CLASSIFY_CONFIDENCE_THRESHOLD,
  type MaterialToClassify,
} from '@/services/ai/materialSubgroupClassifier';

type ActionResult<T = void> =
  | { success: true; data?: T }
  | { success: false; error: string };

interface MaterialInput {
  codigo: string;
  descricao: string;
  precoUnit: number;
  unidade: string;
  subgrupo?: string | null;
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
      subgroup: material.subgrupo ?? null,
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
    const userId = await requireAuthUserId(supabase);

    const { error } = await supabase
      .from('materials')
      .update({
        code: material.codigo,
        name: material.descricao,
        price: material.precoUnit,
        unit: material.unidade,
        subgroup: material.subgrupo ?? null,
        price_source_supplier_name: null,
        price_source_supplier_id: null,
        price_source_quote_id: null,
        price_source_session_id: null,
        price_source_updated_at: null,
      })
      .eq('id', id)
      .eq('user_id', userId);

    if (error) {
      if (error.code === '23505') {
        return { success: false, error: `Já existe um material com o código "${material.codigo}".` };
      }
      return { success: false, error: error.message };
    }

    await syncMaterialPriceAcrossUserBudgets(supabase, userId, id, material.precoUnit);

    revalidatePath('/');
    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro inesperado ao atualizar material.';
    return { success: false, error: message };
  }
}

export async function syncMaterialPriceAction(
  budgetId: string,
  materialId: string,
  newPrice: number
): Promise<ActionResult<SyncMaterialPriceEverywhereResult>> {
  try {
    if (newPrice < 0) {
      return { success: false, error: 'Preço não pode ser negativo' };
    }

    const supabase = await createSupabaseServerClient();
    const userId = await requireAuthUserId(supabase);

    const { data: budget, error: budgetError } = await supabase
      .from('budgets')
      .select('id')
      .eq('id', budgetId)
      .eq('user_id', userId)
      .maybeSingle();

    if (budgetError) {
      return { success: false, error: budgetError.message };
    }

    if (!budget) {
      return { success: false, error: 'Orçamento não encontrado para este usuário.' };
    }

    const data = await syncMaterialPriceEverywhere(supabase, userId, budgetId, materialId, newPrice);

    revalidatePath('/');
    return { success: true, data };
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : 'Erro ao sincronizar preço do material.';
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

/** Oculta o material apenas na sessão de cotação indicada (outras sessões não são afetadas). */
export async function excludeMaterialFromSessionAction(
  sessionId: string,
  materialId: string
): Promise<ActionResult> {
  try {
    const supabase = await createSupabaseServerClient();
    const userId = await requireAuthUserId(supabase);

    const { data: session, error: sessionError } = await supabase
      .from('quotation_sessions')
      .select('id')
      .eq('id', sessionId)
      .eq('user_id', userId)
      .maybeSingle();

    if (sessionError) {
      return { success: false, error: sessionError.message };
    }
    if (!session) {
      return { success: false, error: 'Sessão não encontrada.' };
    }

    const { data: material, error: materialError } = await supabase
      .from('materials')
      .select('id')
      .eq('id', materialId)
      .eq('user_id', userId)
      .maybeSingle();

    if (materialError) {
      return { success: false, error: materialError.message };
    }
    if (!material) {
      return { success: false, error: 'Material não encontrado.' };
    }

    const { error: insertError } = await supabase.from('session_material_exclusions').upsert(
      {
        session_id: sessionId,
        material_id: materialId,
        user_id: userId,
      },
      { onConflict: 'session_id,material_id,user_id' }
    );

    if (insertError) {
      return { success: false, error: insertError.message };
    }

    await Promise.all([
      supabase
        .from('scenario_ideal_selections')
        .delete()
        .eq('session_id', sessionId)
        .eq('material_id', materialId)
        .eq('user_id', userId),
      supabase
        .from('session_material_stock_inputs')
        .delete()
        .eq('session_id', sessionId)
        .eq('material_id', materialId)
        .eq('user_id', userId),
    ]);

    revalidatePath('/fornecedores');
    revalidatePath(`/fornecedores/sessao/${sessionId}`);
    revalidatePath(`/fornecedores/sessao/${sessionId}/cenarios`);
    revalidatePath(`/fornecedores/sessao/${sessionId}/conciliacao`);
    return { success: true };
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : 'Erro ao remover material desta sessão.';
    return { success: false, error: message };
  }
}

export interface ClassifySubgroupsSummary {
  processed: number;
  classified: number;
  outros: number;
  stillUnclassified: number;
}

/** Classifica por IA (Gemini) os materiais do usuário sem subgrupo definido. Processa até 300 por chamada; rode novamente para continuar. */
export async function classifyUnclassifiedMaterialsAction(): Promise<ActionResult<ClassifySubgroupsSummary>> {
  try {
    const supabase = await createSupabaseServerClient();
    const userId = await requireAuthUserId(supabase);

    const { data: rows, error } = await supabase
      .from('materials')
      .select('id, code, name, description, unit')
      .eq('user_id', userId)
      .is('subgroup', null)
      .limit(300);

    if (error) {
      return { success: false, error: error.message };
    }

    const materials = (rows ?? []) as MaterialToClassify[];
    if (materials.length === 0) {
      return { success: true, data: { processed: 0, classified: 0, outros: 0, stillUnclassified: 0 } };
    }

    const batches = chunkMaterials(materials, DEFAULT_SUBGROUP_CLASSIFY_BATCH_SIZE);
    let classified = 0;
    let outros = 0;

    for (const batch of batches) {
      const result = await classifyMaterialSubgroupsBatch(batch);
      if (!result.success) continue;

      const updates = result.classifications.filter(
        (c) => c.confidence >= SUBGROUP_CLASSIFY_CONFIDENCE_THRESHOLD
      );
      await Promise.all(
        updates.map((c) =>
          supabase.from('materials').update({ subgroup: c.subgroup }).eq('id', c.id).eq('user_id', userId)
        )
      );
      classified += updates.length;
      outros += updates.filter((c) => c.subgroup === 'OUTROS').length;
    }

    revalidatePath('/');
    return {
      success: true,
      data: {
        processed: materials.length,
        classified,
        outros,
        stillUnclassified: materials.length - classified,
      },
    };
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : 'Erro inesperado ao classificar materiais por IA.';
    return { success: false, error: message };
  }
}
