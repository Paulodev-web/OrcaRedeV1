import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  consolidateMaterialsFromBudgetDetails,
  type ConsolidatedMaterialRow,
} from '@/services/budgetMaterialAggregation';
import type { BudgetDetails, BudgetPostDetail } from '@/types';
import { getSessionExcludedMaterialIds } from '@/services/supplies/materialSuppliesFilter';

export interface BudgetMaterialQuantityRow {
  id: string;
  code: string;
  name: string;
  unit: string;
  required_qty: number;
  /** Preço unitário do orçamento (price_at_addition ou preço atual do material). */
  unit_price: number;
}

const BUDGET_POSTS_PAGE_SIZE = 2000;

/** Mesmo select aninhado do Painel Consolidado / fetchBudgetDetails. */
const BUDGET_POSTS_WITH_MATERIALS_SELECT = `
  id, name, custom_name, counter, x_coord, y_coord,
  post_types ( id, name, code, price ),
  post_item_groups (
    id, name, template_id,
    post_item_group_materials (
      material_id, quantity, price_at_addition,
      materials ( id, code, name, unit, price )
    )
  ),
  post_materials (
    id, post_id, material_id, quantity, price_at_addition,
    materials ( id, code, name, unit, price )
  )
`;

function consolidatedRowsToMap(rows: ConsolidatedMaterialRow[]): Map<string, BudgetMaterialQuantityRow> {
  const map = new Map<string, BudgetMaterialQuantityRow>();
  for (const row of rows) {
    map.set(row.materialId, {
      id: row.materialId,
      code: row.codigo,
      name: row.nome,
      unit: row.unidade,
      required_qty: row.quantidade,
      unit_price: row.precoUnit,
    });
  }
  return map;
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
 * Usado em testes e fallbacks; produção prefere consolidateMaterialsFromBudgetDetails.
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
      unit_price: 0,
    });
  };

  for (const row of [...groupRows, ...looseRows]) {
    const mat = row.materials ?? placeholderMaterialRef(row.material_id);
    addQuantity(row.material_id, Number(row.quantity) || 0, mat);
  }

  return map;
}

export interface LoadConsolidatedBudgetMaterialsOptions {
  /** @deprecated Exclusões de sessão não removem mais linhas da lista consolidada. */
  sessionId?: string | null;
  userId?: string;
}

/**
 * Lista completa do orçamento consolidado — mesma regra do Painel Consolidado.
 * Carrega postes com materiais aninhados (evita corte de 1000 linhas em query plana).
 */
export async function loadFullConsolidatedBudgetMaterials(
  supabase: SupabaseClient,
  budgetId: string
): Promise<Map<string, BudgetMaterialQuantityRow>> {
  const { data: budgetRow, error: budgetError } = await supabase
    .from('budgets')
    .select('id, project_name, status, render_version')
    .eq('id', budgetId)
    .single();

  if (budgetError) {
    throw new Error(budgetError.message ?? 'Erro ao buscar orçamento.');
  }

  const { data: postsData, error: postsError } = await supabase
    .from('budget_posts')
    .select(BUDGET_POSTS_WITH_MATERIALS_SELECT)
    .eq('budget_id', budgetId)
    .order('counter', { ascending: true })
    .limit(BUDGET_POSTS_PAGE_SIZE);

  if (postsError) {
    throw new Error(postsError.message ?? 'Erro ao buscar postes do orçamento.');
  }

  const posts = (postsData ?? []) as unknown as BudgetPostDetail[];
  const budgetDetails: BudgetDetails = {
    id: budgetRow.id,
    name: budgetRow.project_name ?? '',
    status: budgetRow.status === 'Finalizado' ? 'Finalizado' : 'Em Andamento',
    render_version: budgetRow.render_version ?? undefined,
    posts,
  };

  return consolidatedRowsToMap(consolidateMaterialsFromBudgetDetails(budgetDetails));
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
