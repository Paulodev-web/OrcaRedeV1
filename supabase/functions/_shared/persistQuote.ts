import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.100.1';
import type { SupplierExtractItem } from './types.ts';

export interface ResolvedSupplier {
  id: string;
  name: string;
  is_active: boolean;
}

export async function resolveSupplierForQuote(
  supabase: SupabaseClient,
  userId: string,
  supplierId: string
): Promise<ResolvedSupplier | { error: string }> {
  const { data, error } = await supabase
    .from('suppliers')
    .select('id, name, is_active')
    .eq('id', supplierId)
    .eq('user_id', userId)
    .single();

  if (error || !data) {
    return { error: 'Fornecedor não encontrado.' };
  }

  if (!data.is_active) {
    return { error: 'Fornecedor inativo. Selecione outro ou reative o cadastro.' };
  }

  const name = data.name?.trim();
  if (!name) {
    return { error: 'Fornecedor sem nome válido.' };
  }

  return { id: data.id, name, is_active: data.is_active };
}

export interface PersistQuoteParams {
  userId: string;
  budgetId: string | null;
  sessionId: string | null;
  supplierId: string;
  pdfPath: string;
  observacoesGerais: string;
  quoteDate?: string | null;
  items: SupplierExtractItem[];
}

export async function persistSupplierQuoteFromExtraction(
  supabase: SupabaseClient,
  params: PersistQuoteParams
): Promise<{ quoteId: string; supplierName: string } | { error: string }> {
  const resolved = await resolveSupplierForQuote(supabase, params.userId, params.supplierId);
  if ('error' in resolved) {
    return { error: resolved.error };
  }

  const { data: quote, error: quoteError } = await supabase
    .from('supplier_quotes')
    .insert({
      budget_id: params.budgetId,
      session_id: params.sessionId,
      supplier_id: resolved.id,
      supplier_name: resolved.name,
      pdf_path: params.pdfPath,
      observacoes_gerais: params.observacoesGerais || null,
      quote_date: params.quoteDate ?? null,
      status: 'pendente',
      user_id: params.userId,
    })
    .select('id')
    .single();

  if (quoteError || !quote) {
    return { error: quoteError?.message ?? 'Erro ao criar cotação.' };
  }

  const itemsToInsert = params.items.map((item) => ({
    quote_id: quote.id,
    descricao: item.descricao ?? '',
    unidade: item.unidade ?? '',
    quantidade: item.quantidade ?? 0,
    preco_unit: item.preco_unit ?? 0,
    total_item: item.total_item ?? 0,
    ipi_percent: item.ipi_percent ?? 0,
    st_incluso: item.st_incluso ?? false,
    alerta: item.alerta ?? false,
    match_status: 'sem_match',
    conversion_factor: 1,
    match_level: null,
    match_confidence: null,
    match_method: null,
  }));

  const { error: itemsError } = await supabase.from('supplier_quote_items').insert(itemsToInsert);

  if (itemsError) {
    await supabase.from('supplier_quotes').delete().eq('id', quote.id);
    return { error: `Erro ao salvar itens: ${itemsError.message}` };
  }

  return { quoteId: quote.id, supplierName: resolved.name };
}
