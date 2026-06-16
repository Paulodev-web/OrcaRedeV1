import type { SupabaseClient } from '@supabase/supabase-js';

export interface ResolvedSupplier {
  id: string;
  name: string;
  is_active: boolean;
}

export async function resolveSupplierForQuote(
  supabase: SupabaseClient,
  userId: string,
  supplierId: string,
  options?: { requireActive?: boolean }
): Promise<ResolvedSupplier | { error: string }> {
  const requireActive = options?.requireActive ?? true;

  const { data, error } = await supabase
    .from('suppliers')
    .select('id, name, is_active')
    .eq('id', supplierId)
    .eq('user_id', userId)
    .single();

  if (error || !data) {
    return { error: 'Fornecedor não encontrado.' };
  }

  if (requireActive && !data.is_active) {
    return { error: 'Fornecedor inativo. Selecione outro ou reative o cadastro.' };
  }

  const name = data.name?.trim();
  if (!name) {
    return { error: 'Fornecedor sem nome válido.' };
  }

  return { id: data.id, name, is_active: data.is_active };
}
