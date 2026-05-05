import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

interface RawRow {
  work_id: string;
}

/**
 * Conta mensagens nao lidas pelo engineer em multiplas obras de uma vez.
 * Retorna mapa { workId -> count }, com 0 implicito para obras sem mensagens
 * ou sem mensagens nao lidas.
 *
 * Usado pela home da Central de Acompanhamento para badges nos WorkCards.
 *
 * Estrategia: 1 query agregada filtrando por engineer (sender_role='manager'
 * + read_by_engineer_at IS NULL); contagem feita em memoria. Para escalas
 * futuras (>200 mensagens nao lidas), considerar RPC com group by.
 */
export async function getUnreadCountsForWorks(
  supabase: SupabaseClient,
  workIds: string[],
): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  if (workIds.length === 0) return counts;

  for (const id of workIds) counts[id] = 0;

  const { data, error } = await supabase
    .from('work_messages')
    .select('work_id')
    .in('work_id', workIds)
    .eq('sender_role', 'manager')
    .is('read_by_engineer_at', null);

  if (error || !data) return counts;

  const rows = data as unknown as RawRow[];
  for (const row of rows) {
    counts[row.work_id] = (counts[row.work_id] ?? 0) + 1;
  }

  return counts;
}
