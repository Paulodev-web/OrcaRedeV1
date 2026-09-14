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
export interface CreatePurchaseOrderItemInput {
  materialId: string;
  quantidade: number;
  precoUnit: number;
}

export interface CreatePurchaseOrderInput {
  sessionId: string;
  ocNumber: string;
  supplierName: string;
  supplierId?: string | null;
  freightValue?: number | null;
  freightType?: FreightType | null;
  deliveryDate?: string | null;
  notes?: string | null;
  items: CreatePurchaseOrderItemInput[];
}

/**
 * Cria uma OC (purchase_orders) com N materiais de uma vez (purchase_order_items),
 * via RPC atômica — substitui o fluxo antigo de digitar um número de OC por
 * material. Materiais que compartilham a mesma OC entram numa única chamada.
 */
export async function createPurchaseOrderAction(
  input: CreatePurchaseOrderInput
): Promise<ActionResult<{ id: string }>> {
  try {
    const supabase = await createSupabaseServerClient();
    await requireAuthUserId(supabase);

    const ocNumber = input.ocNumber.trim();
    const supplierName = input.supplierName.trim();

    if (!ocNumber) {
      return { success: false, error: 'Informe o número da OC.' };
    }
    if (!supplierName) {
      return { success: false, error: 'Informe o fornecedor.' };
    }
    if (input.items.length === 0) {
      return { success: false, error: 'Selecione ao menos um material.' };
    }
    if (input.items.some((item) => item.quantidade <= 0 || item.precoUnit < 0)) {
      return { success: false, error: 'Quantidade e preço dos itens precisam ser válidos.' };
    }

    const { data: session, error: sessionError } = await supabase
      .from('quotation_sessions')
      .select('id, budget_id')
      .eq('id', input.sessionId)
      .single();

    if (sessionError || !session) {
      return { success: false, error: 'Sessão não encontrada.' };
    }

    const { data, error } = await supabase.rpc('create_purchase_order_with_items', {
      p_oc_number: ocNumber,
      p_supplier_name: supplierName,
      p_supplier_id: input.supplierId ?? null,
      p_budget_id: session.budget_id,
      p_session_id: input.sessionId,
      p_freight_value: input.freightValue ?? null,
      p_freight_type: input.freightType ?? null,
      p_delivery_date: input.deliveryDate ?? null,
      p_notes: input.notes ?? null,
      p_items: input.items.map((item) => ({
        material_id: item.materialId,
        quantidade: item.quantidade,
        preco_unit: item.precoUnit,
      })),
    } as any);

    if (error) {
      return { success: false, error: error.message };
    }

    revalidateDrePath(input.sessionId);
    revalidatePath(`/fornecedores/sessao/${input.sessionId}`);

    return { success: true, data: { id: data as unknown as string } };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro inesperado ao criar a ordem de compra.';
    return { success: false, error: message };
  }
}

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
