import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getSessionExcludedMaterialIds } from '@/services/supplies/materialSuppliesFilter';

export interface BudgetMaterialQuantityRow {
  id: string;
  code: string;
  name: string;
  unit: string;
  required_qty: number;
}

type MaterialRef = {
  id: string;
  code: string;
  name: string;
  unit: string;
};

/**
 * Agrega quantidades do orçamento por material_id (grupos + avulsos).
 * Mesma regra do Painel Consolidado — sem filtro active_in_supplies.
 */
export function aggregateBudgetMaterialQuantities(
  groupRows: { material_id: string; quantity: number; materials: MaterialRef | null }[],
  looseRows: { material_id: string; quantity: number; materials: MaterialRef | null }[]
): Map<string, BudgetMaterialQuantityRow> {
  const map = new Map<string, BudgetMaterialQuantityRow>();

  const addQuantity = (materialId: string, qty: number, mat: MaterialRef) => {
    const existing = map.get(materialId);
    if (existing) {
      existing.required_qty += qty;
      return;
    }
    map.set(materialId, {
      id: mat.id,
      code: mat.code || '',
      name: mat.name || 'Material sem nome',
      unit: mat.unit || '',
      required_qty: qty,
    });
  };

  for (const row of [...groupRows, ...looseRows]) {
    const mat = row.materials;
    if (!mat) continue;
    addQuantity(row.material_id, Number(row.quantity) || 0, mat);
  }

  return map;
}

type RawRow = {
  material_id: string;
  quantity: number;
  materials: MaterialRef | MaterialRef[] | null;
};

function normalizeRows(rows: RawRow[]) {
  return rows.map((row) => ({
    material_id: row.material_id,
    quantity: row.quantity,
    materials: Array.isArray(row.materials) ? row.materials[0] ?? null : row.materials,
  }));
}

export interface LoadConsolidatedBudgetMaterialsOptions {
  sessionId?: string | null;
  userId?: string;
}

/**
 * BOM do orçamento no DB — paridade com Painel Consolidado.
 * Exclusões: apenas session_material_exclusions quando sessionId + userId informados.
 */
export async function loadConsolidatedBudgetMaterialsFromDb(
  supabase: SupabaseClient,
  budgetId: string,
  options?: LoadConsolidatedBudgetMaterialsOptions
): Promise<Map<string, BudgetMaterialQuantityRow>> {
  const { data: groupMaterials, error: gmError } = await supabase
    .from('post_item_group_materials')
    .select(`
      material_id,
      quantity,
      materials (id, code, name, unit),
      post_item_groups!inner (
        budget_posts!inner (budget_id)
      )
    `)
    .eq('post_item_groups.budget_posts.budget_id', budgetId);

  const { data: looseMaterials, error: lmError } = await supabase
    .from('post_materials')
    .select(`
      material_id,
      quantity,
      materials (id, code, name, unit),
      budget_posts!inner (budget_id)
    `)
    .eq('budget_posts.budget_id', budgetId);

  if (gmError || lmError) {
    const errMsg = gmError?.message ?? lmError?.message ?? 'Erro ao buscar materiais do orçamento.';
    throw new Error(errMsg);
  }

  const map = aggregateBudgetMaterialQuantities(
    normalizeRows((groupMaterials ?? []) as unknown as RawRow[]),
    normalizeRows((looseMaterials ?? []) as unknown as RawRow[])
  );

  if (options?.sessionId && options?.userId) {
    const sessionExcluded = await getSessionExcludedMaterialIds(
      supabase,
      options.sessionId,
      options.userId
    );
    for (const materialId of sessionExcluded) {
      map.delete(materialId);
    }
  }

  return map;
}

/** Fonte da verdade para Nec. / cenários. */
export async function loadBudgetMaterialQuantities(
  supabase: SupabaseClient,
  budgetId: string,
  options?: LoadConsolidatedBudgetMaterialsOptions
): Promise<Map<string, BudgetMaterialQuantityRow>> {
  return loadConsolidatedBudgetMaterialsFromDb(supabase, budgetId, options);
}

/** IDs de materiais ativos presentes no BOM do orçamento. */
export async function getBudgetMaterialIdSet(
  supabase: SupabaseClient,
  budgetId: string,
  options?: { sessionId?: string | null; userId?: string }
): Promise<Set<string>> {
  const map = await loadBudgetMaterialQuantities(supabase, budgetId, options);
  return new Set(map.keys());
}

export async function isMaterialInBudget(
  supabase: SupabaseClient,
  budgetId: string,
  materialId: string
): Promise<boolean> {
  const ids = await getBudgetMaterialIdSet(supabase, budgetId);
  return ids.has(materialId);
}

const OFF_BUDGET_MATCH_ERROR =
  'Este material não faz parte do orçamento vinculado à sessão. Escolha um material da lista do orçamento.';

export type BudgetMaterialScopeResult =
  | { ok: true }
  | { ok: false; error: string };

/** Valida vínculo quando a cotação/sessão tem orçamento (RDN04). */
export async function assertMaterialInBudgetScope(
  supabase: SupabaseClient,
  budgetId: string | null | undefined,
  materialId: string,
  options?: { sessionId?: string | null; userId?: string }
): Promise<BudgetMaterialScopeResult> {
  if (!budgetId) return { ok: true };
  const allowed = options?.sessionId && options?.userId
    ? (await getBudgetMaterialIdSet(supabase, budgetId, options)).has(materialId)
    : await isMaterialInBudget(supabase, budgetId, materialId);
  if (!allowed) return { ok: false, error: OFF_BUDGET_MATCH_ERROR };
  return { ok: true };
}
