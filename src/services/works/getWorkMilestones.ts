import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { MilestoneCode, MilestoneStatus, WorkMilestone } from '@/types/works';

export async function getWorkMilestones(
  supabase: SupabaseClient,
  workId: string,
): Promise<WorkMilestone[]> {
  const { data, error } = await supabase
    .from('work_milestones')
    .select('id, work_id, code, name, order_index, status')
    .eq('work_id', workId)
    .order('order_index', { ascending: true });

  if (error || !data) return [];

  return data.map((row) => ({
    id: row.id as string,
    workId: row.work_id as string,
    code: row.code as MilestoneCode,
    name: row.name as string,
    orderIndex: row.order_index as number,
    status: row.status as MilestoneStatus,
  }));
}
