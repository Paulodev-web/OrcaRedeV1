import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import type { ScenariosResult } from '@/actions/supplierQuotes';
import { effectiveUnitPrice } from '@/lib/supplierPrice';
import { getSupplierDisplayName } from '@/lib/supplierDisplay';
import { slugifyFileName } from '@/lib/slugify';
import { syncMaterialPriceInBudget } from '@/services/budgets/syncMaterialPrice';

export interface ApplySupplierQuotePricesInput {
  supabase: SupabaseClient;
  userId: string;
  sessionId: string;
  budgetId: string;
  scenarios: ScenariosResult;
  /** Slug (slugifyFileName) do nome do fornecedor, igual ao usado nos filtros do Cenário Ideal. */
  supplierSlug: string;
}

export interface ApplySupplierQuotePricesResult {
  updated: number;
  skippedNoOffer: number;
  /** Nome de exibição do fornecedor encontrado, ou '' se nenhuma oferta do fornecedor foi localizada. */
  supplierName: string;
}

type QuoteSourceRow = {
  id: string;
  supplier_id: string | null;
  supplier_name: string;
  suppliers?: { name: string } | { name: string }[] | null;
};

type MaterialUpdate = {
  materialId: string;
  quoteId: string;
  price: number;
};

/**
 * Atualiza materials.price usando somente as ofertas de UM fornecedor da sessão,
 * ignorando o mix de "melhor preço"/validação do Cenário Ideal. Materiais que
 * esse fornecedor não cotou permanecem inalterados.
 */
export async function applySupplierQuotePricesToMaterials({
  supabase,
  userId,
  sessionId,
  budgetId,
  scenarios,
  supplierSlug,
}: ApplySupplierQuotePricesInput): Promise<ApplySupplierQuotePricesResult> {
  let supplierName = '';
  const updates: MaterialUpdate[] = [];
  let skippedNoOffer = 0;

  for (const item of scenarios.scenarioB.items) {
    if (item.net_qty <= 0) continue;

    const offer = item.all_offers.find(
      (candidate) => slugifyFileName(candidate.supplier_name) === supplierSlug
    );

    if (!offer) {
      skippedNoOffer += 1;
      continue;
    }

    if (!supplierName) supplierName = offer.supplier_name;

    updates.push({
      materialId: item.material_id,
      quoteId: offer.quote_id,
      price: effectiveUnitPrice(offer.preco_negociado, offer.preco_unit),
    });
  }

  if (!supplierName || updates.length === 0) {
    return { updated: 0, skippedNoOffer, supplierName };
  }

  const quoteIds = [...new Set(updates.map((item) => item.quoteId))];
  const { data: quoteRows, error: quoteError } = await supabase
    .from('supplier_quotes')
    .select('id, supplier_id, supplier_name, suppliers ( name )')
    .eq('session_id', sessionId)
    .eq('user_id', userId)
    .in('id', quoteIds);

  if (quoteError) {
    throw new Error(quoteError.message);
  }

  const quotesById = new Map(
    ((quoteRows ?? []) as QuoteSourceRow[]).map((quote) => [quote.id, quote])
  );
  const updatedAt = new Date().toISOString();

  let updated = 0;

  for (const item of updates) {
    const quote = quotesById.get(item.quoteId);
    if (!quote) {
      throw new Error('Uma das cotações deste fornecedor não foi encontrada.');
    }

    const { data: updatedMaterial, error: updateError } = await supabase
      .from('materials')
      .update({
        price: item.price,
        price_source_supplier_name: getSupplierDisplayName(quote),
        price_source_supplier_id: quote.supplier_id,
        price_source_quote_id: quote.id,
        price_source_session_id: sessionId,
        price_source_updated_at: updatedAt,
      })
      .eq('id', item.materialId)
      .eq('user_id', userId)
      .select('id')
      .maybeSingle();

    if (updateError) {
      throw new Error(updateError.message);
    }

    if (updatedMaterial) {
      updated += 1;
      await syncMaterialPriceInBudget(supabase, budgetId, item.materialId, item.price);
    }
  }

  return { updated, skippedNoOffer, supplierName };
}
