import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { resolveSupplierForQuote } from '@/services/suppliers/resolveSupplierForQuote';
import {
  assertMaterialInBudgetScope,
  loadBudgetMaterialQuantities,
} from '@/services/supplies/budgetMaterialQuantities';

export const MANUAL_QUOTE_PDF_PATH = 'manual://cotacao';

export interface SaveManualSessionQuoteItemParams {
  sessionId: string;
  budgetId: string;
  materialId: string;
  supplierId: string;
  unitPrice: number;
  userId: string;
}

export interface SaveManualSessionQuoteItemResult {
  quoteId: string;
  quoteItemId: string;
}

export async function saveManualSessionQuoteItem(
  supabase: SupabaseClient,
  params: SaveManualSessionQuoteItemParams
): Promise<SaveManualSessionQuoteItemResult | { error: string }> {
  const { sessionId, budgetId, materialId, supplierId, unitPrice, userId } = params;

  if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
    return { error: 'Informe um preço unitário maior que zero.' };
  }

  const scope = await assertMaterialInBudgetScope(supabase, budgetId, materialId);
  if (!scope.ok) {
    return { error: scope.error };
  }

  const resolved = await resolveSupplierForQuote(supabase, userId, supplierId.trim());
  if ('error' in resolved) {
    return { error: resolved.error };
  }

  const budgetQtyMap = await loadBudgetMaterialQuantities(supabase, budgetId);
  const material = budgetQtyMap.get(materialId);
  if (!material) {
    return { error: 'Material não encontrado no orçamento.' };
  }

  const { data: session, error: sessionError } = await supabase
    .from('quotation_sessions')
    .select('id, budget_id')
    .eq('id', sessionId)
    .eq('user_id', userId)
    .single();

  if (sessionError || !session) {
    return { error: 'Sessão não encontrada.' };
  }

  if (session.budget_id !== budgetId) {
    return { error: 'Orçamento não corresponde à sessão.' };
  }

  let quoteId: string;

  const { data: existingManualQuote } = await supabase
    .from('supplier_quotes')
    .select('id')
    .eq('session_id', sessionId)
    .eq('user_id', userId)
    .eq('supplier_id', resolved.id)
    .eq('pdf_path', MANUAL_QUOTE_PDF_PATH)
    .maybeSingle();

  if (existingManualQuote?.id) {
    quoteId = existingManualQuote.id;
  } else {
    const { data: newQuote, error: quoteError } = await supabase
      .from('supplier_quotes')
      .insert({
        budget_id: budgetId,
        session_id: sessionId,
        supplier_id: resolved.id,
        supplier_name: resolved.name,
        pdf_path: MANUAL_QUOTE_PDF_PATH,
        status: 'conciliado',
        observacoes_gerais: 'Cotação manual',
        user_id: userId,
      })
      .select('id')
      .single();

    if (quoteError || !newQuote) {
      return { error: quoteError?.message ?? 'Erro ao criar cotação manual.' };
    }
    quoteId = newQuote.id;
  }

  const qty = Math.max(material.required_qty, 0);
  const totalItem = unitPrice * (qty > 0 ? qty : 1);

  const { data: existingItem } = await supabase
    .from('supplier_quote_items')
    .select('id')
    .eq('quote_id', quoteId)
    .eq('matched_material_id', materialId)
    .maybeSingle();

  if (existingItem?.id) {
    const { error: updateError } = await supabase
      .from('supplier_quote_items')
      .update({
        descricao: material.name,
        unidade: material.unit,
        quantidade: qty,
        preco_unit: unitPrice,
        total_item: totalItem,
        preco_negociado: null,
        conversion_factor: 1,
        match_status: 'manual',
        match_method: 'manual',
        match_level: null,
        match_confidence: null,
      })
      .eq('id', existingItem.id);

    if (updateError) {
      return { error: updateError.message };
    }

    return { quoteId, quoteItemId: existingItem.id };
  }

  const { data: insertedItem, error: insertError } = await supabase
    .from('supplier_quote_items')
    .insert({
      quote_id: quoteId,
      descricao: material.name,
      unidade: material.unit,
      quantidade: qty,
      preco_unit: unitPrice,
      total_item: totalItem,
      ipi_percent: 0,
      st_incluso: false,
      alerta: false,
      matched_material_id: materialId,
      conversion_factor: 1,
      match_status: 'manual',
      match_method: 'manual',
      match_level: null,
      match_confidence: null,
    })
    .select('id')
    .single();

  if (insertError || !insertedItem) {
    return { error: insertError?.message ?? 'Erro ao salvar item da cotação manual.' };
  }

  return { quoteId, quoteItemId: insertedItem.id };
}
