import type { SupabaseClient } from '@supabase/supabase-js';
import type { SupplierExportData } from '@/types/exportIdeal';
import type { Supplier } from '@/types';

function mapSupplierRow(row: Record<string, unknown>): Supplier {
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

export async function resolveSupplierMasterForExport(
  supabase: SupabaseClient,
  userId: string,
  supplier: SupplierExportData
): Promise<Supplier | null> {
  if (supplier.quoteIds.length === 0) return null;

  const { data: quotes } = await supabase
    .from('supplier_quotes')
    .select('id, supplier_id')
    .eq('user_id', userId)
    .in('id', supplier.quoteIds);

  const supplierId = quotes?.find((q) => q.supplier_id)?.supplier_id ?? null;
  if (!supplierId) return null;

  const { data: row } = await supabase
    .from('suppliers')
    .select('*')
    .eq('id', supplierId)
    .eq('user_id', userId)
    .maybeSingle();

  return row ? mapSupplierRow(row as Record<string, unknown>) : null;
}
