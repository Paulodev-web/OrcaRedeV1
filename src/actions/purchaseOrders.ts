'use server';

import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient, requireAuthUserId } from '@/lib/supabaseServer';
import type { FreightType, PurchaseOrderStatus } from '@/services/dre/loadDreContext';

type ActionResult<T = void> = { success: true; data: T } | { success: false; error: string };

function revalidateDrePath(sessionId: string) {
  revalidatePath(`/fornecedores/sessao/${sessionId}/dre`);
}

export interface UpdatePurchaseOrderInput {
  id: string;
  sessionId: string;
  freightType?: FreightType | null;
  freightValue?: number | null;
  status?: PurchaseOrderStatus;
  deliveryDate?: string | null;
}

/**
 * Edita frete, classificação (CIF/FOB) e status de entrega de uma OC direto
 * da DRE. `freightType: 'cif'` sem `freightValue` é um estado legítimo (frete
 * embutido no material) — não força preencher nada.
 */
export async function updatePurchaseOrderAction(input: UpdatePurchaseOrderInput): Promise<ActionResult> {
  try {
    const supabase = await createSupabaseServerClient();
    await requireAuthUserId(supabase);

    const patch: Record<string, unknown> = {};
    if (input.freightType !== undefined) patch.freight_type = input.freightType;
    if (input.freightValue !== undefined) patch.freight_value = input.freightValue;
    if (input.status !== undefined) patch.status = input.status;
    if (input.deliveryDate !== undefined) patch.delivery_date = input.deliveryDate;

    if (Object.keys(patch).length === 0) {
      return { success: true, data: undefined };
    }

    const { error } = await supabase.from('purchase_orders').update(patch).eq('id', input.id);

    if (error) {
      return { success: false, error: error.message };
    }

    revalidateDrePath(input.sessionId);
    return { success: true, data: undefined };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro inesperado ao atualizar a ordem de compra.';
    return { success: false, error: message };
  }
}
