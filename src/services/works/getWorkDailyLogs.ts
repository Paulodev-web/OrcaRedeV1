import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  DAILY_LOG_PAGE_SIZE,
  type DailyLogStatus,
  type GetWorkDailyLogsResult,
  type MaterialConsumed,
  type MetersPlanned,
  type WorkDailyLog,
  type WorkDailyLogMedia,
  type WorkDailyLogRevision,
} from '@/types/works';

interface RawMedia {
  id: string;
  revision_id: string;
  daily_log_id: string;
  work_id: string;
  kind: 'image' | 'video';
  storage_path: string;
  mime_type: string | null;
  size_bytes: number | null;
  width: number | null;
  height: number | null;
  duration_seconds: number | null;
  created_at: string;
}

interface RawRevision {
  id: string;
  daily_log_id: string;
  revision_number: number;
  crew_present: unknown;
  activities: string;
  posts_installed_count: number | null;
  meters_installed: unknown;
  materials_consumed: unknown;
  incidents: string | null;
  rejection_reason: string | null;
  client_event_id: string | null;
  created_at: string;
  work_daily_log_media: RawMedia[] | null;
}

interface RawDailyLog {
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

interface GetWorkDailyLogsOptions {
  /** Cursor: log_date do mais antigo carregado (paginacao reversa). */
  cursor?: string;
  /** Default 20. */
  limit?: number;
}

/**
 * Carrega diarios de uma obra ordenados por log_date DESC.
 * Inclui apenas a current_revision_id de cada diario + suas midias.
 *
 * RLS de work_daily_logs/revisions/media restringe a membros da obra.
 */
export async function getWorkDailyLogs(
  supabase: SupabaseClient,
  workId: string,
  options: GetWorkDailyLogsOptions = {},
): Promise<GetWorkDailyLogsResult> {
  const limit = options.limit ?? DAILY_LOG_PAGE_SIZE;
  const fetchLimit = limit + 1;

  let logsQuery = supabase
    .from('work_daily_logs')
    .select(
      `id, work_id, log_date, published_by, current_revision_id, status,
       approved_by, approved_at, rejected_at, created_at, updated_at`,
    )
    .eq('work_id', workId)
    .order('log_date', { ascending: false })
    .limit(fetchLimit);

  if (options.cursor) {
    logsQuery = logsQuery.lt('log_date', options.cursor);
  }

  const { data: logsData, error: logsErr } = await logsQuery;
  if (logsErr || !logsData) return { items: [], hasMore: false };

  const rawLogs = logsData as unknown as RawDailyLog[];
  const hasMore = rawLogs.length > limit;
  const sliced = hasMore ? rawLogs.slice(0, limit) : rawLogs;

  if (sliced.length === 0) return { items: [], hasMore: false };

  // Buscar revisoes atuais com midia.
  const revisionIds = sliced
    .map((l) => l.current_revision_id)
    .filter((v): v is string => typeof v === 'string' && v.length > 0);

  const revisionMap = new Map<string, WorkDailyLogRevision>();
  if (revisionIds.length > 0) {
    const { data: revData, error: revErr } = await supabase
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
      .in('id', revisionIds);

    if (!revErr && revData) {
      const rawRevs = revData as unknown as RawRevision[];
      for (const r of rawRevs) {
        revisionMap.set(r.id, mapRevision(r));
      }
    }
  }

  const items: WorkDailyLog[] = sliced.map((row) => mapDailyLog(row, revisionMap));
  return { items, hasMore };
}

export function mapDailyLog(
  row: RawDailyLog,
  revisionMap: Map<string, WorkDailyLogRevision>,
): WorkDailyLog {
  const currentRevision =
    row.current_revision_id ? revisionMap.get(row.current_revision_id) ?? null : null;
  return {
    id: row.id,
    workId: row.work_id,
    logDate: row.log_date,
    publishedBy: row.published_by,
    currentRevisionId: row.current_revision_id,
    status: row.status,
    approvedBy: row.approved_by,
    approvedAt: row.approved_at,
    rejectedAt: row.rejected_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    currentRevision,
  };
}

export function mapRevision(row: RawRevision): WorkDailyLogRevision {
  return {
    id: row.id,
    dailyLogId: row.daily_log_id,
    revisionNumber: row.revision_number,
    crewPresent: Array.isArray(row.crew_present) ? (row.crew_present as string[]) : [],
    activities: row.activities,
    postsInstalledCount: row.posts_installed_count,
    metersInstalled: normalizeMeters(row.meters_installed),
    materialsConsumed: normalizeMaterials(row.materials_consumed),
    incidents: row.incidents,
    rejectionReason: row.rejection_reason,
    clientEventId: row.client_event_id,
    createdAt: row.created_at,
    media: (row.work_daily_log_media ?? []).map(mapMedia),
  };
}

export function mapMedia(row: RawMedia): WorkDailyLogMedia {
  return {
    id: row.id,
    revisionId: row.revision_id,
    dailyLogId: row.daily_log_id,
    workId: row.work_id,
    kind: row.kind,
    storagePath: row.storage_path,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    width: row.width,
    height: row.height,
    durationSeconds: row.duration_seconds,
    createdAt: row.created_at,
  };
}

function normalizeMeters(raw: unknown): MetersPlanned {
  const fallback: MetersPlanned = { BT: 0, MT: 0, rede: 0 };
  if (!raw || typeof raw !== 'object') return fallback;
  const obj = raw as Record<string, unknown>;
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
  return {
    BT: num(obj.BT),
    MT: num(obj.MT),
    rede: num(obj.rede),
  };
}

function normalizeMaterials(raw: unknown): MaterialConsumed[] {
  if (!Array.isArray(raw)) return [];
  const out: MaterialConsumed[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const obj = item as Record<string, unknown>;
    const name = typeof obj.name === 'string' ? obj.name : null;
    if (!name) continue;
    const unit = typeof obj.unit === 'string' ? obj.unit : '';
    const quantity = typeof obj.quantity === 'number' ? obj.quantity : 0;
    const materialId = typeof obj.materialId === 'string' ? obj.materialId : null;
    out.push({ materialId, name, unit, quantity });
  }
  return out;
}
