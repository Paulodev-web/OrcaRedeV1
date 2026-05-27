'use server';

import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient, requireAuthUserId } from '@/lib/supabaseServer';
import type { Supplier, SupplierInput, UpdateSupplierInput } from '@/types';
import {
  listSupplierPdfHistory,
  type SupplierPdfHistoryItem,
} from '@/services/suppliers/listSupplierPdfHistory';
import { getSupplierPdfSignedUrl } from '@/services/suppliers/getSupplierPdfSignedUrl';

type ActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string };

const CADASTRO_PATH = '/fornecedores/cadastro';

function nullIfBlank(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function normalizeName(name: string): string {
  return name.trim();
}

async function assertUniqueActiveName(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  userId: string,
  name: string,
  excludeId?: string
): Promise<string | null> {
  let query = supabase
    .from('suppliers')
    .select('id')
    .eq('user_id', userId)
    .eq('is_active', true)
    .ilike('name', name);

  if (excludeId) {
    query = query.neq('id', excludeId);
  }

  const { data } = await query.maybeSingle();
  if (data) {
    return 'Já existe um fornecedor ativo com este nome.';
  }
  return null;
}

function mapRow(row: Record<string, unknown>): Supplier {
  return {
    id: row.id as string,
    user_id: row.user_id as string,
    name: row.name as string,
    cnpj: (row.cnpj as string | null) ?? null,
    phone: (row.phone as string | null) ?? null,
    email: (row.email as string | null) ?? null,
    address: (row.address as string | null) ?? null,
    sales_contact: (row.sales_contact as string | null) ?? null,
    payment_terms: (row.payment_terms as string | null) ?? null,
    notes: (row.notes as string | null) ?? null,
    is_active: row.is_active as boolean,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}

type DbPayloadResult =
  | { ok: true; data: {
      name: string;
      cnpj: string | null;
      phone: string | null;
      email: string | null;
      address: string | null;
      sales_contact: string | null;
      payment_terms: string | null;
      notes: string | null;
    } }
  | { ok: false; error: string };

function toDbPayload(input: SupplierInput): DbPayloadResult {
  const name = normalizeName(input.name);
  if (!name) {
    return { ok: false, error: 'Informe o nome do fornecedor.' };
  }
  return {
    ok: true,
    data: {
      name,
      cnpj: nullIfBlank(input.cnpj ?? null),
      phone: nullIfBlank(input.phone ?? null),
      email: nullIfBlank(input.email ?? null),
      address: nullIfBlank(input.address ?? null),
      sales_contact: nullIfBlank(input.sales_contact ?? null),
      payment_terms: nullIfBlank(input.payment_terms ?? null),
      notes: nullIfBlank(input.notes ?? null),
    },
  };
}

export async function listSuppliersAction(): Promise<ActionResult<Supplier[]>> {
  try {
    const supabase = await createSupabaseServerClient();
    const userId = await requireAuthUserId(supabase);

    const { data, error } = await supabase
      .from('suppliers')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true)
      .order('name', { ascending: true });

    if (error) return { success: false, error: error.message };
    return { success: true, data: (data ?? []).map((r) => mapRow(r)) };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Erro ao listar fornecedores.',
    };
  }
}

export async function listAllSuppliersAction(): Promise<ActionResult<Supplier[]>> {
  try {
    const supabase = await createSupabaseServerClient();
    const userId = await requireAuthUserId(supabase);

    const { data, error } = await supabase
      .from('suppliers')
      .select('*')
      .eq('user_id', userId)
      .order('is_active', { ascending: false })
      .order('name', { ascending: true });

    if (error) return { success: false, error: error.message };
    return { success: true, data: (data ?? []).map((r) => mapRow(r)) };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Erro ao listar fornecedores.',
    };
  }
}

export async function getSupplierAction(id: string): Promise<ActionResult<Supplier>> {
  try {
    const supabase = await createSupabaseServerClient();
    const userId = await requireAuthUserId(supabase);

    const { data, error } = await supabase
      .from('suppliers')
      .select('*')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (error || !data) {
      return { success: false, error: 'Fornecedor não encontrado.' };
    }
    return { success: true, data: mapRow(data) };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Erro ao carregar fornecedor.',
    };
  }
}

export async function createSupplierAction(
  input: SupplierInput
): Promise<ActionResult<Supplier>> {
  try {
    const supabase = await createSupabaseServerClient();
    const userId = await requireAuthUserId(supabase);

    const parsed = toDbPayload(input);
    if (!parsed.ok) return { success: false, error: parsed.error };

    const dup = await assertUniqueActiveName(supabase, userId, parsed.data.name);
    if (dup) return { success: false, error: dup };

    const { data, error } = await supabase
      .from('suppliers')
      .insert({ ...parsed.data, user_id: userId, is_active: true })
      .select('*')
      .single();

    if (error || !data) {
      const msg = error?.message ?? 'Erro ao criar fornecedor.';
      if (/uq_suppliers_user_name_active/i.test(msg)) {
        return { success: false, error: 'Já existe um fornecedor ativo com este nome.' };
      }
      return { success: false, error: msg };
    }

    revalidatePath(CADASTRO_PATH);
    return { success: true, data: mapRow(data) };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Erro ao criar fornecedor.',
    };
  }
}

export async function updateSupplierAction(
  id: string,
  input: UpdateSupplierInput
): Promise<ActionResult<Supplier>> {
  try {
    const supabase = await createSupabaseServerClient();
    const userId = await requireAuthUserId(supabase);

    const parsed = toDbPayload(input);
    if (!parsed.ok) return { success: false, error: parsed.error };

    const dup = await assertUniqueActiveName(supabase, userId, parsed.data.name, id);
    if (dup) return { success: false, error: dup };

    const { data, error } = await supabase
      .from('suppliers')
      .update(parsed.data)
      .eq('id', id)
      .eq('user_id', userId)
      .select('*')
      .single();

    if (error || !data) {
      const msg = error?.message ?? 'Erro ao atualizar fornecedor.';
      if (/uq_suppliers_user_name_active/i.test(msg)) {
        return { success: false, error: 'Já existe um fornecedor ativo com este nome.' };
      }
      return { success: false, error: msg };
    }

    revalidatePath(CADASTRO_PATH);
    return { success: true, data: mapRow(data) };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Erro ao atualizar fornecedor.',
    };
  }
}

export async function deactivateSupplierAction(id: string): Promise<ActionResult> {
  try {
    const supabase = await createSupabaseServerClient();
    const userId = await requireAuthUserId(supabase);

    const { error } = await supabase
      .from('suppliers')
      .update({ is_active: false })
      .eq('id', id)
      .eq('user_id', userId);

    if (error) return { success: false, error: error.message };

    revalidatePath(CADASTRO_PATH);
    return { success: true, data: undefined };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Erro ao desativar fornecedor.',
    };
  }
}

export async function listSupplierPdfHistoryAction(
  supplierId: string
): Promise<ActionResult<SupplierPdfHistoryItem[]>> {
  try {
    const supabase = await createSupabaseServerClient();
    const userId = await requireAuthUserId(supabase);

    const { data: supplier, error: supplierError } = await supabase
      .from('suppliers')
      .select('id')
      .eq('id', supplierId)
      .eq('user_id', userId)
      .maybeSingle();

    if (supplierError) {
      return { success: false, error: supplierError.message };
    }
    if (!supplier) {
      return { success: false, error: 'Fornecedor não encontrado.' };
    }

    const items = await listSupplierPdfHistory(supabase, userId, supplierId);
    return { success: true, data: items };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Erro ao carregar histórico de PDFs.',
    };
  }
}

export async function getSupplierPdfSignedUrlAction(
  filePath: string
): Promise<ActionResult<{ url: string }>> {
  try {
    const supabase = await createSupabaseServerClient();
    const userId = await requireAuthUserId(supabase);

    const url = await getSupplierPdfSignedUrl(supabase, userId, filePath);
    if (!url) {
      return { success: false, error: 'Não foi possível abrir o PDF.' };
    }

    return { success: true, data: { url } };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Erro ao gerar link do PDF.',
    };
  }
}

export async function reactivateSupplierAction(id: string): Promise<ActionResult<Supplier>> {
  try {
    const supabase = await createSupabaseServerClient();
    const userId = await requireAuthUserId(supabase);

    const { data: existing, error: fetchErr } = await supabase
      .from('suppliers')
      .select('name')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (fetchErr || !existing) {
      return { success: false, error: 'Fornecedor não encontrado.' };
    }

    const dup = await assertUniqueActiveName(supabase, userId, existing.name, id);
    if (dup) return { success: false, error: dup };

    const { data, error } = await supabase
      .from('suppliers')
      .update({ is_active: true })
      .eq('id', id)
      .eq('user_id', userId)
      .select('*')
      .single();

    if (error || !data) {
      const msg = error?.message ?? 'Erro ao reativar fornecedor.';
      if (/uq_suppliers_user_name_active/i.test(msg)) {
        return { success: false, error: 'Já existe um fornecedor ativo com este nome.' };
      }
      return { success: false, error: msg };
    }

    revalidatePath(CADASTRO_PATH);
    return { success: true, data: mapRow(data) };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Erro ao reativar fornecedor.',
    };
  }
}
