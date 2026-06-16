import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { WorkMessageSenderRole } from '@/types/works';

/**
 * Conta mensagens nao lidas pelo usuario com role indicado em uma obra.
 * Considera "nao lida" toda mensagem onde:
 *  - sender_role != userRole (so conta msgs do outro lado)
 *  - read_by_<role>_at IS NULL
 */
export async function getUnreadMessagesCount(
  supabase: SupabaseClient,
  workId: string,
  userRole: WorkMessageSenderRole,
): Promise<number> {
  const otherRole: WorkMessageSenderRole = userRole === 'engineer' ? 'manager' : 'engineer';
  const readColumn =
    userRole === 'engineer' ? 'read_by_engineer_at' : 'read_by_manager_at';

  const { count, error } = await supabase
    .from('work_messages')
    .select('id', { count: 'exact', head: true })
    .eq('work_id', workId)
    .eq('sender_role', otherRole)
    .is(readColumn, null);

  if (error) return 0;
  return count ?? 0;
}
