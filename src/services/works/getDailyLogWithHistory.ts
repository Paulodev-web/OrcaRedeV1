import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  DailyLogStatus,
  WorkDailyLogRevision,
  WorkDailyLogWithHistory,
} from '@/types/works';
import { mapMedia, mapRevision } from './getWorkDailyLogs';

interface RawLog {
  id: string;
  work_id: string;
  log_date: string;
  published_by: string;
  current_revision_id: string | null;
  status: DailyLogStatus;
  approved_by: string | null;
  approved_at: string | null;
  rejected_at: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Carrega um diario com TODAS as revisoes (em ordem desc por revision_number)
 * + midias de cada revisao. Usado na tela de detalhe / dialog de historico.
 *
 * Retorna null se diario nao existir ou usuario nao for membro (RLS).
 */
export async function getDailyLogWithHistory(
  supabase: SupabaseClient,
  dailyLogId: string,
): Promise<WorkDailyLogWithHistory | null> {
  const { data: logRow, error: logErr } = await supabase
    .from('work_daily_logs')
    .select(
      `id, work_id, log_date, published_by, current_revision_id, status,
       approved_by, approved_at, rejected_at, created_at, updated_at`,
    )
    .eq('id', dailyLogId)
    .maybeSingle();

  if (logErr || !logRow) return null;
  const log = logRow as unknown as RawLog;

  const { data: revData } = await supabase
    .from('work_daily_log_revisions')
    .select(
      `id, daily_log_id, revision_number, crew_present, activities,
       posts_installed_count, meters_installed, materials_consumed,
       incidents, rejection_reason, client_event_id, created_at,
       work_daily_log_media (
         id, revision_id, daily_log_id, work_id, kind, storage_path,
         mime_type, size_bytes, width, height, duration_seconds, created_at
       )`,
    )
    .eq('daily_log_id', dailyLogId)
    .order('revision_number', { ascending: false });

  const revisions: WorkDailyLogRevision[] = ((revData ?? []) as unknown[])
    .map((row) => mapRevision(row as Parameters<typeof mapRevision>[0]));

  void mapMedia;
  const currentRevision =
    revisions.find((r) => r.id === log.current_revision_id) ?? revisions[0] ?? null;

  return {
    id: log.id,
    workId: log.work_id,
    logDate: log.log_date,
    publishedBy: log.published_by,
    currentRevisionId: log.current_revision_id,
    status: log.status,
    approvedBy: log.approved_by,
    approvedAt: log.approved_at,
    rejectedAt: log.rejected_at,
    createdAt: log.created_at,
    updatedAt: log.updated_at,
    currentRevision,
    revisions,
  };
}
