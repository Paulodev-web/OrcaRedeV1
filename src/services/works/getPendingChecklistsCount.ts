import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

export async function getPendingChecklistsCount(
  supabase: SupabaseClient,
  workId: string,
): Promise<number> {
  const { count, error } = await supabase
    .from('work_checklists')
    .select('id', { count: 'exact', head: true })
    .eq('work_id', workId)
    .in('status', ['awaiting_validation', 'returned']);

  if (error) return 0;
  return count ?? 0;
}
