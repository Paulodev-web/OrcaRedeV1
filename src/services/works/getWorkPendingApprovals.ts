import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { WorkPendingApprovalsResult } from '@/types/works';

/**
 * Carrega em batch as obras (a partir de uma lista) com diarios pendentes
 * e marcos aguardando aprovacao. Usado na home para categorizar:
 *  - vermelho: diario pending_approval ha mais de 24h
 *  - amarelo:  diario pending_approval ha menos de 24h ou marco awaiting
 *
 * RLS limita a obras onde o usuario e membro.
 */
export async function getWorkPendingApprovals(
  supabase: SupabaseClient,
  workIds: ReadonlyArray<string>,
): Promise<WorkPendingApprovalsResult> {
  if (workIds.length === 0) {
    return { pendingDailyLogs: [], pendingMilestones: [] };
  }

  const [dailyRes, msRes] = await Promise.all([
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

  return { pendingDailyLogs, pendingMilestones };
}
