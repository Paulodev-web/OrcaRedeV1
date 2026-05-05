import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  WorkPendingApprovalsResult,
  PendingChecklistInfo,
  ActiveAlertInfo,
  WorkPendingApprovalsResultExtended,
} from '@/types/works';

/**
 * Carrega em batch as obras (a partir de uma lista) com diarios pendentes,
 * marcos aguardando aprovacao, checklists pendentes e alertas ativos.
 * Usado na home para categorizar:
 *  - vermelho: diario pending_approval ha mais de 24h OU alertas critical
 *  - amarelo:  diario pending_approval ha menos de 24h OU marco awaiting
 *              OU checklists awaiting/returned OU alertas nao-criticos
 *
 * RLS limita a obras onde o usuario e membro.
 */
export async function getWorkPendingApprovals(
  supabase: SupabaseClient,
  workIds: ReadonlyArray<string>,
): Promise<WorkPendingApprovalsResultExtended> {
  if (workIds.length === 0) {
    return { pendingDailyLogs: [], pendingMilestones: [], pendingChecklists: [], activeAlerts: [] };
  }

  const [dailyRes, msRes, checklistRes, alertsRes] = await Promise.all([
    supabase
      .from('work_daily_logs')
      .select('id, work_id, created_at')
      .eq('status', 'pending_approval')
      .in('work_id', workIds as string[]),
    supabase
      .from('work_milestones')
      .select('id, work_id')
      .eq('status', 'awaiting_approval')
      .in('work_id', workIds as string[]),
    supabase
      .from('work_checklists')
      .select('id, work_id, status')
      .in('status', ['awaiting_validation', 'returned'])
      .in('work_id', workIds as string[]),
    supabase
      .from('work_alerts')
      .select('id, work_id, severity, status, created_at')
      .in('status', ['open', 'in_progress', 'resolved_in_field'])
      .in('work_id', workIds as string[]),
  ]);

  const now = Date.now();

  const pendingDailyLogs = ((dailyRes.data ?? []) as Array<{
    id: string;
    work_id: string;
    created_at: string;
  }>).map((row) => {
    const createdAtMs = new Date(row.created_at).getTime();
    const diffMs = Number.isFinite(createdAtMs) ? now - createdAtMs : 0;
    const hoursWaiting = Math.max(0, diffMs / (1000 * 60 * 60));
    return {
      workId: row.work_id,
      dailyLogId: row.id,
      hoursWaiting,
    };
  });

  const pendingMilestones = ((msRes.data ?? []) as Array<{
    id: string;
    work_id: string;
  }>).map((row) => ({
    workId: row.work_id,
    milestoneId: row.id,
  }));

  const checklistsByWork = new Map<string, { count: number; hasReturned: boolean }>();
  for (const row of (checklistRes.data ?? []) as Array<{ work_id: string; status: string }>) {
    const existing = checklistsByWork.get(row.work_id) ?? { count: 0, hasReturned: false };
    existing.count += 1;
    if (row.status === 'returned') existing.hasReturned = true;
    checklistsByWork.set(row.work_id, existing);
  }
  const pendingChecklists: PendingChecklistInfo[] = Array.from(checklistsByWork.entries()).map(
    ([workId, info]) => ({ workId, count: info.count, hasReturned: info.hasReturned }),
  );

  const alertsByWork = new Map<string, { criticalCount: number; totalActiveCount: number; oldestCreatedAt: number }>();
  for (const row of (alertsRes.data ?? []) as Array<{ work_id: string; severity: string; created_at: string }>) {
    const existing = alertsByWork.get(row.work_id) ?? { criticalCount: 0, totalActiveCount: 0, oldestCreatedAt: now };
    existing.totalActiveCount += 1;
    if (row.severity === 'critical') existing.criticalCount += 1;
    const createdMs = new Date(row.created_at).getTime();
    if (Number.isFinite(createdMs) && createdMs < existing.oldestCreatedAt) {
      existing.oldestCreatedAt = createdMs;
    }
    alertsByWork.set(row.work_id, existing);
  }
  const activeAlerts: ActiveAlertInfo[] = Array.from(alertsByWork.entries()).map(
    ([workId, info]) => ({
      workId,
      criticalCount: info.criticalCount,
      totalActiveCount: info.totalActiveCount,
      oldestOpenedHoursAgo: Math.max(0, (now - info.oldestCreatedAt) / (1000 * 60 * 60)),
    }),
  );

  return { pendingDailyLogs, pendingMilestones, pendingChecklists, activeAlerts };
}
