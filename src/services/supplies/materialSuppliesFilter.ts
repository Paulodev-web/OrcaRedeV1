import type { SupabaseClient } from '@supabase/supabase-js';

export async function getInactiveSuppliesMaterialIds(
  supabase: SupabaseClient,
  userId: string
): Promise<Set<string>> {
  const { data, error } = await supabase
    .from('materials')
    .select('id')
    .eq('user_id', userId)
    .eq('active_in_supplies', false);

  if (error) {
    console.error('Erro ao buscar materiais inativos em Suprimentos:', error);
    return new Set();
  }

  return new Set((data ?? []).map((row) => row.id));
}

export function isMaterialActiveInSupplies(
  material: { active_in_supplies?: boolean | null } | null | undefined
): boolean {
  return material?.active_in_supplies !== false;
}
