import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Conta diarios em pending_approval para a obra. Usado no badge da aba Diario.
 *
 * Engineer: o numero representa diarios aguardando sua aprovacao.
 * Manager: tipicamente sem badge (manager publicou; aguarda decisao).
 *
 * RLS de work_daily_logs garante que so membros leem.
 */
export async function getUnreadDailyLogsCount(
  supabase: SupabaseClient,
  workId: string,
): Promise<number> {
  const { count, error } = await supabase
    .from('work_daily_logs')
    .select('id', { count: 'exact', head: true })
    .eq('work_id', workId)
    .eq('status', 'pending_approval');
  if (error || count === null) return 0;
  return count;
}
