import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  MetersPlanned,
  MilestoneStatus,
  SCurveDataPoint,
  WorkProgressData,
} from '@/types/works';

const METER_KEYS = ['BT', 'MT', 'rede'] as const;
type MeterKey = (typeof METER_KEYS)[number];

const EMPTY_METERS: MetersPlanned = { BT: 0, MT: 0, rede: 0 };
const ALL_STATUSES: MilestoneStatus[] = [
  'pending',
  'in_progress',
  'awaiting_approval',
  'approved',
  'rejected',
];

interface WorkRow {
  started_at: string | null;
  expected_end_at: string | null;
}

interface SnapshotRow {
  meters_planned: unknown;
}

interface PostRow {
  id: string;
}

interface MilestoneStatusRow {
  status: MilestoneStatus;
}

interface ApprovedDailyLogRow {
  id: string;
  log_date: string;
  current_revision_id: string | null;
}

interface RevisionMetersRow {
  id: string;
  meters_installed: unknown;
}

/**
 * Aggrega dados para a aba Progresso. Tudo em uma unica funcao para
 * minimizar overhead em rede; se ficar lento, dividir/cachear.
 *
 * Estrategia para meters:
 *   - Soma APENAS chaves conhecidas (BT, MT, rede) de meters_installed
 *     dos diarios approved. Chaves "extras" sao silenciosamente ignoradas
 *     no agregado (mas preservadas no banco).
 *
 * S-Curve:
 *   - Eixo X = dias entre started_at e max(today, expected_end_at).
 *   - Linha planejada = linear de (started_at, 0) a (expected_end_at, total).
 *   - Linha realizada = soma cumulativa por dia (somente diarios approved).
 *   - Sem started_at: sCurveData = []. UI mostra mensagem.
 */
export async function getWorkProgressData(
  supabase: SupabaseClient,
  workId: string,
): Promise<WorkProgressData> {
  const [
    workRes,
    snapshotRes,
    postsCountRes,
    milestonesRes,
    approvedLogsRes,
  ] = await Promise.all([
    supabase
      .from('works')
      .select('started_at, expected_end_at')
      .eq('id', workId)
      .maybeSingle(),
    supabase
      .from('work_project_snapshot')
      .select('meters_planned')
      .eq('work_id', workId)
      .maybeSingle(),
    supabase
      .from('work_project_posts')
      .select('id', { count: 'exact', head: true })
      .eq('work_id', workId),
    supabase
      .from('work_milestones')
      .select('status')
      .eq('work_id', workId),
    supabase
      .from('work_daily_logs')
      .select('id, log_date, current_revision_id')
      .eq('work_id', workId)
      .eq('status', 'approved')
      .order('log_date', { ascending: true }),
  ]);

  const work = (workRes.data ?? null) as WorkRow | null;
  const snapshot = (snapshotRes.data ?? null) as SnapshotRow | null;
  const postsPlanned = postsCountRes.count ?? 0;
  const milestoneRows = (milestonesRes.data ?? []) as unknown as MilestoneStatusRow[];
  const approvedLogs = (approvedLogsRes.data ?? []) as unknown as ApprovedDailyLogRow[];

  const planned: MetersPlanned = parseMeters(snapshot?.meters_planned);

  // Buscar revisoes correspondentes para somar meters_installed.
  const revisionIds = approvedLogs
    .map((l) => l.current_revision_id)
    .filter((v): v is string => typeof v === 'string' && v.length > 0);

  const revisionsMap = new Map<string, MetersPlanned>();
  if (revisionIds.length > 0) {
    const { data: revData } = await supabase
      .from('work_daily_log_revisions')
      .select('id, meters_installed')
      .in('id', revisionIds);
    const rows = (revData ?? []) as unknown as RevisionMetersRow[];
    for (const r of rows) {
      revisionsMap.set(r.id, parseMeters(r.meters_installed));
    }
  }

  // Realizado total.
  const realized: MetersPlanned = { ...EMPTY_METERS };
  for (const id of revisionIds) {
    const m = revisionsMap.get(id) ?? EMPTY_METERS;
    realized.BT += m.BT;
    realized.MT += m.MT;
    realized.rede += m.rede;
  }

  // S-Curve por dia.
  const realizedByDate = new Map<string, MetersPlanned>();
  for (const log of approvedLogs) {
    const m = log.current_revision_id
      ? revisionsMap.get(log.current_revision_id) ?? EMPTY_METERS
      : EMPTY_METERS;
    const cur = realizedByDate.get(log.log_date) ?? { ...EMPTY_METERS };
    cur.BT += m.BT;
    cur.MT += m.MT;
    cur.rede += m.rede;
    realizedByDate.set(log.log_date, cur);
  }

  const totalPlanned = planned.BT + planned.MT + planned.rede;
  const totalRealized = realized.BT + realized.MT + realized.rede;

  const startedAt = work?.started_at ?? null;
  const expectedEndAt = work?.expected_end_at ?? null;
  const sCurveData = buildSCurve(startedAt, expectedEndAt, totalPlanned, realizedByDate);

  // Contagem de marcos por status.
  const milestonesCounts: Record<MilestoneStatus, number> = {
    pending: 0,
    in_progress: 0,
    awaiting_approval: 0,
    approved: 0,
    rejected: 0,
  };
  for (const m of milestoneRows) {
    if (ALL_STATUSES.includes(m.status)) {
      milestonesCounts[m.status] = (milestonesCounts[m.status] ?? 0) + 1;
    }
  }

  return {
    postsPlanned,
    postsInstalled: 0, // Bloco 7 vai popular via work_pole_installations
    metersByCategory: {
      planned,
      realized,
    },
    milestonesCounts,
    sCurveData,
    startedAt,
    expectedEndAt,
    totalMetersPlanned: totalPlanned,
    totalMetersRealized: totalRealized,
  };
}

function parseMeters(value: unknown): MetersPlanned {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ...EMPTY_METERS };
  }
  const obj = value as Record<string, unknown>;
  const out: MetersPlanned = { ...EMPTY_METERS };
  for (const key of METER_KEYS) {
    const v = obj[key];
    if (typeof v === 'number' && Number.isFinite(v)) {
      out[key as MeterKey] = v;
    } else if (typeof v === 'string') {
      const n = Number(v);
      if (Number.isFinite(n)) out[key as MeterKey] = n;
    }
  }
  return out;
}

function buildSCurve(
  startedAt: string | null,
  expectedEndAt: string | null,
  totalPlanned: number,
  realizedByDate: Map<string, MetersPlanned>,
): SCurveDataPoint[] {
  if (!startedAt) return [];

  const start = parseDate(startedAt);
  if (!start) return [];

  const today = startOfDayUTC(new Date());
  // Limite final = max(today, expected_end_at) para mostrar projecao planejada.
  const end = expectedEndAt
    ? maxDate(today, parseDate(expectedEndAt) ?? today)
    : today;

  if (end.getTime() < start.getTime()) {
    // started_at no futuro: retorna vazio. UI trata.
    return [];
  }

  const points: SCurveDataPoint[] = [];
  const totalDays = daysBetween(start, end);
  const plannedDuration = expectedEndAt
    ? Math.max(daysBetween(start, parseDate(expectedEndAt) ?? start), 1)
    : Math.max(totalDays, 30); // fallback 30 dias

  let cumulativeRealized = 0;
  for (let i = 0; i <= totalDays; i += 1) {
    const dt = addDays(start, i);
    const iso = toIsoDate(dt);
    const m = realizedByDate.get(iso);
    if (m) {
      cumulativeRealized += m.BT + m.MT + m.rede;
    }
    const fraction = plannedDuration > 0 ? Math.min(i / plannedDuration, 1) : 0;
    const plannedCumulative = totalPlanned * fraction;
    points.push({
      date: iso,
      plannedCumulative,
      realizedCumulative: cumulativeRealized,
    });
  }

  return points;
}

function parseDate(s: string): Date | null {
  // s no formato YYYY-MM-DD (DATE no Postgres).
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (Number.isNaN(dt.getTime())) return null;
  return dt;
}

function startOfDayUTC(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 24 * 60 * 60 * 1000);
}

function daysBetween(a: Date, b: Date): number {
  return Math.floor((b.getTime() - a.getTime()) / (24 * 60 * 60 * 1000));
}

function maxDate(a: Date, b: Date): Date {
  return a.getTime() >= b.getTime() ? a : b;
}

function toIsoDate(d: Date): string {
  const y = d.getUTCFullYear();
  const mo = String(d.getUTCMonth() + 1).padStart(2, '0');
  const da = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${mo}-${da}`;
}
