import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { AlertSeverity, AlertStatus } from '@/types/works';

export interface WorkOpenAlert {
  id: string;
  title: string;
  severity: AlertSeverity;
  status: AlertStatus;
  createdAt: string;
  /** Quantos alertas seguem em aberto na obra, contando este. */
  totalOpen: number;
}

/**
 * O impedimento em aberto mais recente da obra, para a faixa do topo.
 *
 * Impedimento nao e aba: aba e lugar aonde alguem precisa IR. Quando a obra
 * parou, isso tem que estar na frente do engenheiro sem ele procurar. Por isso
 * a leitura vive no layout, nao numa pagina.
 *
 * `resolved_in_field` continua contando: o gerente resolveu, mas o engenheiro
 * ainda precisa confirmar o encerramento.
 */
export async function getWorkOpenAlert(
  supabase: SupabaseClient,
  workId: string,
): Promise<WorkOpenAlert | null> {
  const { data, error, count } = await supabase
    .from('work_alerts')
    .select('id, title, severity, status, created_at', { count: 'exact' })
    .eq('work_id', workId)
    .in('status', ['open', 'in_progress', 'resolved_in_field'])
    .order('created_at', { ascending: false })
    .limit(1);

  if (error) {
    // Falha de leitura nao pode virar "nao ha impedimento": e o inverso do que
    // interessa. Sem faixa e sem afirmacao, e o erro sobe pro log.
    console.error('[getWorkOpenAlert] falha ao ler alertas', {
      workId,
      error: error.message,
    });
    return null;
  }

  const row = (data ?? [])[0] as
    | { id: string; title: string; severity: AlertSeverity; status: AlertStatus; created_at: string }
    | undefined;
  if (!row) return null;

  return {
    id: row.id,
    title: row.title,
    severity: row.severity,
    status: row.status,
    createdAt: row.created_at,
    totalOpen: count ?? 1,
  };
}
