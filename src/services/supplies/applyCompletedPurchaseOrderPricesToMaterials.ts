import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { syncMaterialPriceInBudget } from '@/services/budgets/syncMaterialPrice';

export interface ApplyCompletedPurchaseOrderPricesInput {
  supabase: SupabaseClient;
  sessionId: string;
  budgetId: string;
}

export interface ApplyCompletedPurchaseOrderPricesResult {
  updated: number;
  ordersApplied: number;
}

type PurchaseOrderRow = {
  id: string;
  supplier_id: string | null;
  supplier_name: string;
  purchase_order_items: { material_id: string; preco_unit: number }[] | null;
};

/**
 * Atualiza materials.price usando o preço lançado nas OCs (purchase_orders) já
 * emitidas/entregues desta sessão — não mais pelo "melhor preço de um fornecedor",
 * e sim pelo item que efetivamente teve compra concluída com OC.
 */
export async function applyCompletedPurchaseOrderPricesToMaterials({
  supabase,
  sessionId,
  budgetId,
}: ApplyCompletedPurchaseOrderPricesInput): Promise<ApplyCompletedPurchaseOrderPricesResult> {
  const { data: orders, error: ordersError } = await supabase
    .from('purchase_orders')
    .select('id, supplier_id, supplier_name, status, purchase_order_items ( material_id, preco_unit )')
    .eq('session_id', sessionId)
    .neq('status', 'cancelada');

  if (ordersError) {
    throw new Error(ordersError.message);
  }

  const rows = (orders ?? []) as PurchaseOrderRow[];
  const updatedAt = new Date().toISOString();
  let updated = 0;

  for (const order of rows) {
    for (const item of order.purchase_order_items ?? []) {
      const { data: updatedMaterial, error: updateError } = await supabase
        .from('materials')
        .update({
          price: item.preco_unit,
          price_source_supplier_name: order.supplier_name,
          price_source_supplier_id: order.supplier_id,
          price_source_quote_id: null,
          price_source_session_id: sessionId,
          price_source_updated_at: updatedAt,
        })
        .eq('id', item.material_id)
        .select('id')
        .maybeSingle();

      if (updateError) {
        throw new Error(updateError.message);
      }

      if (updatedMaterial) {
        updated += 1;
        await syncMaterialPriceInBudget(supabase, budgetId, item.material_id, item.preco_unit);
      }
    }
  }

  return { updated, ordersApplied: rows.length };
}
