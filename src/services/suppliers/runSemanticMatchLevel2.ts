import type { SupabaseClient } from '@supabase/supabase-js';
import { semanticMatch } from '@/services/ai/semanticMatch';
import type {
  SemanticMatchSuggestionPayload,
  SystemMaterial,
  UnconciliatedItem,
} from '@/types/supplierExtract';
import { loadConsolidatedBudgetMaterialsFromDb } from '@/services/supplies/budgetMaterialQuantities';
import { getSuppliesExcludedMaterialIds } from '@/services/supplies/materialSuppliesFilter';
import {
  chunkItems,
  getCandidateMaterialsForBatch,
} from '@/services/suppliers/materialMatchCandidates';
import {
  CONFIDENCE_AUTO_APPLY_THRESHOLD,
  getSemanticMatchBatchRetry,
  getSemanticMatchBatchSize,
  getSemanticMatchGeminiModel,
  getSemanticMatchMaxCandidates,
} from '@/lib/suppliesSemanticMatchConfig';

export interface SemanticMatchLevel2Result {
  matched: number;
  total: number;
  batchesProcessed: number;
  batchesFailed: number;
}

export interface SemanticMatchPipelineContext {
  supplierName: string;
  budgetId: string | null;
  sessionId: string;
  batchItemIds: string[][];
}

export interface SingleSemanticMatchBatchResult {
  matched: number;
  processed: boolean;
  failed: boolean;
  totalBatches: number;
  done: boolean;
}

async function loadSystemMaterials(
  supabase: SupabaseClient,
  userId: string,
  budgetId: string | null,
  sessionId?: string | null
): Promise<SystemMaterial[]> {
  const excludedIds = await getSuppliesExcludedMaterialIds(supabase, userId, sessionId);

  if (budgetId) {
    const map = await loadConsolidatedBudgetMaterialsFromDb(supabase, budgetId, {
      sessionId,
      userId,
    });
    return Array.from(map.values()).map((m) => ({
      id: m.id,
      code: m.code,
      name: m.name,
      unit: m.unit,
    }));
  }

  const { data } = await supabase
    .from('materials')
    .select('id, code, name, unit')
    .eq('user_id', userId)
    .eq('active_in_supplies', true);

  return ((data ?? []) as SystemMaterial[]).filter((m) => !excludedIds.has(m.id));
}

async function fetchExistingSuggestedItemIds(
  supabase: SupabaseClient,
  itemIds: string[]
): Promise<Set<string>> {
  if (itemIds.length === 0) return new Set();

  const { data } = await supabase
    .from('semantic_match_suggestions')
    .select('supplier_quote_item_id')
    .in('supplier_quote_item_id', itemIds)
    .eq('status', 'suggested');

  return new Set((data ?? []).map((row) => row.supplier_quote_item_id as string));
}

async function persistBatchSuggestions(
  supabase: SupabaseClient,
  suggestions: SemanticMatchSuggestionPayload[],
  skipItemIds: Set<string>
): Promise<void> {
  const rows = suggestions
    .filter((s) => !skipItemIds.has(s.supplierItemId))
    .map((s) => ({
      supplier_quote_item_id: s.supplierItemId,
      suggested_material_id: s.materialId,
      suggested_conversion_factor: s.conversionFactor,
      confidence_score: s.confidenceScore,
      rationale: s.rationale ?? null,
      status: 'suggested' as const,
      model: getSemanticMatchGeminiModel(),
    }));

  if (rows.length === 0) return;

  const { error } = await supabase.from('semantic_match_suggestions').insert(rows);
  if (error) {
    console.warn('[runSemanticMatchLevel2] Falha ao inserir sugestões em lote:', error.message);
  }
}

async function applyAutoMatches(
  supabase: SupabaseClient,
  suggestions: SemanticMatchSuggestionPayload[],
  threshold: number
): Promise<number> {
  let matchedCount = 0;

  for (const suggestion of suggestions) {
    if (suggestion.confidenceScore < threshold) continue;

    const { error: updateError } = await supabase
      .from('supplier_quote_items')
      .update({
        matched_material_id: suggestion.materialId,
        conversion_factor: suggestion.conversionFactor,
        match_status: 'ia_suggested',
        match_level: 2,
        match_method: 'semantic_ai',
        match_confidence: suggestion.confidenceScore,
      })
      .eq('id', suggestion.supplierItemId)
      .eq('match_status', 'sem_match');

    if (!updateError) {
      matchedCount++;
    }
  }

  return matchedCount;
}

async function runBatchWithRetry(
  batch: UnconciliatedItem[],
  candidates: SystemMaterial[],
  supplierName: string,
  maxRetries: number
) {
  let lastError: string | undefined;
  let attempts = 0;
  const maxAttempts = maxRetries + 1;

  while (attempts < maxAttempts) {
    attempts++;
    const result = await semanticMatch(batch, candidates, supplierName);
    if (result.success) {
      return result;
    }
    lastError = result.error;
    if (attempts < maxAttempts) {
      console.warn(
        `[runSemanticMatchLevel2] Retry lote (tentativa ${attempts + 1}/${maxAttempts}):`,
        result.error
      );
    }
  }

  return { success: false as const, error: lastError ?? 'Erro desconhecido no match semântico.' };
}

async function loadUnconciliatedItemsForQuote(
  supabase: SupabaseClient,
  quoteId: string
): Promise<UnconciliatedItem[]> {
  const { data: pendingItems } = await supabase
    .from('supplier_quote_items')
    .select('id, descricao, unidade, quantidade, preco_unit')
    .eq('quote_id', quoteId)
    .eq('match_status', 'sem_match');

  if (!pendingItems || pendingItems.length === 0) {
    return [];
  }

  return pendingItems.map((it) => ({
    id: it.id,
    descricao: it.descricao,
    unidade: it.unidade,
    quantidade: it.quantidade,
    preco_unit: it.preco_unit,
  }));
}

/**
 * Monta contexto de lotes para o pipeline multi-step (snapshot de item IDs por lote).
 */
export async function buildSemanticMatchPipelineContext(
  supabase: SupabaseClient,
  userId: string,
  quoteId: string,
  supplierName: string,
  budgetId: string | null,
  sessionId: string,
  options?: { stepMode?: boolean }
): Promise<SemanticMatchPipelineContext | null> {
  const unconciliated = await loadUnconciliatedItemsForQuote(supabase, quoteId);
  if (unconciliated.length === 0) {
    return {
      supplierName,
      budgetId,
      sessionId,
      batchItemIds: [],
    };
  }

  const systemMaterials = await loadSystemMaterials(supabase, userId, budgetId, sessionId);
  if (systemMaterials.length === 0) {
    return {
      supplierName,
      budgetId,
      sessionId,
      batchItemIds: [],
    };
  }

  const batchSize = getSemanticMatchBatchSize(systemMaterials.length, options);
  const batches = chunkItems(unconciliated, batchSize);

  return {
    supplierName,
    budgetId,
    sessionId,
    batchItemIds: batches.map((batch) => batch.map((it) => it.id)),
  };
}

/**
 * Executa um único lote L2 (índice 0-based) usando snapshot de IDs do contexto.
 */
export async function runSingleSemanticMatchBatch(
  supabase: SupabaseClient,
  userId: string,
  quoteId: string,
  ctx: SemanticMatchPipelineContext,
  batchIndex: number,
  options?: { stepMode?: boolean }
): Promise<SingleSemanticMatchBatchResult> {
  const totalBatches = ctx.batchItemIds.length;
  const done = batchIndex >= totalBatches;

  if (done || totalBatches === 0) {
    return { matched: 0, processed: false, failed: false, totalBatches, done: true };
  }

  const itemIds = ctx.batchItemIds[batchIndex];
  if (itemIds.length === 0) {
    return {
      matched: 0,
      processed: true,
      failed: false,
      totalBatches,
      done: batchIndex + 1 >= totalBatches,
    };
  }

  const systemMaterials = await loadSystemMaterials(
    supabase,
    userId,
    ctx.budgetId,
    ctx.sessionId
  );
  if (systemMaterials.length === 0) {
    return {
      matched: 0,
      processed: false,
      failed: false,
      totalBatches,
      done: batchIndex + 1 >= totalBatches,
    };
  }

  const { data: items } = await supabase
    .from('supplier_quote_items')
    .select('id, descricao, unidade, quantidade, preco_unit')
    .in('id', itemIds)
    .eq('match_status', 'sem_match');

  const batch: UnconciliatedItem[] = (items ?? []).map((it) => ({
    id: it.id,
    descricao: it.descricao,
    unidade: it.unidade,
    quantidade: it.quantidade,
    preco_unit: it.preco_unit,
  }));

  if (batch.length === 0) {
    console.log(
      `[runSemanticMatchLevel2] Lote ${batchIndex + 1}/${totalBatches}: itens já conciliados, pulando`
    );
    return {
      matched: 0,
      processed: true,
      failed: false,
      totalBatches,
      done: batchIndex + 1 >= totalBatches,
    };
  }

  const maxCandidates = getSemanticMatchMaxCandidates(options);
  const maxRetries = getSemanticMatchBatchRetry();
  const candidates = getCandidateMaterialsForBatch(batch, systemMaterials, maxCandidates);
  const batchNum = batchIndex + 1;

  console.log(
    `[runSemanticMatchLevel2] Lote ${batchNum}/${totalBatches}: ${batch.length} itens, ${candidates.length} candidatos`
  );

  const result = await runBatchWithRetry(batch, candidates, ctx.supplierName, maxRetries);

  if (!result.success) {
    console.warn(`[runSemanticMatchLevel2] Lote ${batchNum}/${totalBatches} falhou:`, result.error);
    return {
      matched: 0,
      processed: true,
      failed: true,
      totalBatches,
      done: batchIndex + 1 >= totalBatches,
    };
  }

  const existingSuggested = await fetchExistingSuggestedItemIds(
    supabase,
    batch.map((it) => it.id)
  );

  await persistBatchSuggestions(supabase, result.suggestions, existingSuggested);

  const autoApplied = await applyAutoMatches(
    supabase,
    result.suggestions,
    CONFIDENCE_AUTO_APPLY_THRESHOLD
  );

  console.log(
    `[runSemanticMatchLevel2] Lote ${batchNum}/${totalBatches}: ${result.suggestions.length} sugestões, ${autoApplied} auto-aplicadas`
  );

  return {
    matched: autoApplied,
    processed: true,
    failed: false,
    totalBatches,
    done: batchIndex + 1 >= totalBatches,
  };
}

/**
 * Nível 2 — IA Semântica em lotes: pré-filtra candidatos, chama Gemini por lote,
 * persiste sugestões e auto-aplica acima do threshold.
 */
export async function runSemanticMatchLevel2(
  supabase: SupabaseClient,
  userId: string,
  quoteId: string,
  supplierName: string,
  budgetId: string | null,
  sessionId: string | null
): Promise<SemanticMatchLevel2Result> {
  const ctx = await buildSemanticMatchPipelineContext(
    supabase,
    userId,
    quoteId,
    supplierName,
    budgetId,
    sessionId ?? ''
  );

  if (!ctx || ctx.batchItemIds.length === 0) {
    const pending = await loadUnconciliatedItemsForQuote(supabase, quoteId);
    return { matched: 0, total: pending.length, batchesProcessed: 0, batchesFailed: 0 };
  }

  let matchedCount = 0;
  let batchesProcessed = 0;
  let batchesFailed = 0;
  const initialTotal = ctx.batchItemIds.reduce((sum, ids) => sum + ids.length, 0);

  for (let i = 0; i < ctx.batchItemIds.length; i++) {
    const batchResult = await runSingleSemanticMatchBatch(supabase, userId, quoteId, ctx, i);
    if (batchResult.processed) {
      if (batchResult.failed) {
        batchesFailed++;
      } else {
        batchesProcessed++;
        matchedCount += batchResult.matched;
      }
    }
  }

  return {
    matched: matchedCount,
    total: initialTotal,
    batchesProcessed,
    batchesFailed,
  };
}
