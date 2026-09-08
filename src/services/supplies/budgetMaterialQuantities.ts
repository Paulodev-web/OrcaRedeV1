import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getSessionExcludedMaterialIds } from '@/services/supplies/materialSuppliesFilter';
import { timeServer } from '@/lib/perf/serverTiming';

export interface BudgetMaterialQuantityRow {
  id: string;
  code: string;
  name: string;
  unit: string;
  required_qty: number;
  /** Preço unitário do orçamento (price_at_addition ou preço atual do material). */
  unit_price: number;
}

/** Linha devolvida pela RPC `budget_consolidated_materials`. */
interface ConsolidatedRpcRow {
  material_id: string;
  code: string | null;
  name: string | null;
  unit: string | null;
  required_qty: number | string;
  unit_price: number | string;
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
 * Lista completa do orçamento consolidado, agregada no Postgres.
 *
 * Antes isto carregava budget_posts com grupos, materiais de grupo, avulsos e
 * o catálogo aninhados, e somava em JavaScript: 7.623 linhas e ~1,4 MB de dados
 * brutos no maior orçamento da base, para produzir uma lista de 100 materiais.
 * E rodava a CADA abertura de Conciliação e Cenários, e a cada vínculo salvo.
 *
 * A regra de consolidação vive agora em `budget_consolidated_materials`
 * (migration 20260908120000). A paridade com a versão em JS foi verificada em
 * todos os orçamentos da base por `scripts/check-bom-parity.mjs`: quantidade e
 * presença idênticas, e o preço unitário agora é determinístico onde antes
 * dependia da ordem em que o PostgREST devolvia os níveis aninhados.
 */
export async function loadFullConsolidatedBudgetMaterials(
  supabase: SupabaseClient,
  budgetId: string
): Promise<Map<string, BudgetMaterialQuantityRow>> {
  return timeServer('bom: budget_consolidated_materials', async () => {
    const { data, error } = await supabase.rpc('budget_consolidated_materials', {
      p_budget_id: budgetId,
    });

    if (error) {
      throw new Error(error.message ?? 'Erro ao consolidar materiais do orçamento.');
    }

    const map = new Map<string, BudgetMaterialQuantityRow>();
    for (const row of (data ?? []) as ConsolidatedRpcRow[]) {
      map.set(row.material_id, {
        id: row.material_id,
        code: row.code ?? '',
        name: row.name ?? 'Material sem nome',
        unit: row.unit ?? '',
        required_qty: Number(row.required_qty),
        unit_price: Number(row.unit_price),
      });
    }
    return map;
  });
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

/**
 * Uma linha do BOM consolidado, sem trazer as outras.
 *
 * Filtra do lado do PostgREST em cima da mesma função. Para quem só precisa de
 * nome, unidade e quantidade de um material (cotação manual), evita transportar
 * a lista inteira do orçamento.
 *
 * Devolve null quando o material não faz parte do orçamento, o que responde de
 * quebra a pergunta de escopo do RDN04.
 */
export async function loadBudgetMaterialRow(
  supabase: SupabaseClient,
  budgetId: string,
  materialId: string
): Promise<BudgetMaterialQuantityRow | null> {
  return timeServer('bom: budget_consolidated_materials (1 material)', async () => {
    const { data, error } = await supabase
      .rpc('budget_consolidated_materials', { p_budget_id: budgetId })
      .eq('material_id', materialId)
      .maybeSingle<ConsolidatedRpcRow>();

    if (error) {
      throw new Error(error.message ?? 'Erro ao buscar material do orçamento.');
    }
    if (!data) return null;

    return {
      id: data.material_id,
      code: data.code ?? '',
      name: data.name ?? 'Material sem nome',
      unit: data.unit ?? '',
      required_qty: Number(data.required_qty),
      unit_price: Number(data.unit_price),
    };
  });
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

/**
 * Pergunta booleana respondida com um `exists`, não com o BOM inteiro.
 *
 * Este era o caminho mais caro do módulo: `assertMaterialInBudgetScope` roda a
 * cada vínculo manual salvo e a cada sugestão da IA aceita, e carregava alguns
 * milhares de linhas só para conferir se um material_id estava na lista.
 */
export async function isMaterialInBudget(
  supabase: SupabaseClient,
  budgetId: string,
  materialId: string
): Promise<boolean> {
  return timeServer('bom: is_material_in_budget', async () => {
    const { data, error } = await supabase.rpc('is_material_in_budget', {
      p_budget_id: budgetId,
      p_material_id: materialId,
    });

    if (error) {
      throw new Error(error.message ?? 'Erro ao validar material do orçamento.');
    }

    return data === true;
  });
}

export const OFF_BUDGET_MATCH_ERROR =
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
