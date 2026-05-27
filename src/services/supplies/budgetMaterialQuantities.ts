import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { isMaterialActiveInSupplies } from '@/services/supplies/materialSuppliesFilter';

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
  active_in_supplies?: boolean | null;
};

/**
 * Agrega quantidades do orçamento por material_id (grupos + avulsos).
 * Fonte da verdade para Nec. nos cenários de suprimentos (RDN04).
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
    if (!mat || !isMaterialActiveInSupplies(mat)) continue;
    addQuantity(row.material_id, Number(row.quantity) || 0, mat);
  }

  return map;
}

export async function loadBudgetMaterialQuantities(
  supabase: SupabaseClient,
  budgetId: string
): Promise<Map<string, BudgetMaterialQuantityRow>> {
  const { data: groupMaterials, error: gmError } = await supabase
    .from('post_item_group_materials')
    .select(`
      material_id,
      quantity,
      materials (id, code, name, unit, active_in_supplies),
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
      materials (id, code, name, unit, active_in_supplies),
      budget_posts!inner (budget_id)
    `)
    .eq('budget_posts.budget_id', budgetId);

  if (gmError || lmError) {
    const errMsg = gmError?.message ?? lmError?.message ?? 'Erro ao buscar quantidades do orçamento.';
    throw new Error(errMsg);
  }

  type RawRow = {
    material_id: string;
    quantity: number;
    materials: MaterialRef | MaterialRef[] | null;
  };

  const normalizeRows = (rows: RawRow[]) =>
    rows.map((row) => ({
      material_id: row.material_id,
      quantity: row.quantity,
      materials: Array.isArray(row.materials) ? row.materials[0] ?? null : row.materials,
    }));

  return aggregateBudgetMaterialQuantities(
    normalizeRows((groupMaterials ?? []) as unknown as RawRow[]),
    normalizeRows((looseMaterials ?? []) as unknown as RawRow[])
  );
}
