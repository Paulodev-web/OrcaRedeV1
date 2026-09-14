import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

export interface WorkExecutionStats {
  /**
   * Quando o campo registrou alguma coisa pela ultima vez, pelo relogio do
   * APARELHO (`installed_at`), nao pela hora de chegada no servidor. Registro
   * feito as 16h sem sinal e sincronizado as 19h continua sendo das 16h.
   */
  lastRecordAt: string | null;
}

const VAZIO: WorkExecutionStats = { lastRecordAt: null };

/**
 * O que o campo executou, em batch por obra.
 *
 * Le as duas origens de execucao (poste, equipamento). Nao usa
 * `works.last_activity_at` de proposito: aquele campo tambem anda quando chega
 * mensagem no chat, e conversa nao e execucao. Uma obra pode estar cheia de
 * conversa e parada ha uma semana.
 */
export async function getWorkExecutionStats(
  supabase: SupabaseClient,
  workIds: ReadonlyArray<string>,
): Promise<Record<string, WorkExecutionStats>> {
  if (workIds.length === 0) return {};

  const ids = workIds as string[];
  const [polesRes, equipRes] = await Promise.all([
    supabase
      .from('work_pole_installations')
      .select('work_id, installed_at')
      .eq('status', 'installed')
      .in('work_id', ids),
    supabase
      .from('work_pole_equipment')
      .select('work_id, installed_at')
      .in('work_id', ids),
  ]);

  if (polesRes.error || equipRes.error) {
    // Falha de leitura nao pode virar "obra sem execucao": isso apareceria na
    // home como silencio e mandaria o engenheiro cobrar um gerente que estava
    // trabalhando. Sem numero e melhor que numero errado.
    console.error('[getWorkExecutionStats] falha ao ler execucao', {
      poles: polesRes.error?.message ?? 'ok',
      equipment: equipRes.error?.message ?? 'ok',
    });
    return {};
  }

  const out: Record<string, WorkExecutionStats> = {};
  const garante = (workId: string): WorkExecutionStats => {
    if (!out[workId]) out[workId] = { ...VAZIO };
    return out[workId];
  };

  const marcaData = (stats: WorkExecutionStats, quando: string | null) => {
    if (!quando) return;
    if (stats.lastRecordAt === null || quando > stats.lastRecordAt) {
      stats.lastRecordAt = quando;
    }
  };

  for (const row of (polesRes.data ?? []) as Array<{ work_id: string; installed_at: string | null }>) {
    marcaData(garante(row.work_id), row.installed_at);
  }

  for (const row of (equipRes.data ?? []) as Array<{ work_id: string; installed_at: string | null }>) {
    marcaData(garante(row.work_id), row.installed_at);
  }

  return out;
}
