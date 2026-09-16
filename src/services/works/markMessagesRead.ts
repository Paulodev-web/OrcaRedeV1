import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { WorkMemberRole } from '@/lib/auth/ensureMember';

/**
 * Marca como lidas as mensagens vindas do outro lado da conversa.
 * Idempotente: roda WHERE read_by_<role>_at IS NULL.
 *
 * Não chama revalidatePath. A separação existe porque a página do chat
 * precisa marcar como lido durante o próprio render, e revalidatePath ali
 * é proibido pelo Next:
 *
 *   Route .../chat used "revalidatePath" during render which is unsupported.
 *
 * Quem revalida é a Server Action `markMessagesAsRead`, chamada do cliente,
 * onde revalidar é legítimo. O render usa esta função direto.
 */
export async function markMessagesRead(
  supabase: SupabaseClient,
  workId: string,
  viewerRole: WorkMemberRole,
): Promise<{ count: number; error: string | null }> {
  const otherRole: WorkMemberRole = viewerRole === 'engineer' ? 'manager' : 'engineer';
  const readColumn =
    viewerRole === 'engineer' ? 'read_by_engineer_at' : 'read_by_manager_at';

  const { data, error } = await supabase
    .from('work_messages')
    .update({ [readColumn]: new Date().toISOString() })
    .eq('work_id', workId)
    .eq('sender_role', otherRole)
    .is(readColumn, null)
    .select('id');

  if (error) return { count: 0, error: error.message };

  return { count: Array.isArray(data) ? data.length : 0, error: null };
}
