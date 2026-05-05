import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { WorkTeamAttendanceRow } from '@/types/works';

export async function getWorkAttendanceHistory(
  supabase: SupabaseClient,
  workId: string,
  options?: { limit?: number },
): Promise<WorkTeamAttendanceRow[]> {
  const limit = options?.limit ?? 200;

  const { data, error } = await supabase
    .from('work_team_attendance')
    .select(`
      id, work_id, crew_member_id, attendance_date, daily_log_id, created_at,
      crew_members (full_name)
    `)
    .eq('work_id', workId)
    .order('attendance_date', { ascending: false })
    .limit(limit);

  if (error || !data) return [];

  return (data as unknown as Array<{
    id: string; work_id: string; crew_member_id: string; attendance_date: string;
    daily_log_id: string | null; created_at: string;
    crew_members: { full_name: string } | null;
  }>).map((r): WorkTeamAttendanceRow => ({
    id: r.id,
    workId: r.work_id,
    crewMemberId: r.crew_member_id,
    attendanceDate: r.attendance_date,
    dailyLogId: r.daily_log_id,
    createdAt: r.created_at,
    crewMemberName: r.crew_members?.full_name ?? 'Desconhecido',
  }));
}
