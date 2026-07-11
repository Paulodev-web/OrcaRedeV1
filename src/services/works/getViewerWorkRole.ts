import 'server-only';
import { cache } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { WorkMemberRole } from '@/types/works';

/**
 * Role do usuário logado em work_members para uma obra específica.
 * Memoizado por requisição (React.cache): antes ficava colado e repetido em
 * cada subpágina da área de trabalho, refazendo a mesma query a cada troca de aba.
 */
export const getViewerWorkRole = cache(async (
  supabase: SupabaseClient,
  workId: string,
  userId: string,
): Promise<WorkMemberRole | null> => {
  const { data } = await supabase
    .from('work_members')
    .select('role')
    .eq('work_id', workId)
    .eq('user_id', userId)
    .maybeSingle();

  return (data?.role as WorkMemberRole | undefined) ?? null;
});
