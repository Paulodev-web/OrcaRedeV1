import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { EngineerRow } from '@/types/people';

/**
 * Engenheiros ativos da organização — candidatos a responsável de uma obra
 * na aba "Responsável" (WorkEngineerAssignment). `org_members` e `profiles`
 * não têm FK direta entre si (profiles.role é contrato do APK, não da org),
 * então a lista de ids vem de uma query e os nomes de outra, como já faz
 * `getWorksForEngineer` com managerNameById.
 */
export async function getOrgEngineers(
  supabase: SupabaseClient,
  orgId: string,
): Promise<EngineerRow[]> {
  const { data: members, error: membersError } = await supabase
    .from('org_members')
    .select('user_id')
    .eq('org_id', orgId)
    .eq('is_active', true);

  if (membersError || !members || members.length === 0) return [];

  const memberIds = members.map((m) => m.user_id as string);

  const { data: profiles, error: profilesError } = await supabase
    .from('profiles')
    .select('id, full_name, email')
    .in('id', memberIds)
    .eq('role', 'engineer')
    .eq('is_active', true)
    .order('full_name', { ascending: true });

  if (profilesError || !profiles) return [];

  return profiles.map((p) => ({
    id: p.id as string,
    fullName: (p.full_name as string) ?? '',
    email: (p.email as string | null) ?? null,
  }));
}
