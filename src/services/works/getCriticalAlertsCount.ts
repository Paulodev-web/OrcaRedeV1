import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

export async function getCriticalAlertsCount(
  supabase: SupabaseClient,
  workId: string,
): Promise<number> {
  const { count, error } = await supabase
    .from('work_alerts')
    .select('id', { count: 'exact', head: true })
    .eq('work_id', workId)
    .eq('severity', 'critical')
    .in('status', ['open', 'in_progress', 'resolved_in_field']);

  if (error) return 0;
  return count ?? 0;
}
