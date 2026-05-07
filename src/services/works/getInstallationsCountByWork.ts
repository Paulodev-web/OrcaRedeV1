import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { InstallationsCount, PoleInstallationStatus } from '@/types/works';

interface RawRow {
  work_id: string;
  status: PoleInstallationStatus;
}

/**
 * Conta instalacoes por obra agrupadas por status.
 *
 * Recebe array de workIds e retorna mapa { [workId]: { installed, removed } }.
 * Obras sem instalacoes sao incluidas com zero em ambos os status.
 *
 * Usado pelo layout da obra para o KPI "Postes instalados / planejados" e,
 * em fase futura, pela home (Central) para badge de execucao.
 */
export async function getInstallationsCountByWork(
  supabase: SupabaseClient,
  workIds: string[],
): Promise<Record<string, InstallationsCount>> {
  const map: Record<string, InstallationsCount> = {};
  for (const id of workIds) map[id] = { installed: 0, removed: 0 };
  if (workIds.length === 0) return map;

  const { data, error } = await supabase
    .from('work_pole_installations')
    .select('work_id, status')
    .in('work_id', workIds);

  if (error || !data) return map;

  const rows = data as unknown as RawRow[];
  for (const row of rows) {
    const bucket = map[row.work_id];
    if (!bucket) continue;
    if (row.status === 'installed') bucket.installed += 1;
    else if (row.status === 'removed') bucket.removed += 1;
  }
  return map;
}
