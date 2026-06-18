'use server';

import { after } from 'next/server';
import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient, requireAuthUserId } from '@/lib/supabaseServer';
import { getSupplierDisplayName } from '@/lib/supplierDisplay';
import { effectiveUnitPrice, normalizedPrice } from '@/lib/supplierPrice';
import { autoMatchQuoteItems } from '@/services/suppliers/autoMatchQuoteItems';
import { resolveSupplierForQuote } from '@/services/suppliers/resolveSupplierForQuote';
import { saveManualSessionQuoteItem } from '@/services/suppliers/saveManualSessionQuoteItem';
import {
  getSessionExcludedMaterialIds,
  getSuppliesExcludedMaterialIds,
} from '@/services/supplies/materialSuppliesFilter';
import { applyIdealScenarioPricesToMaterials } from '@/services/supplies/applyIdealScenarioPricesToMaterials';
import {
  assertMaterialInBudgetScope,
  loadBudgetMaterialQuantities,
  loadConsolidatedBudgetMaterialsFromDb,
} from '@/services/supplies/budgetMaterialQuantities';
import { MAX_PDFS_PER_QUOTATION } from '@/lib/suppliesLimits';
import type { SupplierExtractItem } from '@/types/supplierExtract';
import type { SupplierQuote, SupplierQuoteItem, SupplierMatchMethod, SupplierQuoteStatus } from '@/types';

// ---------------------------------------------------------------------------
// Tipos de retorno padronizados (mesmo padrão das demais actions do projeto)
// ---------------------------------------------------------------------------
type ActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string };

// ---------------------------------------------------------------------------
// createSupplierQuoteAction
// Persiste a cotação e seus itens extraídos. Retorna o quoteId criado.
// ---------------------------------------------------------------------------
export interface CreateQuoteInput {
  /** Null quando a cotação pertence a uma sessão global (catálogo). */
  budget_id: string | null;
  session_id?: string | null;
  supplier_id: string;
  pdf_path: string;
  observacoes_gerais: string;
  quote_date?: string | null;
  items: SupplierExtractItem[];
}

export async function createSupplierQuoteAction(
  input: CreateQuoteInput
): Promise<ActionResult<{ quoteId: string }>> {
  try {
    const supabase = await createSupabaseServerClient();
    const userId = await requireAuthUserId(supabase);

    if (!input.supplier_id?.trim()) {
      return { success: false, error: 'Selecione um fornecedor antes de salvar a cotação.' };
    }

    const resolved = await resolveSupplierForQuote(supabase, userId, input.supplier_id.trim());
    if ('error' in resolved) {
      return { success: false, error: resolved.error };
    }

    // 1. Cria o registro da cotação
    const { data: quote, error: quoteError } = await supabase
      .from('supplier_quotes')
      .insert({
        budget_id: input.budget_id,
        session_id: input.session_id ?? null,
        supplier_id: resolved.id,
        supplier_name: resolved.name,
        pdf_path: input.pdf_path,
        observacoes_gerais: input.observacoes_gerais || null,
        quote_date: input.quote_date ?? null,
        status: 'pendente',
        user_id: userId,
      })
      .select('id')
      .single();

    if (quoteError || !quote) {
      return { success: false, error: quoteError?.message ?? 'Erro ao criar cotação.' };
    }

    const itemsToInsert = input.items.map((item) => ({
      quote_id: quote.id,
      descricao: item.descricao,
      unidade: item.unidade,
      quantidade: item.quantidade,
      preco_unit: item.preco_unit,
      total_item: item.total_item,
      ipi_percent: item.ipi_percent,
      st_incluso: item.st_incluso,
      alerta: item.alerta,
      match_status: 'sem_match',
      conversion_factor: 1,
      match_level: null,
      match_confidence: null,
      match_method: null,
    }));

    const { error: itemsError } = await supabase
      .from('supplier_quote_items')
      .insert(itemsToInsert);

    if (itemsError) {
      // Rollback manual: remove a cotação (itens em cascade)
      await supabase.from('supplier_quotes').delete().eq('id', quote.id);
      return { success: false, error: `Erro ao salvar itens: ${itemsError.message}` };
    }

    console.log('[supplierQuotes] Cotação criada:', quote.id, '— itens:', itemsToInsert.length);
    return { success: true, data: { quoteId: quote.id } };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro inesperado ao criar cotação.';
    return { success: false, error: message };
  }
}

// ---------------------------------------------------------------------------
// createExtractionJobAction
// Cria job de extração após upload do PDF e escolha do fornecedor.
// ---------------------------------------------------------------------------
export async function createExtractionJobAction(input: {
  sessionId: string;
  filePath: string;
  supplierId: string;
}): Promise<ActionResult<{ jobId: string }>> {
  try {
    const supabase = await createSupabaseServerClient();
    const userId = await requireAuthUserId(supabase);

    const sessionId = input.sessionId?.trim();
    const filePath = input.filePath?.trim();
    const supplierId = input.supplierId?.trim();

    if (!sessionId || !filePath || !supplierId) {
      return { success: false, error: 'Sessão, arquivo e fornecedor são obrigatórios.' };
    }

    const expectedPrefix = `${userId}/${sessionId}/`;
    if (!filePath.startsWith(expectedPrefix)) {
      return { success: false, error: 'Caminho do arquivo inválido para esta sessão.' };
    }

    const { data: session, error: sessionError } = await supabase
      .from('quotation_sessions')
      .select('id, status')
      .eq('id', sessionId)
      .eq('user_id', userId)
      .single();

    if (sessionError || !session) {
      return { success: false, error: 'Sessão não encontrada.' };
    }

    if (session.status === 'completed') {
      return {
        success: false,
        error: 'Esta sessão está encerrada; não é possível importar novos PDFs.',
      };
    }

    const { count: jobCount, error: countError } = await supabase
      .from('extraction_jobs')
      .select('id', { count: 'exact', head: true })
      .eq('session_id', sessionId)
      .eq('user_id', userId);

    if (countError) {
      return { success: false, error: countError.message };
    }
    if ((jobCount ?? 0) >= MAX_PDFS_PER_QUOTATION) {
      return {
        success: false,
        error: `Esta cotação já atingiu o limite de ${MAX_PDFS_PER_QUOTATION} PDFs.`,
      };
    }

    const resolved = await resolveSupplierForQuote(supabase, userId, supplierId);
    if ('error' in resolved) {
      return { success: false, error: resolved.error };
    }

    const { data: job, error: jobError } = await supabase
      .from('extraction_jobs')
      .insert({
        session_id: sessionId,
        user_id: userId,
        file_path: filePath,
        supplier_id: resolved.id,
        status: 'pending',
      })
      .select('id')
      .single();

    if (jobError || !job) {
      return { success: false, error: jobError?.message ?? 'Erro ao criar job de extração.' };
    }

    return { success: true, data: { jobId: job.id } };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro ao criar job de extração.';
    return { success: false, error: message };
  }
}

// ---------------------------------------------------------------------------
// runAutoMatchAction
// Cruza os itens sem match contra a memória supplier_material_mappings.
// Atualiza match_status = 'automatico' nos itens encontrados.
// ---------------------------------------------------------------------------
export async function runAutoMatchAction(
  quoteId: string
): Promise<ActionResult<{ matched: number; total: number }>> {
  try {
    const supabase = await createSupabaseServerClient();
    const userId = await requireAuthUserId(supabase);

    const { data: quote, error: quoteError } = await supabase
      .from('supplier_quotes')
      .select('id')
      .eq('id', quoteId)
      .eq('user_id', userId)
      .single();

    if (quoteError || !quote) {
      return { success: false, error: 'Cotação não encontrada.' };
    }

    const result = await autoMatchQuoteItems(supabase, userId, quoteId);
    console.log(
      `[supplierQuotes] Auto-match concluído: ${result.matched}/${result.total} itens vinculados`
    );
    return { success: true, data: result };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro inesperado no auto-match.';
    return { success: false, error: message };
  }
}

// ---------------------------------------------------------------------------
// getQuoteWithItemsAction
// Carrega a cotação completa com todos os itens e o nome do material vinculado.
// Usado pela página de conciliação.
// ---------------------------------------------------------------------------
export interface SupplierQuoteItemWithMaterial extends SupplierQuoteItem {
  material_name?: string | null;
  material_code?: string | null;
  material_unit?: string | null;
  suggestion_rationale?: string | null;
}

export async function getQuoteWithItemsAction(
  quoteId: string
): Promise<ActionResult<{ quote: SupplierQuote; items: SupplierQuoteItemWithMaterial[] }>> {
  try {
    const supabase = await createSupabaseServerClient();
    const userId = await requireAuthUserId(supabase);

    // Primeiro verifica se a cotação existe (sem filtrar por user_id para diagnóstico)
    const { data: quoteCheck, error: checkError } = await supabase
      .from('supplier_quotes')
      .select('id, user_id')
      .eq('id', quoteId)
      .single();

    if (checkError || !quoteCheck) {
      console.error('[getQuoteWithItemsAction] Cotação não encontrada no banco:', quoteId, checkError?.message);
      return { success: false, error: 'Cotação não encontrada no sistema.' };
    }

    // Verifica ownership
    if (quoteCheck.user_id !== userId) {
      console.error('[getQuoteWithItemsAction] Ownership mismatch:', {
        quoteId,
        quoteUserId: quoteCheck.user_id,
        requestingUserId: userId,
      });
      return { success: false, error: 'Você não tem permissão para acessar esta cotação.' };
    }

    const primaryQuoteColumns =
      'id, budget_id, session_id, supplier_name, pdf_path, display_name, status, observacoes_gerais, quote_date, extraction_validated_at, user_id, created_at, updated_at';
    const legacyQuoteColumns =
      'id, budget_id, session_id, supplier_name, pdf_path, status, observacoes_gerais, user_id, created_at, updated_at';

    let { data: quote, error: quoteError } = await supabase
      .from('supplier_quotes')
      .select(primaryQuoteColumns)
      .eq('id', quoteId)
      .eq('user_id', userId)
      .single();

    const quoteErrorMsg = quoteError?.message ?? '';
    const shouldRetryWithLegacyColumns =
      quoteErrorMsg.includes('display_name') ||
      quoteErrorMsg.includes('extraction_validated_at') ||
      quoteErrorMsg.includes('quote_date');

    if ((quoteError || !quote) && shouldRetryWithLegacyColumns) {
      const fallbackRes = await supabase
        .from('supplier_quotes')
        .select(legacyQuoteColumns)
        .eq('id', quoteId)
        .eq('user_id', userId)
        .single();

      quote = fallbackRes.data
        ? {
            ...fallbackRes.data,
            display_name: null,
            quote_date: null,
            extraction_validated_at: null,
          }
        : null;
      quoteError = fallbackRes.error;
    }

    if (quoteError || !quote) {
      console.error('[getQuoteWithItemsAction] Falha ao carregar cotação após verificação:', quoteError?.message);
      return { success: false, error: 'Erro ao carregar dados da cotação.' };
    }

    const { data: rawItems, error: itemsError } = await supabase
      .from('supplier_quote_items')
      .select(`
        id,
        quote_id,
        descricao,
        unidade,
        quantidade,
        preco_unit,
        preco_unit_desconto,
        total_item,
        ipi_percent,
        st_incluso,
        alerta,
        matched_material_id,
        conversion_factor,
        match_status,
        match_level,
        match_confidence,
        match_method,
        created_at,
        materials (
          code,
          name,
          unit
        ),
        semantic_match_suggestions (
          id,
          suggested_material_id,
          suggested_conversion_factor,
          confidence_score,
          rationale,
          status
        )
      `)
      .eq('quote_id', quoteId)
      .order('created_at', { ascending: true });

    if (itemsError) {
      return { success: false, error: `Erro ao buscar itens: ${itemsError.message}` };
    }

    const items: SupplierQuoteItemWithMaterial[] = (rawItems ?? []).map((row) => {
      const materialRow = Array.isArray(row.materials)
        ? row.materials[0]
        : row.materials;

      const suggestions = (row.semantic_match_suggestions ?? []) as {
        rationale?: string;
        status: string;
      }[];
      const acceptedSuggestion = suggestions.find((s) => s.status === 'accepted');

      return {
        id: row.id,
        quote_id: row.quote_id,
        descricao: row.descricao,
        unidade: row.unidade,
        quantidade: row.quantidade,
        preco_unit: row.preco_unit,
        preco_unit_desconto: row.preco_unit_desconto ?? null,
        total_item: row.total_item,
        ipi_percent: row.ipi_percent,
        st_incluso: row.st_incluso,
        alerta: row.alerta,
        matched_material_id: row.matched_material_id ?? null,
        conversion_factor: row.conversion_factor,
        match_status: row.match_status,
        match_level: row.match_level ?? null,
        match_confidence: row.match_confidence ?? null,
        match_method: (row.match_method as SupplierMatchMethod) ?? null,
        created_at: row.created_at,
        material_name: materialRow?.name ?? null,
        material_code: materialRow?.code ?? null,
        material_unit: materialRow?.unit ?? null,
        suggestion_rationale: acceptedSuggestion?.rationale ?? null,
      };
    });

    return { success: true, data: { quote, items } };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro ao buscar cotação.';
    return { success: false, error: message };
  }
}

// ---------------------------------------------------------------------------
// getBudgetMaterialsAction
// Retorna a lista deduplicada de materiais presentes num orçamento específico.
// Escopo restrito ao orçamento (RDN01) — não busca o catálogo global.
// ---------------------------------------------------------------------------
export interface BudgetMaterialOption {
  id: string;
  code: string;
  name: string;
  unit: string;
}

export async function getBudgetMaterialsAction(
  budgetId: string,
  sessionId?: string | null
): Promise<
  ActionResult<{
    materials: BudgetMaterialOption[];
    budget_consolidated_count: number;
    excluded_material_ids: string[];
  }>
> {
  try {
    const supabase = await createSupabaseServerClient();
    const userId = await requireAuthUserId(supabase);

    const map = await loadConsolidatedBudgetMaterialsFromDb(supabase, budgetId);
    const excludedMaterialIds = sessionId
      ? await getSessionExcludedMaterialIds(supabase, sessionId, userId)
      : new Set<string>();

    const materials: BudgetMaterialOption[] = Array.from(map.values())
      .map((m) => ({ id: m.id, code: m.code, name: m.name, unit: m.unit }))
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));

    return {
      success: true,
      data: {
        materials,
        budget_consolidated_count: materials.length,
        excluded_material_ids: Array.from(excludedMaterialIds),
      },
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro ao buscar materiais do orçamento.';
    return { success: false, error: message };
  }
}

// ---------------------------------------------------------------------------
// getCatalogMaterialsAction
// Catálogo global do usuário (sessão sem orçamento).
// ---------------------------------------------------------------------------
export async function getCatalogMaterialsAction(
  sessionId?: string | null
): Promise<
  ActionResult<{
    materials: BudgetMaterialOption[];
    budget_consolidated_count: number;
    excluded_material_ids: string[];
  }>
> {
  try {
    const supabase = await createSupabaseServerClient();
    const userId = await requireAuthUserId(supabase);
    const { data, error } = await supabase
      .from('materials')
      .select('id, code, name, unit')
      .eq('user_id', userId)
      .eq('active_in_supplies', true)
      .order('name', { ascending: true });

    if (error) {
      return { success: false, error: error.message };
    }

    const materials: BudgetMaterialOption[] = (data ?? []).map((m) => ({
      id: m.id,
      code: m.code,
      name: m.name,
      unit: m.unit,
    }));
    const sessionExcluded = sessionId
      ? await getSessionExcludedMaterialIds(supabase, sessionId, userId)
      : new Set<string>();

    return {
      success: true,
      data: {
        materials,
        budget_consolidated_count: materials.length,
        excluded_material_ids: Array.from(sessionExcluded),
      },
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro ao buscar catálogo de materiais.';
    return { success: false, error: message };
  }
}

// ---------------------------------------------------------------------------
// saveManualMatchAction
// Salva a vinculação manual de um item com um material interno.
// Persiste também na memória De/Para (supplier_material_mappings) para uso futuro.
// ---------------------------------------------------------------------------
export interface SaveManualMatchInput {
  itemId: string;
  materialId: string;
  conversionFactor: number;
  supplierName: string;
  supplierMaterialName: string;
}

export async function saveManualMatchAction(
  input: SaveManualMatchInput
): Promise<ActionResult<void>> {
  try {
    const supabase = await createSupabaseServerClient();
    const userId = await requireAuthUserId(supabase);

    const { data: itemQuote, error: itemQuoteError } = await supabase
      .from('supplier_quote_items')
      .select('quote_id, supplier_quotes!inner (budget_id, session_id, user_id)')
      .eq('id', input.itemId)
      .single();

    if (itemQuoteError || !itemQuote) {
      return { success: false, error: 'Item da cotação não encontrado.' };
    }

    const quote = itemQuote.supplier_quotes as unknown as {
      budget_id: string | null;
      session_id: string | null;
      user_id: string;
    };
    if (quote.user_id !== userId) {
      return { success: false, error: 'Sem permissão para este item.' };
    }

    const scope = await assertMaterialInBudgetScope(
      supabase,
      quote.budget_id,
      input.materialId,
      { sessionId: quote.session_id, userId }
    );
    if (!scope.ok) {
      return { success: false, error: scope.error };
    }

    const { error: itemError } = await supabase
      .from('supplier_quote_items')
      .update({
        matched_material_id: input.materialId,
        conversion_factor: input.conversionFactor,
        match_status: 'manual',
        match_method: 'manual',
        match_level: null,
        match_confidence: null,
      })
      .eq('id', input.itemId);

    if (itemError) {
      return { success: false, error: `Erro ao salvar vínculo: ${itemError.message}` };
    }

    const { error: mappingError } = await supabase
      .from('supplier_material_mappings')
      .upsert(
        {
          user_id: userId,
          supplier_name: input.supplierName,
          supplier_material_name: input.supplierMaterialName,
          internal_material_id: input.materialId,
          conversion_factor: input.conversionFactor,
          source: 'manual',
          last_seen_at: new Date().toISOString(),
          times_used: 1,
        },
        { onConflict: 'user_id,supplier_name,supplier_material_name' }
      );

    if (mappingError) {
      console.warn('[supplierQuotes] Falha ao persistir memória De/Para:', mappingError.message);
    }

    const { data: itemRow } = await supabase
      .from('supplier_quote_items')
      .select('quote_id')
      .eq('id', input.itemId)
      .single();

    if (itemRow?.quote_id) {
      const { data: quoteRow } = await supabase
        .from('supplier_quotes')
        .select('session_id')
        .eq('id', itemRow.quote_id)
        .eq('user_id', userId)
        .single();

      if (quoteRow?.session_id) {
        revalidatePath(`/fornecedores/sessao/${quoteRow.session_id}`);
        revalidatePath(`/fornecedores/sessao/${quoteRow.session_id}/conciliacao`);
        revalidatePath(`/fornecedores/sessao/${quoteRow.session_id}/cenarios`);
      }
    }
    revalidatePath('/fornecedores');
    return { success: true, data: undefined };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro ao salvar vínculo manual.';
    return { success: false, error: message };
  }
}

// ---------------------------------------------------------------------------
// acceptAiSuggestionAction
// Aceita uma sugestão da IA e persiste na memória De/Para para uso futuro.
// ---------------------------------------------------------------------------
export interface AcceptAiSuggestionInput {
  itemId: string;
  suggestionId: string;
  materialId: string;
  conversionFactor: number;
  supplierName: string;
  supplierMaterialName: string;
}

export async function acceptAiSuggestionAction(
  input: AcceptAiSuggestionInput
): Promise<ActionResult<void>> {
  try {
    const supabase = await createSupabaseServerClient();
    const userId = await requireAuthUserId(supabase);

    const { data: itemQuote, error: itemQuoteError } = await supabase
      .from('supplier_quote_items')
      .select('quote_id, supplier_quotes!inner (budget_id, session_id, user_id)')
      .eq('id', input.itemId)
      .single();

    if (itemQuoteError || !itemQuote) {
      return { success: false, error: 'Item da cotação não encontrado.' };
    }

    const quote = itemQuote.supplier_quotes as unknown as {
      budget_id: string | null;
      session_id: string | null;
      user_id: string;
    };
    if (quote.user_id !== userId) {
      return { success: false, error: 'Sem permissão para este item.' };
    }

    const scope = await assertMaterialInBudgetScope(
      supabase,
      quote.budget_id,
      input.materialId,
      { sessionId: quote.session_id, userId }
    );
    if (!scope.ok) {
      return { success: false, error: scope.error };
    }

    const { error: itemError } = await supabase
      .from('supplier_quote_items')
      .update({
        matched_material_id: input.materialId,
        conversion_factor: input.conversionFactor,
        match_status: 'automatico',
        match_method: 'semantic_ai',
        match_level: 2,
      })
      .eq('id', input.itemId);

    if (itemError) {
      return { success: false, error: `Erro ao aceitar sugestão: ${itemError.message}` };
    }

    await supabase
      .from('semantic_match_suggestions')
      .update({ status: 'accepted', reviewed_at: new Date().toISOString() })
      .eq('id', input.suggestionId);

    const { error: mappingError } = await supabase
      .from('supplier_material_mappings')
      .upsert(
        {
          user_id: userId,
          supplier_name: input.supplierName,
          supplier_material_name: input.supplierMaterialName,
          internal_material_id: input.materialId,
          conversion_factor: input.conversionFactor,
          source: 'ai',
          last_seen_at: new Date().toISOString(),
          times_used: 1,
        },
        { onConflict: 'user_id,supplier_name,supplier_material_name' }
      );

    if (mappingError) {
      console.warn('[supplierQuotes] Falha ao persistir mapping IA aceita:', mappingError.message);
    }

    const { data: itemRow } = await supabase
      .from('supplier_quote_items')
      .select('quote_id')
      .eq('id', input.itemId)
      .single();

    if (itemRow?.quote_id) {
      const { data: quoteRow } = await supabase
        .from('supplier_quotes')
        .select('session_id')
        .eq('id', itemRow.quote_id)
        .eq('user_id', userId)
        .single();

      if (quoteRow?.session_id) {
        revalidatePath(`/fornecedores/sessao/${quoteRow.session_id}`);
        revalidatePath(`/fornecedores/sessao/${quoteRow.session_id}/conciliacao`);
        revalidatePath(`/fornecedores/sessao/${quoteRow.session_id}/cenarios`);
      }
    }
    revalidatePath('/fornecedores');
    return { success: true, data: undefined };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro ao aceitar sugestão IA.';
    return { success: false, error: message };
  }
}

// ---------------------------------------------------------------------------
// rejectAiSuggestionAction
// Recusa uma sugestão da IA: limpa o vínculo do item e marca a sugestão como rejected.
// ---------------------------------------------------------------------------
export interface RejectAiSuggestionInput {
  itemId: string;
  suggestionId: string;
}

export async function rejectAiSuggestionAction(
  input: RejectAiSuggestionInput
): Promise<ActionResult<void>> {
  try {
    const supabase = await createSupabaseServerClient();
    const userId = await requireAuthUserId(supabase);

    const { error: itemError } = await supabase
      .from('supplier_quote_items')
      .update({
        matched_material_id: null,
        conversion_factor: 1,
        match_status: 'sem_match',
        match_method: null,
        match_level: null,
        match_confidence: null,
      })
      .eq('id', input.itemId);

    if (itemError) {
      return { success: false, error: `Erro ao recusar sugestão: ${itemError.message}` };
    }

    await supabase
      .from('semantic_match_suggestions')
      .update({ status: 'rejected', reviewed_at: new Date().toISOString() })
      .eq('id', input.suggestionId);

    const { data: itemRow } = await supabase
      .from('supplier_quote_items')
      .select('quote_id')
      .eq('id', input.itemId)
      .single();

    if (itemRow?.quote_id) {
      const { data: quoteRow } = await supabase
        .from('supplier_quotes')
        .select('session_id')
        .eq('id', itemRow.quote_id)
        .eq('user_id', userId)
        .single();

      if (quoteRow?.session_id) {
        revalidatePath(`/fornecedores/sessao/${quoteRow.session_id}`);
        revalidatePath(`/fornecedores/sessao/${quoteRow.session_id}/conciliacao`);
        revalidatePath(`/fornecedores/sessao/${quoteRow.session_id}/cenarios`);
      }
    }
    revalidatePath('/fornecedores');
    return { success: true, data: undefined };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro ao recusar sugestão IA.';
    return { success: false, error: message };
  }
}

// ---------------------------------------------------------------------------
// markQuoteConciliatedAction
// Atualiza o status da cotação para 'conciliado' quando todos os itens têm match.
// ---------------------------------------------------------------------------
export async function markQuoteConciliatedAction(
  quoteId: string
): Promise<ActionResult<void>> {
  try {
    const supabase = await createSupabaseServerClient();
    const userId = await requireAuthUserId(supabase);

    const { error } = await supabase
      .from('supplier_quotes')
      .update({ status: 'conciliado' })
      .eq('id', quoteId)
      .eq('user_id', userId);

    if (error) {
      return { success: false, error: error.message };
    }

    const { data: quoteRow } = await supabase
      .from('supplier_quotes')
      .select('session_id')
      .eq('id', quoteId)
      .eq('user_id', userId)
      .single();

    if (quoteRow?.session_id) {
      revalidatePath(`/fornecedores/sessao/${quoteRow.session_id}`);
      revalidatePath(`/fornecedores/sessao/${quoteRow.session_id}/conciliacao`);
      revalidatePath(`/fornecedores/sessao/${quoteRow.session_id}/cenarios`);
    }
    revalidatePath('/fornecedores');
    return { success: true, data: undefined };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro ao concluir conciliação.';
    return { success: false, error: message };
  }
}

/** Linha retornada por listQuotesByBudgetAction (select com itens aninhados). Evita GenericStringError quando .select recebe string genérica. */
type ListQuotesByBudgetRow = {
  id: string;
  budget_id: string | null;
  session_id: string | null;
  supplier_id: string | null;
  supplier_name: string;
  suppliers?: { name: string } | { name: string }[] | null;
  pdf_path: string;
  display_name?: string | null;
  status: SupplierQuoteStatus;
  observacoes_gerais: string | null;
  user_id: string;
  created_at: string;
  updated_at: string;
  supplier_quote_items: { id: string; match_status: string }[] | null;
};

// ---------------------------------------------------------------------------
// listQuotesByBudgetAction
// Lista todas as cotações de um orçamento (para a tela de cenários).
// ---------------------------------------------------------------------------
export async function listQuotesByBudgetAction(
  budgetId: string,
  sessionId?: string
): Promise<ActionResult<{ quotes: (SupplierQuote & { item_count: number; matched_count: number })[] }>> {
  try {
    const supabase = await createSupabaseServerClient();
    const userId = await requireAuthUserId(supabase);

    const primaryQuoteColumns = `
      id,
      budget_id,
      session_id,
      supplier_id,
      supplier_name,
      suppliers ( name ),
      pdf_path,
      display_name,
      status,
      observacoes_gerais,
      user_id,
      created_at,
      updated_at,
      supplier_quote_items (id, match_status)
    `;
    const legacyQuoteColumns = `
      id,
      budget_id,
      session_id,
      supplier_name,
      pdf_path,
      status,
      observacoes_gerais,
      user_id,
      created_at,
      updated_at,
      supplier_quote_items (id, match_status)
    `;

    const runQuotesQuery = async (columns: string) => {
      let query = supabase
        .from('supplier_quotes')
        .select(columns)
        .eq('budget_id', budgetId)
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (sessionId) {
        query = query.eq('session_id', sessionId);
      }

      return query;
    };

    type QuotesQueryPayload = {
      data: ListQuotesByBudgetRow[] | null;
      error: { message: string } | null;
    };

    let { data: quotes, error } = (await runQuotesQuery(
      primaryQuoteColumns
    )) as QuotesQueryPayload;

    const errorMsg = error?.message ?? '';
    const shouldRetryWithLegacyColumns = errorMsg.includes('display_name');

    if ((error || !quotes) && shouldRetryWithLegacyColumns) {
      const fallbackRes = (await runQuotesQuery(legacyQuoteColumns)) as QuotesQueryPayload;
      quotes = fallbackRes.data?.map((quote) => ({ ...quote, display_name: null })) ?? null;
      error = fallbackRes.error;
    }

    if (error) {
      return { success: false, error: error.message };
    }

    const result = (quotes ?? []).map((q) => {
      const allItems = (q.supplier_quote_items ?? []) as { match_status: string }[];
      return {
        id: q.id,
        budget_id: q.budget_id,
        supplier_id: q.supplier_id ?? null,
        supplier_name: getSupplierDisplayName(q),
        pdf_path: q.pdf_path,
        display_name: q.display_name ?? null,
        status: q.status,
        observacoes_gerais: q.observacoes_gerais ?? undefined,
        user_id: q.user_id,
        created_at: q.created_at,
        updated_at: q.updated_at,
        item_count: allItems.length,
        matched_count: allItems.filter((i) => i.match_status === 'automatico' || i.match_status === 'manual').length,
      };
    });

    return { success: true, data: { quotes: result } };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro ao listar cotações.';
    return { success: false, error: message };
  }
}

// ---------------------------------------------------------------------------
// calculateScenariosAction
// Calcula Cenário A (pacote por fornecedor) e Cenário B (melhor preço por item).
// Todos os preços são normalizados: preco_normalizado = preco_unit / conversion_factor.
// required_qty = necessidade agregada do orçamento (fonte da verdade, RDN04).
// supplier_quote_items.quantidade = qtd. declarada no PDF do fornecedor (referência).
// net_qty = max(required_qty - stock_qty, 0).
// ---------------------------------------------------------------------------
export interface ScenarioItem {
  material_id: string;
  material_name: string;
  material_code: string;
  material_unit: string;
  required_qty: number;
  stock_qty: number;
  net_qty: number;
  /** Oculto da sessão de compras (✓), mas permanece na lista consolidada. */
  is_session_excluded?: boolean;
  best_supplier: string;
  best_price_normalized: number;
  best_total: number;
  all_offers: {
    quote_item_id: string;
    quote_id: string;
    supplier_name: string;
    preco_unit: number;
    preco_negociado: number | null;
    conversion_factor: number;
    preco_normalizado: number;
    total_normalizado: number;
    /** Quantidade extraída do PDF do fornecedor (não usada em NEC/COMPRA). */
    quantidade_pdf: number;
    match_status: 'automatico' | 'manual' | 'ia_suggested';
  }[];
}

export interface IdealSelectionRow {
  material_id: string;
  quote_id: string;
}

export interface ScenarioSupplier {
  supplier_name: string;
  quote_id: string;
  items_covered: number;
  total_items: number;
  total_normalizado: number;
}

export interface ScenariosResult {
  scenarioA: ScenarioSupplier[];
  scenarioB: {
    items: ScenarioItem[];
    total_normalizado: number;
    saving_vs_cheapest_a: number;
  };
  budget_total_reference: number;
  budget_consolidated_count: number;
  excluded_material_ids: string[];
}

export async function calculateScenariosAction(
  budgetId: string,
  sessionId?: string
): Promise<ActionResult<ScenariosResult>> {
  try {
    const supabase = await createSupabaseServerClient();
    const userId = await requireAuthUserId(supabase);

    const budgetQtyMap = await loadBudgetMaterialQuantities(supabase, budgetId);

    let query = supabase
      .from('supplier_quote_items')
      .select(`
        id,
        quote_id,
        preco_unit,
        preco_negociado,
        quantidade,
        conversion_factor,
        match_status,
        matched_material_id,
        materials (id, code, name, unit),
        supplier_quotes!inner (
          id,
          supplier_id,
          supplier_name,
          budget_id,
          user_id,
          session_id,
          suppliers ( name )
        )
      `)
      .eq('supplier_quotes.budget_id', budgetId)
      .eq('supplier_quotes.user_id', userId)
      .in('match_status', ['automatico', 'manual', 'ia_suggested']);

    if (sessionId) {
      query = query.eq('supplier_quotes.session_id', sessionId);
    }

    const { data: rawItems, error } = await query;

    if (error) {
      return { success: false, error: error.message };
    }

    const stockMap = new Map<string, number>();
    if (sessionId) {
      const { data: stockRows } = await supabase
        .from('session_material_stock_inputs')
        .select('material_id, stock_qty')
        .eq('session_id', sessionId)
        .eq('user_id', userId);
      for (const r of stockRows ?? []) {
        stockMap.set(r.material_id, Number(r.stock_qty));
      }
    }

    const excludedMaterialIds = sessionId
      ? await getSessionExcludedMaterialIds(supabase, sessionId, userId)
      : new Set<string>();

    type Offer = {
      quote_item_id: string;
      supplier_name: string;
      supplier_key: string;
      quote_id: string;
      preco_unit: number;
      preco_negociado: number | null;
      conversion_factor: number;
      preco_normalizado: number;
      quantidade_pdf: number;
      match_status: 'automatico' | 'manual' | 'ia_suggested';
    };
    const materialOffers = new Map<string, {
      material: { id: string; code: string; name: string; unit: string };
      required_qty: number;
      offers: Offer[];
    }>();

    for (const row of budgetQtyMap.values()) {
      materialOffers.set(row.id, {
        material: {
          id: row.id,
          code: row.code,
          name: row.name,
          unit: row.unit,
        },
        required_qty: row.required_qty,
        offers: [],
      });
    }

    for (const row of rawItems ?? []) {
      if (
        row.match_status === 'ia_suggested' &&
        !row.matched_material_id
      ) {
        continue;
      }

      const mat = row.materials as unknown as { id: string; code: string; name: string; unit: string } | null;
      const quote = row.supplier_quotes as unknown as {
        id: string;
        supplier_id: string | null;
        supplier_name: string;
        suppliers?: { name: string } | { name: string }[] | null;
      } | null;
      const materialId = mat?.id ?? row.matched_material_id ?? null;
      if (!materialId || !quote) continue;

      const displayName = getSupplierDisplayName(quote);
      const supplierKey = quote.supplier_id ?? displayName;

      const preco_negociado =
        row.preco_negociado != null ? Number(row.preco_negociado) : null;
      const preco_efetivo = effectiveUnitPrice(preco_negociado, Number(row.preco_unit));
      const preco_normalizado = normalizedPrice(preco_efetivo, Number(row.conversion_factor));

      const matchStatus = row.match_status as 'automatico' | 'manual' | 'ia_suggested';
      const offer: Offer = {
        quote_item_id: row.id,
        supplier_name: displayName,
        supplier_key: supplierKey,
        quote_id: row.quote_id,
        preco_unit: Number(row.preco_unit),
        preco_negociado,
        conversion_factor: Number(row.conversion_factor),
        preco_normalizado,
        quantidade_pdf: Number(row.quantidade),
        match_status: matchStatus,
      };

      // PDF nunca expande a lista de compra — só anexa preços a materiais do BOM.
      const existing = materialOffers.get(materialId);
      if (!existing) continue;
      existing.offers.push(offer);
    }

    const scenarioBItems: ScenarioItem[] = [];
    let scenarioBTotal = 0;

    for (const [, entry] of materialOffers) {
      const stock = stockMap.get(entry.material.id) ?? 0;
      const isExcluded = excludedMaterialIds.has(entry.material.id);
      const net_qty = isExcluded ? 0 : Math.max(entry.required_qty - stock, 0);

      const hasOffers = entry.offers.length > 0;
      const best = hasOffers
        ? entry.offers.reduce((a, b) =>
            a.preco_normalizado < b.preco_normalizado ? a : b
          )
        : null;

      const item: ScenarioItem = {
        material_id: entry.material.id,
        material_name: entry.material.name,
        material_code: entry.material.code,
        material_unit: entry.material.unit,
        required_qty: entry.required_qty,
        stock_qty: stock,
        net_qty,
        is_session_excluded: isExcluded,
        best_supplier: best?.supplier_name ?? '',
        best_price_normalized: best?.preco_normalizado ?? 0,
        best_total: (best?.preco_normalizado ?? 0) * net_qty,
        all_offers: entry.offers.map((o) => ({
          quote_item_id: o.quote_item_id,
          quote_id: o.quote_id,
          supplier_name: o.supplier_name,
          preco_unit: o.preco_unit,
          preco_negociado: o.preco_negociado,
          conversion_factor: o.conversion_factor,
          preco_normalizado: o.preco_normalizado,
          total_normalizado: o.preco_normalizado * net_qty,
          quantidade_pdf: o.quantidade_pdf,
          match_status: o.match_status,
        })),
      };

      scenarioBItems.push(item);
      if (!isExcluded && net_qty > 0 && hasOffers) {
        scenarioBTotal += item.best_total;
      }
    }

    // Cenário A — total por fornecedor (using net_qty)
    const supplierTotals = new Map<
      string,
      { quote_id: string; supplier_name: string; total: number; items_covered: number }
    >();

    for (const [, entry] of materialOffers) {
      if (excludedMaterialIds.has(entry.material.id)) continue;
      const stock = stockMap.get(entry.material.id) ?? 0;
      const net_qty = Math.max(entry.required_qty - stock, 0);
      if (net_qty === 0) continue;

      for (const offer of entry.offers) {
        const existing = supplierTotals.get(offer.supplier_key);
        const offerTotal = offer.preco_normalizado * net_qty;
        if (existing) {
          existing.total += offerTotal;
          existing.items_covered += 1;
        } else {
          supplierTotals.set(offer.supplier_key, {
            quote_id: offer.quote_id,
            supplier_name: offer.supplier_name,
            total: offerTotal,
            items_covered: 1,
          });
        }
      }
    }

    const totalItemsWithDemand = scenarioBItems.filter((i) => i.net_qty > 0).length;
    const scenarioA: ScenarioSupplier[] = Array.from(supplierTotals.values())
      .map((data) => ({
        supplier_name: data.supplier_name,
        quote_id: data.quote_id,
        items_covered: data.items_covered,
        total_items: totalItemsWithDemand,
        total_normalizado: data.total,
      }))
      .sort((a, b) => a.total_normalizado - b.total_normalizado);

    const cheapestATotal = scenarioA[0]?.total_normalizado ?? 0;
    const savingVsA = cheapestATotal - scenarioBTotal;

    return {
      success: true,
      data: {
        scenarioA,
        scenarioB: {
          items: scenarioBItems.sort((a, b) => a.material_name.localeCompare(b.material_name, 'pt-BR')),
          total_normalizado: scenarioBTotal,
          saving_vs_cheapest_a: savingVsA,
        },
        budget_total_reference: cheapestATotal,
        budget_consolidated_count: scenarioBItems.length,
        excluded_material_ids: Array.from(excludedMaterialIds),
      },
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro ao calcular cenários.';
    return { success: false, error: message };
  }
}

export async function getConciliationPayloadByQuoteAction(
  quoteId: string
): Promise<
  ActionResult<{
    quote: SupplierQuote;
    items: SupplierQuoteItemWithMaterial[];
    budgetMaterials: BudgetMaterialOption[];
  }>
> {
  const quoteResult = await getQuoteWithItemsAction(quoteId);
  if (!quoteResult.success) {
    return { success: false, error: quoteResult.error };
  }

  const quote = quoteResult.data.quote;
  const mats = quote.budget_id
    ? await getBudgetMaterialsAction(quote.budget_id, quote.session_id)
    : await getCatalogMaterialsAction(quote.session_id);

  if (!mats.success) {
    return { success: false, error: mats.error };
  }

  return {
    success: true,
    data: {
      quote,
      items: quoteResult.data.items,
      budgetMaterials: mats.data.materials,
    },
  };
}

// ---------------------------------------------------------------------------
// validateExtractionAction
// Marca a extração como validada pelo usuário (curadoria humana).
// Opcionalmente persiste um nome customizado (display_name) para o orçamento.
// ---------------------------------------------------------------------------
export interface ValidateExtractionOptions {
  displayName?: string | null;
}

export async function validateExtractionAction(
  quoteId: string,
  options?: ValidateExtractionOptions
): Promise<ActionResult<void>> {
  try {
    const supabase = await createSupabaseServerClient();
    const userId = await requireAuthUserId(supabase);

    // Verifica ownership antes de atualizar
    const { data: existing, error: existingError } = await supabase
      .from('supplier_quotes')
      .select('id, user_id, session_id')
      .eq('id', quoteId)
      .single();

    if (existingError || !existing) {
      console.error('[validateExtractionAction] Cotação não encontrada:', quoteId, existingError?.message);
      return { success: false, error: 'Cotação não encontrada.' };
    }

    if (existing.user_id !== userId) {
      console.error('[validateExtractionAction] Ownership mismatch:', {
        quoteId,
        quoteUserId: existing.user_id,
        requestingUserId: userId,
      });
      return { success: false, error: 'Você não tem permissão para validar esta cotação.' };
    }

    const updates: Record<string, unknown> = {
      extraction_validated_at: new Date().toISOString(),
    };

    // Persiste display_name se fornecido (string vazia → null)
    if (options?.displayName !== undefined) {
      const trimmed = options.displayName?.trim();
      updates.display_name = trimmed || null;
    }

    const { data: updated, error } = await supabase
      .from('supplier_quotes')
      .update(updates)
      .eq('id', quoteId)
      .eq('user_id', userId)
      .select('id')
      .single();

    if (error || !updated) {
      console.error('[validateExtractionAction] Falha ao atualizar:', error?.message);
      return { success: false, error: error?.message ?? 'Falha ao validar extração.' };
    }

    if (existing.session_id) {
      revalidatePath(`/fornecedores/sessao/${existing.session_id}`);
      revalidatePath(`/fornecedores/sessao/${existing.session_id}/conciliacao`);
      revalidatePath(`/fornecedores/sessao/${existing.session_id}/cenarios`);
    }
    revalidatePath('/fornecedores');
    return { success: true, data: undefined };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro ao validar extração.';
    return { success: false, error: message };
  }
}

// ---------------------------------------------------------------------------
// updateExtractionItemAction
// Atualiza campos editáveis de um item extraído (curadoria de extração).
// ---------------------------------------------------------------------------
export interface UpdateExtractionItemInput {
  itemId: string;
  descricao?: string;
  unidade?: string;
  quantidade?: number;
  preco_unit?: number;
  total_item?: number;
}

export async function updateExtractionItemAction(
  input: UpdateExtractionItemInput
): Promise<ActionResult<void>> {
  try {
    const supabase = await createSupabaseServerClient();
    await requireAuthUserId(supabase);

    const updates: Record<string, unknown> = {};
    if (input.descricao !== undefined) updates.descricao = input.descricao;
    if (input.unidade !== undefined) updates.unidade = input.unidade;
    if (input.quantidade !== undefined) updates.quantidade = input.quantidade;
    if (input.preco_unit !== undefined) updates.preco_unit = input.preco_unit;
    if (input.total_item !== undefined) updates.total_item = input.total_item;

    if (Object.keys(updates).length === 0) {
      return { success: true, data: undefined };
    }

    const { error } = await supabase
      .from('supplier_quote_items')
      .update(updates)
      .eq('id', input.itemId);

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, data: undefined };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro ao atualizar item.';
    return { success: false, error: message };
  }
}

// ---------------------------------------------------------------------------
// getConciliationPayloadBySessionAction
// Agrupa itens de TODAS as cotações da sessão por material (fonte da verdade).
// ---------------------------------------------------------------------------
export interface SessionConciliationMaterialRow {
  material_id: string;
  material_name: string;
  material_code: string;
  material_unit: string;
  is_session_excluded?: boolean;
  linked_items: (SupplierQuoteItemWithMaterial & { supplier_name: string; suggestion_id?: string | null })[];
}

/** Resumo por cotação (sessão) para finalizar conciliação e UI. */
export interface SessionConciliationQuoteSummary {
  id: string;
  supplier_name: string;
  status: string;
  item_count: number;
  matched_count: number;
}

export async function getConciliationPayloadBySessionAction(
  sessionId: string
): Promise<ActionResult<{
  materials: SessionConciliationMaterialRow[];
  unlinked_items: (SupplierQuoteItemWithMaterial & { supplier_name: string })[];
  budgetMaterials: BudgetMaterialOption[];
  supplier_column_order: string[];
  quotes_summary: SessionConciliationQuoteSummary[];
  budget_consolidated_count: number;
  excluded_material_ids: string[];
}>> {
  try {
    const supabase = await createSupabaseServerClient();
    const userId = await requireAuthUserId(supabase);

    const { data: sessionRow } = await supabase
      .from('quotation_sessions')
      .select('id, budget_id')
      .eq('id', sessionId)
      .eq('user_id', userId)
      .single();

    if (!sessionRow) {
      return { success: false, error: 'Sessão não encontrada.' };
    }

    const { data: quotes } = await supabase
      .from('supplier_quotes')
      .select('id, supplier_id, supplier_name, status, suppliers ( name )')
      .eq('session_id', sessionId)
      .eq('user_id', userId)
      .order('created_at', { ascending: true });

    type QuoteRow = {
      id: string;
      supplier_id: string | null;
      supplier_name: string;
      status: string;
      suppliers?: { name: string } | { name: string }[] | null;
    };

    const quoteRows = (quotes ?? []) as QuoteRow[];

    // Stable column order: unique suppliers in import order (by supplier_id when set)
    const supplier_column_order: string[] = [];
    const seenSupplierKeys = new Set<string>();
    for (const q of quoteRows) {
      const key = q.supplier_id ?? q.supplier_name;
      const displayName = getSupplierDisplayName(q);
      if (!seenSupplierKeys.has(key)) {
        seenSupplierKeys.add(key);
        supplier_column_order.push(displayName);
      }
    }

    if (!quoteRows.length) {
      const mats = sessionRow.budget_id
        ? await getBudgetMaterialsAction(sessionRow.budget_id, sessionId)
        : await getCatalogMaterialsAction(sessionId);
      return {
        success: true,
        data: {
          materials: [],
          unlinked_items: [],
          budgetMaterials: mats.success ? mats.data.materials : [],
          supplier_column_order: [],
          quotes_summary: [],
          budget_consolidated_count: mats.success ? mats.data.budget_consolidated_count : 0,
          excluded_material_ids: mats.success ? mats.data.excluded_material_ids : [],
        },
      };
    }

    const quoteIds = quoteRows.map((q) => q.id);
    const quoteNameMap = new Map(quoteRows.map((q) => [q.id, getSupplierDisplayName(q)]));

    const { data: rawItems } = await supabase
      .from('supplier_quote_items')
      .select(`
        id, quote_id, descricao, unidade, quantidade, preco_unit, total_item,
        ipi_percent, st_incluso, alerta, matched_material_id, conversion_factor,
        match_status, match_level, match_confidence, match_method, created_at,
        materials (code, name, unit),
        semantic_match_suggestions (id, rationale, status, suggested_material_id, suggested_conversion_factor)
      `)
      .in('quote_id', quoteIds)
      .order('created_at', { ascending: true });

    const mats = sessionRow.budget_id
      ? await getBudgetMaterialsAction(sessionRow.budget_id, sessionId)
      : await getCatalogMaterialsAction(sessionId);

    const budgetMaterials = mats.success ? mats.data.materials : [];
    const budget_consolidated_count = mats.success ? mats.data.budget_consolidated_count : 0;
    const excluded_material_ids = mats.success ? mats.data.excluded_material_ids : [];
    const excludedMaterialIds = new Set(excluded_material_ids);
    const materialMap = new Map<string, SessionConciliationMaterialRow>();
    const unlinked: (SupplierQuoteItemWithMaterial & { supplier_name: string })[] = [];

    for (const bm of budgetMaterials) {
      materialMap.set(bm.id, {
        material_id: bm.id,
        material_name: bm.name,
        material_code: bm.code,
        material_unit: bm.unit,
        is_session_excluded: excludedMaterialIds.has(bm.id),
        linked_items: [],
      });
    }

    for (const row of rawItems ?? []) {
      const materialRow = Array.isArray(row.materials) ? row.materials[0] : row.materials;
      const suggestions = (row.semantic_match_suggestions ?? []) as {
        id: string; rationale?: string; status: string;
        suggested_material_id?: string; suggested_conversion_factor?: number;
      }[];
      const suggestion = suggestions.find((s) => s.status === 'suggested') ?? suggestions[0];
      const rejectedSuggestion = suggestions.find((s) => s.status === 'rejected');

      const item: SupplierQuoteItemWithMaterial & { supplier_name: string; suggestion_id?: string | null } = {
        id: row.id,
        quote_id: row.quote_id,
        descricao: row.descricao,
        unidade: row.unidade,
        quantidade: row.quantidade,
        preco_unit: row.preco_unit,
        total_item: row.total_item,
        ipi_percent: row.ipi_percent,
        st_incluso: row.st_incluso,
        alerta: row.alerta,
        matched_material_id: row.matched_material_id ?? null,
        conversion_factor: row.conversion_factor,
        match_status: row.match_status,
        match_level: row.match_level ?? null,
        match_confidence: row.match_confidence ?? null,
        match_method: (row.match_method as SupplierMatchMethod) ?? null,
        created_at: row.created_at,
        material_name: materialRow?.name ?? null,
        material_code: materialRow?.code ?? null,
        material_unit: materialRow?.unit ?? null,
        suggestion_rationale: suggestion?.rationale ?? null,
        supplier_name: quoteNameMap.get(row.quote_id) ?? '',
        suggestion_id: suggestion?.id ?? null,
      };

      if (row.matched_material_id && materialMap.has(row.matched_material_id)) {
        materialMap.get(row.matched_material_id)!.linked_items.push(item);
      } else if (row.matched_material_id) {
        unlinked.push(item);
      } else if (
        rejectedSuggestion?.suggested_material_id &&
        materialMap.has(rejectedSuggestion.suggested_material_id)
      ) {
        materialMap.get(rejectedSuggestion.suggested_material_id)!.linked_items.push(item);
      } else {
        unlinked.push(item);
      }
    }

    const quoteStats = new Map<string, { total: number; matched: number }>();
    for (const q of quoteRows) {
      quoteStats.set(q.id, { total: 0, matched: 0 });
    }
    for (const row of rawItems ?? []) {
      const st = quoteStats.get(row.quote_id);
      if (!st) continue;
      st.total += 1;
      if (row.match_status === 'automatico' || row.match_status === 'manual') {
        st.matched += 1;
      }
    }

    const quotes_summary: SessionConciliationQuoteSummary[] = quoteRows.map((q) => {
      const st = quoteStats.get(q.id) ?? { total: 0, matched: 0 };
      return {
        id: q.id,
        supplier_name: getSupplierDisplayName(q),
        status: q.status,
        item_count: st.total,
        matched_count: st.matched,
      };
    });

    return {
      success: true,
      data: {
        materials: Array.from(materialMap.values()),
        unlinked_items: unlinked,
        budgetMaterials,
        supplier_column_order,
        quotes_summary,
        budget_consolidated_count,
        excluded_material_ids,
      },
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro ao carregar conciliação da sessão.';
    return { success: false, error: message };
  }
}

// ---------------------------------------------------------------------------
// getSessionStockInputsAction
// Busca estoque manual informado pelo usuário para uma sessão.
// ---------------------------------------------------------------------------
export interface SessionStockInput {
  material_id: string;
  stock_qty: number;
}

export async function getSessionStockInputsAction(
  sessionId: string
): Promise<ActionResult<SessionStockInput[]>> {
  try {
    const supabase = await createSupabaseServerClient();
    const userId = await requireAuthUserId(supabase);

    const { data, error } = await supabase
      .from('session_material_stock_inputs')
      .select('material_id, stock_qty')
      .eq('session_id', sessionId)
      .eq('user_id', userId);

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, data: (data ?? []).map((r) => ({ material_id: r.material_id, stock_qty: Number(r.stock_qty) })) };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro ao buscar estoque manual.';
    return { success: false, error: message };
  }
}

// ---------------------------------------------------------------------------
// saveSessionStockInputsAction
// Salva/atualiza estoque manual em lote (upsert por session + material + user).
// ---------------------------------------------------------------------------
export async function saveSessionStockInputsAction(
  sessionId: string,
  inputs: { material_id: string; stock_qty: number }[]
): Promise<ActionResult<void>> {
  try {
    const supabase = await createSupabaseServerClient();
    const userId = await requireAuthUserId(supabase);

    if (inputs.length === 0) {
      return { success: true, data: undefined };
    }

    const rows = inputs.map((i) => ({
      session_id: sessionId,
      material_id: i.material_id,
      user_id: userId,
      stock_qty: Math.max(0, i.stock_qty),
    }));

    const { error } = await supabase
      .from('session_material_stock_inputs')
      .upsert(rows, { onConflict: 'session_id,material_id,user_id' });

    if (error) {
      return { success: false, error: error.message };
    }

    revalidatePath(`/fornecedores/sessao/${sessionId}/cenarios`);
    return { success: true, data: undefined };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro ao salvar estoque manual.';
    return { success: false, error: message };
  }
}

// ---------------------------------------------------------------------------
// updateNegotiatedPriceAction — persiste preco_negociado (preco_unit do PDF intacto)
// ---------------------------------------------------------------------------
export async function updateNegotiatedPriceAction(
  sessionId: string,
  quoteItemId: string,
  precoNegociado: number | null
): Promise<ActionResult<void>> {
  try {
    const supabase = await createSupabaseServerClient();
    const userId = await requireAuthUserId(supabase);

    if (precoNegociado !== null && precoNegociado <= 0) {
      return { success: false, error: 'O preço negociado deve ser maior que zero.' };
    }

    const { data: item, error: fetchError } = await supabase
      .from('supplier_quote_items')
      .select(`
        id,
        supplier_quotes!inner (id, user_id, session_id)
      `)
      .eq('id', quoteItemId)
      .single();

    if (fetchError || !item) {
      return { success: false, error: 'Item da cotação não encontrado.' };
    }

    const quote = item.supplier_quotes as unknown as {
      id: string;
      user_id: string;
      session_id: string | null;
    };

    if (quote.user_id !== userId) {
      return { success: false, error: 'Sem permissão para alterar este item.' };
    }

    if (quote.session_id !== sessionId) {
      return { success: false, error: 'Item não pertence a esta sessão.' };
    }

    const { error: updateError } = await supabase
      .from('supplier_quote_items')
      .update({ preco_negociado: precoNegociado })
      .eq('id', quoteItemId);

    if (updateError) {
      return { success: false, error: updateError.message };
    }

    revalidatePath(`/fornecedores/sessao/${sessionId}/cenarios`);
    return { success: true, data: undefined };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro ao salvar preço negociado.';
    return { success: false, error: message };
  }
}

// ---------------------------------------------------------------------------
// saveManualSessionQuoteItemAction — cotação manual por material/fornecedor
// ---------------------------------------------------------------------------
export async function saveManualSessionQuoteItemAction(input: {
  sessionId: string;
  budgetId: string;
  materialId: string;
  supplierId: string;
  unitPrice: number;
}): Promise<ActionResult<{ quoteId: string; quoteItemId: string }>> {
  try {
    const supabase = await createSupabaseServerClient();
    const userId = await requireAuthUserId(supabase);

    const result = await saveManualSessionQuoteItem(supabase, {
      sessionId: input.sessionId,
      budgetId: input.budgetId,
      materialId: input.materialId,
      supplierId: input.supplierId,
      unitPrice: input.unitPrice,
      userId,
    });

    if ('error' in result) {
      return { success: false, error: result.error };
    }

    revalidatePath(`/fornecedores/sessao/${input.sessionId}`);
    revalidatePath(`/fornecedores/sessao/${input.sessionId}/cenarios`);
    revalidatePath(`/fornecedores/sessao/${input.sessionId}/conciliacao`);

    return { success: true, data: result };
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : 'Erro ao salvar cotação manual.';
    return { success: false, error: message };
  }
}

// ---------------------------------------------------------------------------
// Cenário Ideal — seleções manuais por material
// ---------------------------------------------------------------------------
export async function getIdealSelectionsAction(
  sessionId: string
): Promise<ActionResult<IdealSelectionRow[]>> {
  try {
    const supabase = await createSupabaseServerClient();
    const userId = await requireAuthUserId(supabase);

    const { data, error } = await supabase
      .from('scenario_ideal_selections')
      .select('material_id, quote_id')
      .eq('session_id', sessionId)
      .eq('user_id', userId);

    if (error) {
      return { success: false, error: error.message };
    }

    return {
      success: true,
      data: (data ?? []).map((r) => ({
        material_id: r.material_id,
        quote_id: r.quote_id,
      })),
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro ao buscar seleções do cenário ideal.';
    return { success: false, error: message };
  }
}

export async function saveIdealSelectionAction(
  sessionId: string,
  materialId: string,
  quoteId: string
): Promise<ActionResult<void>> {
  try {
    const supabase = await createSupabaseServerClient();
    const userId = await requireAuthUserId(supabase);

    const { data: quote, error: quoteError } = await supabase
      .from('supplier_quotes')
      .select('id, session_id, user_id')
      .eq('id', quoteId)
      .eq('user_id', userId)
      .single();

    if (quoteError || !quote) {
      return { success: false, error: 'Cotação não encontrada.' };
    }

    if (quote.session_id !== sessionId) {
      return { success: false, error: 'Cotação não pertence a esta sessão.' };
    }

    const { error } = await supabase.from('scenario_ideal_selections').upsert(
      {
        session_id: sessionId,
        material_id: materialId,
        quote_id: quoteId,
        user_id: userId,
      },
      { onConflict: 'session_id,material_id,user_id' }
    );

    if (error) {
      return { success: false, error: error.message };
    }

    revalidatePath(`/fornecedores/sessao/${sessionId}/cenarios`);
    return { success: true, data: undefined };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro ao salvar seleção do cenário ideal.';
    return { success: false, error: message };
  }
}

export async function bulkSaveIdealSelectionsAction(
  sessionId: string,
  rows: IdealSelectionRow[]
): Promise<ActionResult<{ saved: number }>> {
  try {
    if (rows.length === 0) {
      return { success: true, data: { saved: 0 } };
    }

    const supabase = await createSupabaseServerClient();
    const userId = await requireAuthUserId(supabase);

    const quoteIds = [...new Set(rows.map((r) => r.quote_id))];
    const { data: quotes, error: quotesError } = await supabase
      .from('supplier_quotes')
      .select('id, session_id')
      .eq('user_id', userId)
      .in('id', quoteIds);

    if (quotesError) {
      return { success: false, error: quotesError.message };
    }

    const quoteById = new Map((quotes ?? []).map((q) => [q.id, q]));
    for (const row of rows) {
      const quote = quoteById.get(row.quote_id);
      if (!quote) {
        return { success: false, error: 'Uma ou mais cotações não foram encontradas.' };
      }
      if (quote.session_id !== sessionId) {
        return { success: false, error: 'Cotação não pertence a esta sessão.' };
      }
    }

    const payload = rows.map((row) => ({
      session_id: sessionId,
      material_id: row.material_id,
      quote_id: row.quote_id,
      user_id: userId,
    }));

    const { error } = await supabase.from('scenario_ideal_selections').upsert(payload, {
      onConflict: 'session_id,material_id,user_id',
    });

    if (error) {
      return { success: false, error: error.message };
    }

    revalidatePath(`/fornecedores/sessao/${sessionId}/cenarios`);
    return { success: true, data: { saved: rows.length } };
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : 'Erro ao validar seleções do cenário ideal em lote.';
    return { success: false, error: message };
  }
}

// ---------------------------------------------------------------------------
// createQuoteAndDispatchExtractAction
// Novo fluxo assíncrono: cria supplier_quote (status='processando_ia') e
// dispara a Edge Function extract-supplier-pdf em fire-and-forget.
// ---------------------------------------------------------------------------
export interface CreateQuoteAndDispatchInput {
  session_id: string;
  supplier_id: string;
  pdf_path: string;
  supplier_name: string;
}

export async function createQuoteAndDispatchExtractAction(
  input: CreateQuoteAndDispatchInput
): Promise<ActionResult<{ quoteId: string }>> {
  try {
    const supabase = await createSupabaseServerClient();
    const userId = await requireAuthUserId(supabase);

    const sessionId = input.session_id?.trim();
    const supplierId = input.supplier_id?.trim();
    const pdfPath = input.pdf_path?.trim();

    if (!sessionId || !supplierId || !pdfPath) {
      return { success: false, error: 'Sessão, fornecedor e caminho do PDF são obrigatórios.' };
    }

    const expectedPrefix = `${userId}/${sessionId}/`;
    if (!pdfPath.startsWith(expectedPrefix)) {
      return { success: false, error: 'Caminho do PDF inválido para esta sessão.' };
    }

    // Busca sessão para obter budget_id e validar status
    const { data: session, error: sessionError } = await supabase
      .from('quotation_sessions')
      .select('id, status, budget_id')
      .eq('id', sessionId)
      .eq('user_id', userId)
      .single();

    if (sessionError || !session) {
      return { success: false, error: 'Sessão não encontrada.' };
    }

    if (session.status === 'completed') {
      return { success: false, error: 'Esta sessão está encerrada; não é possível importar novos PDFs.' };
    }

    // Valida limite de cotações por sessão
    const { count: quoteCount } = await supabase
      .from('supplier_quotes')
      .select('id', { count: 'exact', head: true })
      .eq('session_id', sessionId)
      .eq('user_id', userId);

    if ((quoteCount ?? 0) >= MAX_PDFS_PER_QUOTATION) {
      return { success: false, error: `Esta cotação já atingiu o limite de ${MAX_PDFS_PER_QUOTATION} PDFs.` };
    }

    const resolved = await resolveSupplierForQuote(supabase, userId, supplierId);
    if ('error' in resolved) {
      return { success: false, error: resolved.error };
    }

    // INSERT supplier_quotes com status='processando_ia'
    const { data: quote, error: quoteError } = await supabase
      .from('supplier_quotes')
      .insert({
        session_id: sessionId,
        budget_id: session.budget_id ?? null,
        supplier_id: resolved.id,
        supplier_name: input.supplier_name || resolved.name,
        pdf_path: pdfPath,
        status: 'processando_ia',
        user_id: userId,
      })
      .select('id')
      .single();

    if (quoteError || !quote) {
      return { success: false, error: quoteError?.message ?? 'Erro ao criar cotação.' };
    }

    console.log('[supplierQuotes] Quote criada (async):', quote.id, '→ disparando Edge');

    // after() mantém a função serverless viva após o retorno, garantindo que o fetch complete
    after(async () => {
      await dispatchExtractToEdge(quote.id, pdfPath).catch((err) => {
        console.error('[supplierQuotes] Falha ao disparar Edge para quote:', quote.id, err);
      });
    });

    return { success: true, data: { quoteId: quote.id } };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro inesperado ao criar cotação.';
    return { success: false, error: message };
  }
}

// =============================================================================
// Conciliação assíncrona: dispara a Edge Function match-supplier-quote
// =============================================================================

export async function processarConciliacaoAction(quoteId: string): Promise<ActionResult<void>> {
  try {
    const supabase = await createSupabaseServerClient();
    const userId = await requireAuthUserId(supabase);

    const quoteIdTrimmed = quoteId?.trim();
    if (!quoteIdTrimmed) {
      return { success: false, error: 'quote_id é obrigatório.' };
    }

    // Valida propriedade e status atual
    const { data: quote, error: quoteError } = await supabase
      .from('supplier_quotes')
      .select('id, status, session_id')
      .eq('id', quoteIdTrimmed)
      .eq('user_id', userId)
      .single();

    if (quoteError || !quote) {
      return { success: false, error: 'Cotação não encontrada.' };
    }

    if (quote.status !== 'pendente_conciliacao') {
      return { success: false, error: `Operação inválida: status atual é '${quote.status}'.` };
    }

    // Sinaliza que a Edge está processando (habilita feedback em tempo real)
    const { error: updateError } = await supabase
      .from('supplier_quotes')
      .update({ status: 'conciliando' })
      .eq('id', quoteIdTrimmed);

    if (updateError) {
      return { success: false, error: updateError.message };
    }

    // Fire-and-forget: mantém a função serverless viva após o retorno via after()
    after(async () => {
      await dispatchMatchToEdge(quoteIdTrimmed).catch((err) => {
        console.error('[processarConciliacaoAction] Falha ao disparar match Edge:', quoteIdTrimmed, err);
      });
    });

    revalidatePath('/fornecedores/sessao/[sessionId]', 'page');
    return { success: true, data: undefined };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro inesperado ao iniciar conciliação.';
    return { success: false, error: message };
  }
}

async function dispatchMatchToEdge(quoteId: string): Promise<void> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, '');
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const geminiKey = process.env.GEMINI_API_KEY?.trim();

  if (!supabaseUrl || !serviceRoleKey) {
    console.error('[dispatchMatchToEdge] Variáveis de ambiente Supabase não configuradas');
    return;
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${serviceRoleKey}`,
  };

  if (geminiKey) {
    headers['x-orcarede-gemini-pass'] = geminiKey;
  }

  const res = await fetch(`${supabaseUrl}/functions/v1/match-supplier-quote`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ quote_id: quoteId }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    console.warn('[dispatchMatchToEdge] Edge respondeu erro:', res.status, body.slice(0, 200));
  } else {
    console.log('[dispatchMatchToEdge] sucesso:', quoteId);
  }
}

// =============================================================================

async function dispatchExtractToEdge(quoteId: string, pdfPath: string): Promise<void> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, '');
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const geminiKey = process.env.GEMINI_API_KEY?.trim();

  if (!supabaseUrl || !serviceRoleKey) {
    console.error('[dispatchExtractToEdge] Variáveis de ambiente Supabase não configuradas');
    return;
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${serviceRoleKey}`,
  };

  if (geminiKey) {
    headers['x-orcarede-gemini-pass'] = geminiKey;
  }

  const res = await fetch(`${supabaseUrl}/functions/v1/extract-supplier-pdf`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ quote_id: quoteId, pdf_path: pdfPath }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    console.warn('[dispatchExtractToEdge] Edge respondeu erro:', res.status, body.slice(0, 200));
  } else {
    console.log('[dispatchExtractToEdge] sucesso:', quoteId);
  }
}

export async function removeIdealSelectionAction(
  sessionId: string,
  materialId: string
): Promise<ActionResult<void>> {
  try {
    const supabase = await createSupabaseServerClient();
    const userId = await requireAuthUserId(supabase);

    const { error } = await supabase
      .from('scenario_ideal_selections')
      .delete()
      .eq('session_id', sessionId)
      .eq('material_id', materialId)
      .eq('user_id', userId);

    if (error) {
      return { success: false, error: error.message };
    }

    revalidatePath(`/fornecedores/sessao/${sessionId}/cenarios`);
    return { success: true, data: undefined };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro ao remover seleção do cenário ideal.';
    return { success: false, error: message };
  }
}

export async function closeIdealScenarioAndUpdateMaterialsAction(
  sessionId: string
): Promise<
  ActionResult<{
    updated: number;
    skippedPending: number;
    suggestedApplied: number;
  }>
> {
  try {
    const supabase = await createSupabaseServerClient();
    const userId = await requireAuthUserId(supabase);

    const { data: session, error: sessionError } = await supabase
      .from('quotation_sessions')
      .select('id, budget_id')
      .eq('id', sessionId)
      .eq('user_id', userId)
      .single();

    if (sessionError || !session) {
      return { success: false, error: 'Sessão não encontrada.' };
    }

    if (!session.budget_id) {
      return { success: false, error: 'Sessão sem orçamento vinculado.' };
    }

    const [scenariosRes, selectionsRes] = await Promise.all([
      calculateScenariosAction(session.budget_id, sessionId),
      getIdealSelectionsAction(sessionId),
    ]);

    if (!scenariosRes.success) {
      return { success: false, error: scenariosRes.error };
    }

    if (!selectionsRes.success) {
      return { success: false, error: selectionsRes.error };
    }

    const hasPurchaseDemand = scenariosRes.data.scenarioB.items.some((item) => item.net_qty > 0);
    if (!hasPurchaseDemand) {
      return {
        success: false,
        error: 'Nenhum material com necessidade de compra para atualizar.',
      };
    }

    const result = await applyIdealScenarioPricesToMaterials({
      supabase,
      userId,
      sessionId,
      budgetId: session.budget_id,
      scenarios: scenariosRes.data,
      selections: selectionsRes.data,
    });

    revalidatePath('/');
    revalidatePath('/fornecedores');
    revalidatePath(`/fornecedores/sessao/${sessionId}`);
    revalidatePath(`/fornecedores/sessao/${sessionId}/cenarios`);

    return { success: true, data: result };
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : 'Erro ao atualizar materiais pelo cenário ideal.';
    return { success: false, error: message };
  }
}
