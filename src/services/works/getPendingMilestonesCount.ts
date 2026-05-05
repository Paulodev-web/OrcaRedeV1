import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Conta marcos em awaiting_approval para a obra. Usado no badge da aba
 * Progresso.
 */
export async function getPendingMilestonesCount(
  supabase: SupabaseClient,
  workId: string,
): Promise<number> {
  const { count, error } = await supabase
    .from('work_milestones')
    .select('id', { count: 'exact', head: true })
    .eq('work_id', workId)
    .eq('status', 'awaiting_approval');
  if (error || count === null) return 0;
  return count;
}
