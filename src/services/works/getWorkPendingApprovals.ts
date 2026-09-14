import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

export interface PendingMilestoneInfo {
  workId: string;
  milestoneId: string;
}

export interface ActiveAlertInfo {
  workId: string;
  /** Impedimentos com severidade `critical` ou `high`. */
  gravesCount: number;
  /** Tudo que ainda não foi encerrado, inclusive o já resolvido em campo. */
  totalActiveCount: number;
  /** Resolvidos em campo, esperando o engenheiro confirmar o encerramento. */
  resolvidosCount: number;
  oldestOpenedHoursAgo: number;
}

export interface WorkAttentionSignals {
  pendingMilestones: PendingMilestoneInfo[];
  activeAlerts: ActiveAlertInfo[];
}

/**
 * O que, em cada obra, espera uma decisao do engenheiro.
 *
 * Sao duas coisas agora: marco aguardando aprovacao e impedimento em aberto.
 * Antes daqui eram quatro, e as outras duas (diario `pending_approval` e
 * checklist `awaiting_validation`/`returned`) deixaram de existir como fluxo:
 * o diario virou leitura automatica e o checklist saiu do produto. Continuavam
 * sendo duas consultas em toda carga da home, sempre devolvendo vazio.
 *
 * RLS limita a obras onde o usuario e membro.
 */
export async function getWorkPendingApprovals(
  supabase: SupabaseClient,
  workIds: ReadonlyArray<string>,
): Promise<WorkAttentionSignals> {
  if (workIds.length === 0) {
    return { pendingMilestones: [], activeAlerts: [] };
  }

  const ids = workIds as string[];
  const [msRes, alertsRes] = await Promise.all([
    supabase
      .from('work_milestones')
      .select('id, work_id')
      .eq('status', 'awaiting_approval')
      .in('work_id', ids),
    supabase
      .from('work_alerts')
      .select('id, work_id, severity, status, created_at')
      .in('status', ['open', 'in_progress', 'resolved_in_field'])
      .in('work_id', ids),
  ]);

  const now = Date.now();

  const pendingMilestones: PendingMilestoneInfo[] = (
    (msRes.data ?? []) as Array<{ id: string; work_id: string }>
  ).map((row) => ({ workId: row.work_id, milestoneId: row.id }));

  const alertsByWork = new Map<
    string,
    { gravesCount: number; totalActiveCount: number; resolvidosCount: number; oldestCreatedAt: number }
  >();

  for (const row of (alertsRes.data ?? []) as Array<{
    work_id: string;
    severity: string;
    status: string;
    created_at: string;
  }>) {
    const atual = alertsByWork.get(row.work_id) ?? {
      gravesCount: 0,
      totalActiveCount: 0,
      resolvidosCount: 0,
      oldestCreatedAt: now,
    };
    atual.totalActiveCount += 1;
    if (row.status === 'resolved_in_field') {
      atual.resolvidosCount += 1;
    } else if (row.severity === 'critical' || row.severity === 'high') {
      // Severidade existe para ser usada. Falta de luva e obra parada nao podem
      // acender a mesma cor.
      atual.gravesCount += 1;
    }
    const createdMs = new Date(row.created_at).getTime();
    if (Number.isFinite(createdMs) && createdMs < atual.oldestCreatedAt) {
      atual.oldestCreatedAt = createdMs;
    }
    alertsByWork.set(row.work_id, atual);
  }

  const activeAlerts: ActiveAlertInfo[] = Array.from(alertsByWork.entries()).map(
    ([workId, info]) => ({
      workId,
      gravesCount: info.gravesCount,
      totalActiveCount: info.totalActiveCount,
      resolvidosCount: info.resolvidosCount,
      oldestOpenedHoursAgo: Math.max(0, (now - info.oldestCreatedAt) / (1000 * 60 * 60)),
    }),
  );

  return { pendingMilestones, activeAlerts };
}
