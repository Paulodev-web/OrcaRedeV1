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

export async function getSessionExcludedMaterialIds(
  supabase: SupabaseClient,
  sessionId: string,
  userId: string
): Promise<Set<string>> {
  const { data, error } = await supabase
    .from('session_material_exclusions')
    .select('material_id')
    .eq('session_id', sessionId)
    .eq('user_id', userId);

  if (error) {
    console.error('Erro ao buscar exclusões da sessão:', error);
    return new Set();
  }

  return new Set((data ?? []).map((row) => row.material_id));
}

/** Globalmente inativo no catálogo + oculto nesta sessão. */
export async function getSuppliesExcludedMaterialIds(
  supabase: SupabaseClient,
  userId: string,
  sessionId?: string | null
): Promise<Set<string>> {
  const global = await getInactiveSuppliesMaterialIds(supabase, userId);
  if (!sessionId) return global;

  const session = await getSessionExcludedMaterialIds(supabase, sessionId, userId);
  if (session.size === 0) return global;
  return new Set([...global, ...session]);
}

export function isMaterialActiveInSupplies(
  material: { active_in_supplies?: boolean | null } | null | undefined
): boolean {
  return material?.active_in_supplies !== false;
}

export function isMaterialVisibleInSuppliesSession(
  materialId: string,
  excludedIds: Set<string>
): boolean {
  return !excludedIds.has(materialId);
}
