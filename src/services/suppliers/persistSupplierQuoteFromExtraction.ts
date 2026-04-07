import type { SupabaseClient } from '@supabase/supabase-js';
import type { SupplierExtractItem } from '@/types/supplierExtract';

export interface PersistQuoteParams {
  userId: string;
  budgetId: string | null;
  sessionId: string | null;
  supplierName: string;
  pdfPath: string;
  observacoesGerais: string;
  items: SupplierExtractItem[];
}

export async function persistSupplierQuoteFromExtraction(
  supabase: SupabaseClient,
  params: PersistQuoteParams
): Promise<{ quoteId: string } | { error: string }> {
  const { data: quote, error: quoteError } = await supabase
    .from('supplier_quotes')
    .insert({
      budget_id: params.budgetId,
      session_id: params.sessionId,
      supplier_name: params.supplierName.trim(),
      pdf_path: params.pdfPath,
      observacoes_gerais: params.observacoesGerais || null,
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
  }));

  const { error: itemsError } = await supabase.from('supplier_quote_items').insert(itemsToInsert);

  if (itemsError) {
    await supabase.from('supplier_quotes').delete().eq('id', quote.id);
    return { error: `Erro ao salvar itens: ${itemsError.message}` };
  }

  return { quoteId: quote.id };
}
