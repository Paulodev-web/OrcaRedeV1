'use server';

import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient, requireAuthUserId } from '@/lib/supabaseServer';
import { autoMatchQuoteItems } from '@/services/suppliers/autoMatchQuoteItems';
import type { SupplierExtractItem } from '@/types/supplierExtract';
import type { SupplierQuote, SupplierQuoteItem, SupplierMatchMethod } from '@/types';

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
  supplier_name: string;
  pdf_path: string;
  observacoes_gerais: string;
  items: SupplierExtractItem[];
}

export async function createSupplierQuoteAction(
  input: CreateQuoteInput
): Promise<ActionResult<{ quoteId: string }>> {
  try {
    const supabase = await createSupabaseServerClient();
    const userId = await requireAuthUserId(supabase);

    // 1. Cria o registro da cotação
    const { data: quote, error: quoteError } = await supabase
      .from('supplier_quotes')
      .insert({
        budget_id: input.budget_id,
        session_id: input.session_id ?? null,
        supplier_name: input.supplier_name.trim(),
        pdf_path: input.pdf_path,
        observacoes_gerais: input.observacoes_gerais || null,
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

    const { data: quote, error: quoteError } = await supabase
      .from('supplier_quotes')
      .select('id, budget_id, session_id, supplier_name, pdf_path, status, observacoes_gerais, extraction_validated_at, user_id, created_at, updated_at')
      .eq('id', quoteId)
      .eq('user_id', userId)
      .single();

    if (quoteError || !quote) {
      return { success: false, error: 'Cotação não encontrada.' };
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
  budgetId: string
): Promise<ActionResult<{ materials: BudgetMaterialOption[] }>> {
  try {
    const supabase = await createSupabaseServerClient();
    await requireAuthUserId(supabase);

    // Materiais via grupos de itens
    const { data: groupMaterials, error: gmError } = await supabase
      .from('post_item_group_materials')
      .select(`
        materials (id, code, name, unit),
        post_item_groups!inner (
          budget_posts!inner (budget_id)
        )
      `)
      .eq('post_item_groups.budget_posts.budget_id', budgetId);

    // Materiais avulsos (post_materials)
    const { data: looseMaterials, error: lmError } = await supabase
      .from('post_materials')
      .select(`
        materials (id, code, name, unit),
        budget_posts!inner (budget_id)
      `)
      .eq('budget_posts.budget_id', budgetId);

    if (gmError || lmError) {
      const errMsg = gmError?.message ?? lmError?.message ?? 'Erro ao buscar materiais.';
      return { success: false, error: errMsg };
    }

    // Deduplica por material id
    const seen = new Set<string>();
    const materials: BudgetMaterialOption[] = [];

    for (const row of [...(groupMaterials ?? []), ...(looseMaterials ?? [])]) {
      const mat = row.materials as unknown as { id: string; code: string; name: string; unit: string } | null;
      if (mat && !seen.has(mat.id)) {
        seen.add(mat.id);
        materials.push({ id: mat.id, code: mat.code, name: mat.name, unit: mat.unit });
      }
    }

    materials.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));

    return { success: true, data: { materials } };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro ao buscar materiais do orçamento.';
    return { success: false, error: message };
  }
}

// ---------------------------------------------------------------------------
// getCatalogMaterialsAction
// Catálogo global do usuário (sessão sem orçamento).
// ---------------------------------------------------------------------------
export async function getCatalogMaterialsAction(): Promise<
  ActionResult<{ materials: BudgetMaterialOption[] }>
> {
  try {
    const supabase = await createSupabaseServerClient();
    const userId = await requireAuthUserId(supabase);

    const { data, error } = await supabase
      .from('materials')
      .select('id, code, name, unit')
      .eq('user_id', userId)
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

    return { success: true, data: { materials } };
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
      revalidatePath(`/fornecedores/sessao/${quoteRow.session_id}/cenarios`);
    }
    revalidatePath('/fornecedores');
    return { success: true, data: undefined };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro ao concluir conciliação.';
    return { success: false, error: message };
  }
}

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

    let query = supabase
      .from('supplier_quotes')
      .select(`
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
      `)
      .eq('budget_id', budgetId)
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (sessionId) {
      query = query.eq('session_id', sessionId);
    }

    const { data: quotes, error } = await query;

    if (error) {
      return { success: false, error: error.message };
    }

    const result = (quotes ?? []).map((q) => {
      const allItems = (q.supplier_quote_items ?? []) as { match_status: string }[];
      return {
        id: q.id,
        budget_id: q.budget_id,
        supplier_name: q.supplier_name,
        pdf_path: q.pdf_path,
        status: q.status,
        observacoes_gerais: q.observacoes_gerais,
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
// ---------------------------------------------------------------------------
export interface ScenarioItem {
  material_id: string;
  material_name: string;
  material_code: string;
  quantidade: number;
  best_supplier: string;
  best_price_normalized: number;
  best_total: number;
  all_offers: {
    supplier_name: string;
    preco_unit: number;
    conversion_factor: number;
    preco_normalizado: number;
    total_normalizado: number;
  }[];
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
}

export async function calculateScenariosAction(
  budgetId: string,
  sessionId?: string
): Promise<ActionResult<ScenariosResult>> {
  try {
    const supabase = await createSupabaseServerClient();
    const userId = await requireAuthUserId(supabase);

    // Busca todos os itens com match de todas as cotações do orçamento
    let query = supabase
      .from('supplier_quote_items')
      .select(`
        id,
        quote_id,
        preco_unit,
        quantidade,
        conversion_factor,
        match_status,
        matched_material_id,
        materials (id, code, name, unit),
        supplier_quotes!inner (
          id,
          supplier_name,
          budget_id,
          user_id
        )
      `)
      .eq('supplier_quotes.budget_id', budgetId)
      .eq('supplier_quotes.user_id', userId)
      .in('match_status', ['automatico', 'manual']);

    if (sessionId) {
      query = query.eq('supplier_quotes.session_id', sessionId);
    }

    const { data: rawItems, error } = await query;

    if (error) {
      return { success: false, error: error.message };
    }

    if (!rawItems || rawItems.length === 0) {
      return {
        success: true,
        data: {
          scenarioA: [],
          scenarioB: { items: [], total_normalizado: 0, saving_vs_cheapest_a: 0 },
          budget_total_reference: 0,
        },
      };
    }

    // Agrupa ofertas por material_id
    type Offer = {
      supplier_name: string;
      quote_id: string;
      preco_unit: number;
      conversion_factor: number;
      preco_normalizado: number;
      total_normalizado: number;
      quantidade: number;
    };
    const materialOffers = new Map<string, { material: { id: string; code: string; name: string }; quantidade: number; offers: Offer[] }>();

    for (const row of rawItems) {
      const mat = row.materials as unknown as { id: string; code: string; name: string; unit: string } | null;
      const quote = row.supplier_quotes as unknown as { id: string; supplier_name: string } | null;
      if (!mat || !quote) continue;

      const preco_normalizado = row.conversion_factor > 0
        ? row.preco_unit / row.conversion_factor
        : row.preco_unit;

      const existing = materialOffers.get(mat.id);
      const offer: Offer = {
        supplier_name: quote.supplier_name,
        quote_id: row.quote_id,
        preco_unit: row.preco_unit,
        conversion_factor: row.conversion_factor,
        preco_normalizado,
        total_normalizado: preco_normalizado * row.quantidade,
        quantidade: row.quantidade,
      };

      if (existing) {
        existing.offers.push(offer);
      } else {
        materialOffers.set(mat.id, {
          material: mat,
          quantidade: row.quantidade,
          offers: [offer],
        });
      }
    }

    // Cenário B — melhor preço por item
    const scenarioBItems: ScenarioItem[] = [];
    let scenarioBTotal = 0;

    for (const [, entry] of materialOffers) {
      const best = entry.offers.reduce((a, b) =>
        a.preco_normalizado < b.preco_normalizado ? a : b
      );

      const item: ScenarioItem = {
        material_id: entry.material.id,
        material_name: entry.material.name,
        material_code: entry.material.code,
        quantidade: entry.quantidade,
        best_supplier: best.supplier_name,
        best_price_normalized: best.preco_normalizado,
        best_total: best.total_normalizado,
        all_offers: entry.offers.map((o) => ({
          supplier_name: o.supplier_name,
          preco_unit: o.preco_unit,
          conversion_factor: o.conversion_factor,
          preco_normalizado: o.preco_normalizado,
          total_normalizado: o.total_normalizado,
        })),
      };

      scenarioBItems.push(item);
      scenarioBTotal += best.total_normalizado;
    }

    // Cenário A — total por fornecedor
    const supplierTotals = new Map<string, { quote_id: string; total: number; items_covered: number }>();
    for (const row of rawItems) {
      const quote = row.supplier_quotes as unknown as { id: string; supplier_name: string } | null;
      if (!quote) continue;
      const preco_normalizado = row.conversion_factor > 0
        ? row.preco_unit / row.conversion_factor
        : row.preco_unit;
      const existing = supplierTotals.get(quote.supplier_name);
      if (existing) {
        existing.total += preco_normalizado * row.quantidade;
        existing.items_covered += 1;
      } else {
        supplierTotals.set(quote.supplier_name, {
          quote_id: row.quote_id,
          total: preco_normalizado * row.quantidade,
          items_covered: 1,
        });
      }
    }

    const totalItems = materialOffers.size;
    const scenarioA: ScenarioSupplier[] = Array.from(supplierTotals.entries())
      .map(([supplier_name, data]) => ({
        supplier_name,
        quote_id: data.quote_id,
        items_covered: data.items_covered,
        total_items: totalItems,
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
    ? await getBudgetMaterialsAction(quote.budget_id)
    : await getCatalogMaterialsAction();

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
// ---------------------------------------------------------------------------
export async function validateExtractionAction(
  quoteId: string
): Promise<ActionResult<void>> {
  try {
    const supabase = await createSupabaseServerClient();
    const userId = await requireAuthUserId(supabase);

    const { error } = await supabase
      .from('supplier_quotes')
      .update({ extraction_validated_at: new Date().toISOString() })
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
  linked_items: (SupplierQuoteItemWithMaterial & { supplier_name: string; suggestion_id?: string | null })[];
}

export async function getConciliationPayloadBySessionAction(
  sessionId: string
): Promise<ActionResult<{
  materials: SessionConciliationMaterialRow[];
  unlinked_items: (SupplierQuoteItemWithMaterial & { supplier_name: string })[];
  budgetMaterials: BudgetMaterialOption[];
  supplier_column_order: string[];
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
      .select('id, supplier_name')
      .eq('session_id', sessionId)
      .eq('user_id', userId)
      .order('created_at', { ascending: true });

    // Stable column order: unique supplier names in import order
    const supplier_column_order: string[] = [];
    const seenSuppliers = new Set<string>();
    for (const q of quotes ?? []) {
      if (!seenSuppliers.has(q.supplier_name)) {
        seenSuppliers.add(q.supplier_name);
        supplier_column_order.push(q.supplier_name);
      }
    }

    if (!quotes || quotes.length === 0) {
      const mats = sessionRow.budget_id
        ? await getBudgetMaterialsAction(sessionRow.budget_id)
        : await getCatalogMaterialsAction();
      return {
        success: true,
        data: {
          materials: [],
          unlinked_items: [],
          budgetMaterials: mats.success ? mats.data.materials : [],
          supplier_column_order: [],
        },
      };
    }

    const quoteIds = quotes.map((q) => q.id);
    const quoteNameMap = new Map(quotes.map((q) => [q.id, q.supplier_name]));

    const { data: rawItems } = await supabase
      .from('supplier_quote_items')
      .select(`
        id, quote_id, descricao, unidade, quantidade, preco_unit, total_item,
        ipi_percent, st_incluso, alerta, matched_material_id, conversion_factor,
        match_status, match_level, match_confidence, match_method, created_at,
        materials (code, name, unit),
        semantic_match_suggestions (id, rationale, status)
      `)
      .in('quote_id', quoteIds)
      .order('created_at', { ascending: true });

    const mats = sessionRow.budget_id
      ? await getBudgetMaterialsAction(sessionRow.budget_id)
      : await getCatalogMaterialsAction();

    const budgetMaterials = mats.success ? mats.data.materials : [];
    const materialMap = new Map<string, SessionConciliationMaterialRow>();
    const unlinked: (SupplierQuoteItemWithMaterial & { supplier_name: string })[] = [];

    for (const bm of budgetMaterials) {
      materialMap.set(bm.id, {
        material_id: bm.id,
        material_name: bm.name,
        material_code: bm.code,
        material_unit: bm.unit,
        linked_items: [],
      });
    }

    for (const row of rawItems ?? []) {
      const materialRow = Array.isArray(row.materials) ? row.materials[0] : row.materials;
      const suggestions = (row.semantic_match_suggestions ?? []) as { id: string; rationale?: string; status: string }[];
      const suggestion = suggestions.find((s) => s.status === 'suggested') ?? suggestions[0];

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
        const matEntry: SessionConciliationMaterialRow = {
          material_id: row.matched_material_id,
          material_name: materialRow?.name ?? '(material desconhecido)',
          material_code: materialRow?.code ?? '',
          material_unit: materialRow?.unit ?? '',
          linked_items: [item],
        };
        materialMap.set(row.matched_material_id, matEntry);
      } else {
        unlinked.push(item);
      }
    }

    return {
      success: true,
      data: {
        materials: Array.from(materialMap.values()),
        unlinked_items: unlinked,
        budgetMaterials,
        supplier_column_order,
      },
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro ao carregar conciliação da sessão.';
    return { success: false, error: message };
  }
}
