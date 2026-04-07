import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Cruza itens sem match contra supplier_material_mappings (mesma lógica da action).
 */
export async function autoMatchQuoteItems(
  supabase: SupabaseClient,
  userId: string,
  quoteId: string
): Promise<{ matched: number; total: number }> {
  const { data: quote, error: quoteError } = await supabase
    .from('supplier_quotes')
    .select('id, supplier_name')
    .eq('id', quoteId)
    .eq('user_id', userId)
    .single();

  if (quoteError || !quote) {
    return { matched: 0, total: 0 };
  }

  const { data: items, error: itemsError } = await supabase
    .from('supplier_quote_items')
    .select('id, descricao')
    .eq('quote_id', quoteId)
    .eq('match_status', 'sem_match');

  if (itemsError || !items || items.length === 0) {
    return { matched: 0, total: items?.length ?? 0 };
  }

  const { data: mappings, error: mappingsError } = await supabase
    .from('supplier_material_mappings')
    .select('supplier_material_name, internal_material_id, conversion_factor')
    .eq('user_id', userId)
    .eq('supplier_name', quote.supplier_name);

  if (mappingsError || !mappings || mappings.length === 0) {
    return { matched: 0, total: items.length };
  }

  const mappingMap = new Map(
    mappings.map((m) => [m.supplier_material_name.toLowerCase().trim(), m])
  );

  let matchedCount = 0;
  for (const item of items) {
    const key = item.descricao.toLowerCase().trim();
    const mapping = mappingMap.get(key);

    if (mapping) {
      const { error: updateError } = await supabase
        .from('supplier_quote_items')
        .update({
          matched_material_id: mapping.internal_material_id,
          conversion_factor: mapping.conversion_factor,
          match_status: 'automatico',
        })
        .eq('id', item.id);

      if (!updateError) matchedCount++;
    }
  }

  return { matched: matchedCount, total: items.length };
}
