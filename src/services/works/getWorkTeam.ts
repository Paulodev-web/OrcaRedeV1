import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { WorkTeamMember } from '@/types/works';

export async function getWorkTeam(
  supabase: SupabaseClient,
  workId: string,
): Promise<WorkTeamMember[]> {
  const { data, error } = await supabase
    .from('work_team')
    .select(`
      id, work_id, crew_member_id, role_in_work, allocated_at, deallocated_at, created_at, updated_at,
      crew_members (full_name, role, is_active)
    `)
    .eq('work_id', workId)
    .is('deallocated_at', null)
    .order('allocated_at', { ascending: true });

  if (error || !data) return [];

  return (data as unknown as Array<{
    id: string; work_id: string; crew_member_id: string; role_in_work: string | null;
    allocated_at: string; deallocated_at: string | null; created_at: string; updated_at: string;
    crew_members: { full_name: string; role: string | null; is_active: boolean } | null;
  }>).map((r): WorkTeamMember => ({
    id: r.id,
    workId: r.work_id,
    crewMemberId: r.crew_member_id,
    roleInWork: r.role_in_work,
    allocatedAt: r.allocated_at,
    deallocatedAt: r.deallocated_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    crewMemberName: r.crew_members?.full_name ?? 'Desconhecido',
    crewMemberRole: r.crew_members?.role ?? null,
    crewMemberIsActive: r.crew_members?.is_active ?? false,
  }));
}
