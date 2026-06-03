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

function placeholderMaterialRef(materialId: string): MaterialRef {
  return {
    id: materialId,
    code: '',
    name: 'Material sem nome',
    unit: '',
  };
}

/**
 * Agrega quantidades do orçamento por material_id (grupos + avulsos).
 * Mesma regra do Painel Consolidado — sem filtro active_in_supplies.
 * Linhas sem join em `materials` ainda entram (placeholder), paridade com o painel.
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
    const mat = row.materials ?? placeholderMaterialRef(row.material_id);
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
  /** @deprecated Exclusões de sessão não removem mais linhas da lista consolidada. */
  sessionId?: string | null;
  userId?: string;
}

/**
 * Lista completa do orçamento consolidado (paridade com Painel Consolidado).
 * Não remove `session_material_exclusions` — use getSessionExcludedMaterialIds para UI/compra.
 */
export async function loadFullConsolidatedBudgetMaterials(
  supabase: SupabaseClient,
  budgetId: string
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

  return aggregateBudgetMaterialQuantities(
    normalizeRows((groupMaterials ?? []) as unknown as RawRow[]),
    normalizeRows((looseMaterials ?? []) as unknown as RawRow[])
  );
}

/** @alias loadFullConsolidatedBudgetMaterials */
export async function loadConsolidatedBudgetMaterialsFromDb(
  supabase: SupabaseClient,
  budgetId: string,
  _options?: LoadConsolidatedBudgetMaterialsOptions
): Promise<Map<string, BudgetMaterialQuantityRow>> {
  return loadFullConsolidatedBudgetMaterials(supabase, budgetId);
}

/** Fonte da verdade para Nec. / cenários — lista completa do orçamento. */
export async function loadBudgetMaterialQuantities(
  supabase: SupabaseClient,
  budgetId: string,
  _options?: LoadConsolidatedBudgetMaterialsOptions
): Promise<Map<string, BudgetMaterialQuantityRow>> {
  return loadFullConsolidatedBudgetMaterials(supabase, budgetId);
}

/** IDs de materiais presentes no BOM consolidado do orçamento (lista completa). */
export async function getBudgetMaterialIdSet(
  supabase: SupabaseClient,
  budgetId: string,
  _options?: { sessionId?: string | null; userId?: string }
): Promise<Set<string>> {
  const map = await loadFullConsolidatedBudgetMaterials(supabase, budgetId);
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
  _options?: { sessionId?: string | null; userId?: string }
): Promise<BudgetMaterialScopeResult> {
  if (!budgetId) return { ok: true };
  const allowed = await isMaterialInBudget(supabase, budgetId, materialId);
  if (!allowed) return { ok: false, error: OFF_BUDGET_MATCH_ERROR };
  return { ok: true };
}

export { getSessionExcludedMaterialIds };
