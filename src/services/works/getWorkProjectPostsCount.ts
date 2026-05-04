import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Conta postes planejados (snapshot) de uma obra. Retorna 0 se não houver
 * snapshot ou se o usuário não tiver permissão (RLS).
 */
export async function getWorkProjectPostsCount(
  supabase: SupabaseClient,
  workId: string,
): Promise<number> {
  const { count, error } = await supabase
    .from('work_project_posts')
    .select('id', { count: 'exact', head: true })
    .eq('work_id', workId);
  if (error || count === null) return 0;
  return count;
}
