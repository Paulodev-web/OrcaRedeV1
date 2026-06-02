import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

const PAGE_SIZE = 1000;
const IN_BATCH = 200;

export interface SyncMaterialPriceInBudgetResult {
  groupLinesUpdated: number;
  looseLinesUpdated: number;
}

export interface SyncMaterialPriceEverywhereResult extends SyncMaterialPriceInBudgetResult {
  catalogUpdated: boolean;
  budgetsUpdated: number;
}

async function fetchAllIds(
  supabase: SupabaseClient,
  table: 'budget_posts' | 'post_item_groups',
  filterColumn: string,
  filterValue: string | string[],
  selectId = 'id'
): Promise<string[]> {
  const ids: string[] = [];
  let page = 0;

  while (true) {
    const from = page * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    let query = supabase.from(table).select(selectId).range(from, to);

    if (Array.isArray(filterValue)) {
      if (filterValue.length === 0) {
        return ids;
      }
      query = query.in(filterColumn, filterValue);
    } else {
      query = query.eq(filterColumn, filterValue);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(error.message);
    }

    if (!data?.length) {
      break;
    }

    for (const row of data as unknown as { id: string }[]) {
      ids.push(row.id);
    }

    if (data.length < PAGE_SIZE) {
      break;
    }

    page += 1;
  }

  return ids;
}

async function updateInBatches(
  supabase: SupabaseClient,
  table: 'post_item_group_materials' | 'post_materials',
  materialId: string,
  filterColumn: 'post_item_group_id' | 'post_id',
  filterIds: string[],
  newPrice: number
): Promise<number> {
  if (filterIds.length === 0) {
    return 0;
  }

  let updated = 0;

  for (let i = 0; i < filterIds.length; i += IN_BATCH) {
    const batch = filterIds.slice(i, i + IN_BATCH);

    const { data, error } = await supabase
      .from(table)
      .update({ price_at_addition: newPrice })
      .eq('material_id', materialId)
      .in(filterColumn, batch)
      .select('id');

    if (error) {
      throw new Error(error.message);
    }

    updated += data?.length ?? 0;
  }

  return updated;
}

/**
 * Atualiza price_at_addition de um material em todas as linhas do orçamento (grupos + avulsos).
 */
export async function syncMaterialPriceInBudget(
  supabase: SupabaseClient,
  budgetId: string,
  materialId: string,
  newPrice: number
): Promise<SyncMaterialPriceInBudgetResult> {
  if (newPrice < 0) {
    throw new Error('Preço não pode ser negativo');
  }

  const postIds = await fetchAllIds(supabase, 'budget_posts', 'budget_id', budgetId);

  if (postIds.length === 0) {
    return { groupLinesUpdated: 0, looseLinesUpdated: 0 };
  }

  const groupIds: string[] = [];

  for (let i = 0; i < postIds.length; i += IN_BATCH) {
    const batchPostIds = postIds.slice(i, i + IN_BATCH);
    const batchGroupIds = await fetchAllIds(
      supabase,
      'post_item_groups',
      'budget_post_id',
      batchPostIds
    );
    groupIds.push(...batchGroupIds);
  }

  const [groupLinesUpdated, looseLinesUpdated] = await Promise.all([
    updateInBatches(
      supabase,
      'post_item_group_materials',
      materialId,
      'post_item_group_id',
      groupIds,
      newPrice
    ),
    updateInBatches(supabase, 'post_materials', materialId, 'post_id', postIds, newPrice),
  ]);

  return { groupLinesUpdated, looseLinesUpdated };
}

/**
 * Atualiza o preço no catálogo base (materials) e limpa metadados de cotação.
 */
export async function syncMaterialPriceInCatalog(
  supabase: SupabaseClient,
  userId: string,
  materialId: string,
  newPrice: number
): Promise<boolean> {
  if (newPrice < 0) {
    throw new Error('Preço não pode ser negativo');
  }

  const { data: updated, error } = await supabase
    .from('materials')
    .update({
      price: newPrice,
      price_source_supplier_name: null,
      price_source_supplier_id: null,
      price_source_quote_id: null,
      price_source_session_id: null,
      price_source_updated_at: null,
    })
    .eq('id', materialId)
    .eq('user_id', userId)
    .select('id')
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return Boolean(updated);
}

type BudgetIdRow = {
  post_item_groups?: {
    budget_posts?: { budget_id?: string; budgets?: { user_id?: string } };
  };
  budget_posts?: { budget_id?: string; budgets?: { user_id?: string } };
};

/**
 * Retorna IDs de orçamentos do usuário que contêm o material (grupos ou avulsos).
 */
export async function findBudgetIdsContainingMaterial(
  supabase: SupabaseClient,
  userId: string,
  materialId: string
): Promise<string[]> {
  const budgetIds = new Set<string>();

  const { data: groupRows, error: groupError } = await supabase
    .from('post_item_group_materials')
    .select(`
      post_item_groups!inner (
        budget_posts!inner (
          budget_id,
          budgets!inner ( user_id )
        )
      )
    `)
    .eq('material_id', materialId)
    .eq('post_item_groups.budget_posts.budgets.user_id', userId);

  if (groupError) {
    throw new Error(groupError.message);
  }

  for (const row of (groupRows ?? []) as BudgetIdRow[]) {
    const budgetId = row.post_item_groups?.budget_posts?.budget_id;
    if (budgetId) {
      budgetIds.add(budgetId);
    }
  }

  const { data: looseRows, error: looseError } = await supabase
    .from('post_materials')
    .select(`
      budget_posts!inner (
        budget_id,
        budgets!inner ( user_id )
      )
    `)
    .eq('material_id', materialId)
    .eq('budget_posts.budgets.user_id', userId);

  if (looseError) {
    throw new Error(looseError.message);
  }

  for (const row of (looseRows ?? []) as BudgetIdRow[]) {
    const budgetId = row.budget_posts?.budget_id;
    if (budgetId) {
      budgetIds.add(budgetId);
    }
  }

  return [...budgetIds];
}

/**
 * Propaga preço para catálogo e todos os orçamentos do usuário que usam o material.
 */
export async function syncMaterialPriceAcrossUserBudgets(
  supabase: SupabaseClient,
  userId: string,
  materialId: string,
  newPrice: number
): Promise<SyncMaterialPriceEverywhereResult> {
  const catalogUpdated = await syncMaterialPriceInCatalog(supabase, userId, materialId, newPrice);
  const budgetIds = await findBudgetIdsContainingMaterial(supabase, userId, materialId);

  let groupLinesUpdated = 0;
  let looseLinesUpdated = 0;

  for (const budgetId of budgetIds) {
    const result = await syncMaterialPriceInBudget(supabase, budgetId, materialId, newPrice);
    groupLinesUpdated += result.groupLinesUpdated;
    looseLinesUpdated += result.looseLinesUpdated;
  }

  return {
    catalogUpdated,
    budgetsUpdated: budgetIds.length,
    groupLinesUpdated,
    looseLinesUpdated,
  };
}

/**
 * Atualiza catálogo e linhas do orçamento informado (fluxo do Painel Consolidado).
 */
export async function syncMaterialPriceEverywhere(
  supabase: SupabaseClient,
  userId: string,
  budgetId: string,
  materialId: string,
  newPrice: number
): Promise<SyncMaterialPriceEverywhereResult> {
  const catalogUpdated = await syncMaterialPriceInCatalog(supabase, userId, materialId, newPrice);
  const budgetResult = await syncMaterialPriceInBudget(supabase, budgetId, materialId, newPrice);

  return {
    catalogUpdated,
    budgetsUpdated: 1,
    groupLinesUpdated: budgetResult.groupLinesUpdated,
    looseLinesUpdated: budgetResult.looseLinesUpdated,
  };
}
