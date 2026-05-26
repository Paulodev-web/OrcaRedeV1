import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import type { IdealSelectionRow, ScenariosResult } from '@/actions/supplierQuotes';
import { buildEffectiveSelectionMap } from '@/lib/scenarioIdealEngine';
import { effectiveUnitPrice } from '@/lib/supplierPrice';
import { getSupplierDisplayName } from '@/lib/supplierDisplay';

export interface ApplyIdealScenarioPricesInput {
  supabase: SupabaseClient;
  userId: string;
  sessionId: string;
  scenarios: ScenariosResult;
  selections: IdealSelectionRow[];
}

export interface ApplyIdealScenarioPricesResult {
  updated: number;
  skippedPending: number;
  suggestedApplied: number;
}

type QuoteSourceRow = {
  id: string;
  supplier_id: string | null;
  supplier_name: string;
  suppliers?: { name: string } | { name: string }[] | null;
};

export async function applyIdealScenarioPricesToMaterials({
  supabase,
  userId,
  sessionId,
  scenarios,
  selections,
}: ApplyIdealScenarioPricesInput): Promise<ApplyIdealScenarioPricesResult> {
  const validatedMap = new Map(selections.map((row) => [row.material_id, row.quote_id]));
  const effectiveMap = buildEffectiveSelectionMap(scenarios.scenarioB.items, validatedMap);

  const selectedUpdates = scenarios.scenarioB.items.flatMap((item) => {
    if (item.net_qty <= 0) return [];

    const quoteId = effectiveMap.get(item.material_id);
    if (!quoteId) return [{ type: 'pending' as const }];

    const offer = item.all_offers.find((candidate) => candidate.quote_id === quoteId);
    if (!offer) return [{ type: 'pending' as const }];

    return [
      {
        type: 'update' as const,
        materialId: item.material_id,
        quoteId,
        price: effectiveUnitPrice(offer.preco_negociado, offer.preco_unit),
        isSuggested: !validatedMap.has(item.material_id),
      },
    ];
  });

  const skippedPending = selectedUpdates.filter((item) => item.type === 'pending').length;
  const updates = selectedUpdates.filter((item) => item.type === 'update');
  if (updates.length === 0) {
    return { updated: 0, skippedPending, suggestedApplied: 0 };
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
  let suggestedApplied = 0;

  for (const item of updates) {
    const quote = quotesById.get(item.quoteId);
    if (!quote) {
      throw new Error('Uma das cotações do cenário ideal não foi encontrada.');
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
      if (item.isSuggested) suggestedApplied += 1;
    }
  }

  return { updated, skippedPending, suggestedApplied };
}
