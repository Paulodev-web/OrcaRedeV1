'use server';

import { revalidatePath } from 'next/cache';
import { ensureMember } from '@/lib/auth/ensureMember';
import {
  createSupabaseServerClient,
  createSupabaseServiceRoleClient,
  requireAuthUserId,
} from '@/lib/supabaseServer';
import { getDailyLogWithHistory } from '@/services/works/getDailyLogWithHistory';
import { getDailyLogSignedUrls } from '@/services/works/getDailyLogSignedUrls';
import {
  DAILY_LOG_ACTIVITIES_MIN,
  DAILY_LOG_ACTIVITIES_MAX,
  DAILY_LOG_MEDIA_LIMITS,
  DAILY_LOG_REJECTION_REASON_MIN,
  DAILY_LOG_REJECTION_REASON_MAX,
  type ActionResult,
  type DailyLogMediaUploadInfo,
  type GetUploadUrlForDailyLogMediaInput,
  type PublishDailyLogInput,
  type PublishDailyLogResult,
  type WorkDailyLogWithHistory,
} from '@/types/works';

const ANDAMENTO_OBRA_BUCKET = 'andamento-obra';
const WORKS_PATH = '/tools/andamento-obra';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function generateUuid(): string {
  return globalThis.crypto.randomUUID();
}

function inferExtension(fileName: string, mimeType: string | undefined, kind: 'image' | 'video'): string {
  const lastDot = fileName.lastIndexOf('.');
  if (lastDot > 0) {
    const ext = fileName.slice(lastDot + 1).toLowerCase().replace(/[^a-z0-9]+/g, '');
    if (ext.length > 0 && ext.length <= 10) return ext;
  }
  if (mimeType) {
    const subtype = mimeType.split('/')[1]?.toLowerCase().replace(/[^a-z0-9]+/g, '') ?? '';
    if (subtype.length > 0 && subtype.length <= 10) return subtype;
  }
  return kind === 'image' ? 'jpg' : 'mp4';
}

function capitalize(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Hoje em America/Sao_Paulo no formato YYYY-MM-DD para comparacao com log_date. */
function todayInSP(): string {
  const now = new Date();
  const tz = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  // en-CA returns YYYY-MM-DD already.
  return tz;
}

/**
 * Gera URL assinada de upload para midia de revisao de diario.
 *
 * Path: {workId}/daily-logs/{dailyLogId}/{revisionId}/{uuid}.{ext}
 *
 * Politica do bucket exige role='manager' membro da obra (ver migration 6).
 */
export async function getUploadUrlForDailyLogMedia(
  input: GetUploadUrlForDailyLogMediaInput,
): Promise<ActionResult<DailyLogMediaUploadInfo>> {
  const gate = await ensureMember(input.workId);
  if (!gate.ok) return { success: false, error: gate.error };
  if (gate.role !== 'manager') {
    return { success: false, error: 'Apenas o gerente pode publicar diarios.' };
  }

  if (input.kind !== 'image' && input.kind !== 'video') {
    return { success: false, error: 'Tipo de midia invalido.' };
  }
  const limits = DAILY_LOG_MEDIA_LIMITS[input.kind];

  if (!Number.isFinite(input.sizeBytes) || input.sizeBytes <= 0) {
    return { success: false, error: 'Tamanho do arquivo invalido.' };
  }
  if (input.sizeBytes > limits.maxBytes) {
    const maxMb = Math.round(limits.maxBytes / (1024 * 1024));
    return { success: false, error: `${capitalize(limits.label)} excede ${maxMb} MB.` };
  }
  if (input.mimeType && !input.mimeType.startsWith(limits.mimePrefix)) {
    return { success: false, error: `Tipo MIME nao compativel com ${limits.label}.` };
  }
  if (!UUID_RE.test(input.dailyLogId) || !UUID_RE.test(input.revisionId)) {
    return { success: false, error: 'IDs invalidos.' };
  }

  const fileName = (input.fileName ?? '').trim();
  if (fileName.length === 0) {
    return { success: false, error: 'Nome do arquivo invalido.' };
  }

  const fileId = generateUuid();
  const ext = inferExtension(fileName, input.mimeType, input.kind);
  const storagePath = `${input.workId}/daily-logs/${input.dailyLogId}/${input.revisionId}/${fileId}.${ext}`;

  const serviceRole = createSupabaseServiceRoleClient();
  const { data, error } = await serviceRole.storage
    .from(ANDAMENTO_OBRA_BUCKET)
    .createSignedUploadUrl(storagePath);

  if (error || !data) {
    return { success: false, error: error?.message ?? 'Falha ao gerar URL de upload.' };
  }

  return {
    success: true,
    data: {
      uploadUrl: data.signedUrl,
      uploadToken: data.token,
      storagePath,
    },
  };
}

/**
 * Publica um novo diario de obra (manager).
 *
 * Regras:
 *  - role = manager
 *  - activities entre 10 e 4000 chars
 *  - logDate <= hoje (America/Sao_Paulo)
 *  - Se ja existe diario na data:
 *      - rejected: cria revision_number = max+1 e atualiza ponteiro/status
 *      - pending_approval ou approved: erro (terminal/em revisao)
 *  - Idempotencia: clientEventId existente em revisoes => retorna a revisao
 */
export async function publishDailyLog(
  input: PublishDailyLogInput,
): Promise<ActionResult<PublishDailyLogResult>> {
  const gate = await ensureMember(input.workId);
  if (!gate.ok) return { success: false, error: gate.error };
  if (gate.role !== 'manager') {
    return { success: false, error: 'Apenas o gerente publica diarios.' };
  }

  const activities = (input.activities ?? '').trim();
  if (activities.length < DAILY_LOG_ACTIVITIES_MIN) {
    return {
      success: false,
      error: `Descreva as atividades (minimo ${DAILY_LOG_ACTIVITIES_MIN} caracteres).`,
    };
  }
  if (activities.length > DAILY_LOG_ACTIVITIES_MAX) {
    return {
      success: false,
      error: `Atividades muito longas (maximo ${DAILY_LOG_ACTIVITIES_MAX} caracteres).`,
    };
  }

  const logDate = (input.logDate ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(logDate)) {
    return { success: false, error: 'Data invalida.' };
  }
  if (logDate > todayInSP()) {
    return { success: false, error: 'Nao e possivel publicar diario com data futura.' };
  }

  // Idempotencia inicial.
  const clientEventId =
    input.clientEventId && UUID_RE.test(input.clientEventId) ? input.clientEventId : null;
  if (clientEventId) {
    const { data: existingRev } = await gate.supabase
      .from('work_daily_log_revisions')
      .select('id, daily_log_id, revision_number')
      .eq('client_event_id', clientEventId)
      .maybeSingle();
    if (existingRev) {
      return {
        success: true,
        data: {
          dailyLogId: existingRev.daily_log_id as string,
          revisionId: existingRev.id as string,
          revisionNumber: existingRev.revision_number as number,
        },
      };
    }
  }

  // Verifica se ja existe diario nesta data.
  const { data: existingLog, error: existingErr } = await gate.supabase
    .from('work_daily_logs')
    .select('id, status')
    .eq('work_id', input.workId)
    .eq('log_date', logDate)
    .maybeSingle();

  if (existingErr) {
    return { success: false, error: existingErr.message };
  }

  // Normaliza payload de revisao.
  const crewPresent = Array.isArray(input.crewPresent) ? input.crewPresent : [];
  const metersInstalled = input.metersInstalled ?? {};
  const materialsConsumed = Array.isArray(input.materialsConsumed)
    ? input.materialsConsumed
    : [];
  const incidents = input.incidents ? input.incidents.trim() : null;
  const postsInstalledCount =
    typeof input.postsInstalledCount === 'number' && input.postsInstalledCount >= 0
      ? Math.floor(input.postsInstalledCount)
      : null;

  // Validacao basica de mediaPaths.
  const media = Array.isArray(input.media) ? input.media : [];
  for (const m of media) {
    if (m.kind !== 'image' && m.kind !== 'video') {
      return { success: false, error: 'Tipo de midia invalido.' };
    }
    if (!m.storagePath || !m.storagePath.startsWith(`${input.workId}/daily-logs/`)) {
      return { success: false, error: 'Path de midia fora da obra.' };
    }
    const limits = DAILY_LOG_MEDIA_LIMITS[m.kind];
    if (m.mimeType && !m.mimeType.startsWith(limits.mimePrefix)) {
      return { success: false, error: `MIME incompativel com ${limits.label}.` };
    }
    if (typeof m.sizeBytes === 'number' && m.sizeBytes > limits.maxBytes) {
      const maxMb = Math.round(limits.maxBytes / (1024 * 1024));
      return { success: false, error: `${capitalize(limits.label)} excede ${maxMb} MB.` };
    }
  }

  let dailyLogId: string;
  let isRepublication = false;

  if (existingLog) {
    if (existingLog.status === 'pending_approval') {
      return {
        success: false,
        error: 'Ja existe diario aguardando aprovacao para esta data.',
      };
    }
    if (existingLog.status === 'approved') {
      return { success: false, error: 'Ja existe diario aprovado para esta data.' };
    }
    // rejected -> republica
    dailyLogId = existingLog.id as string;
    isRepublication = true;
  } else {
    dailyLogId = generateUuid();
    const { error: insertLogErr } = await gate.supabase
      .from('work_daily_logs')
      .insert({
        id: dailyLogId,
        work_id: input.workId,
        log_date: logDate,
        published_by: gate.userId,
        status: 'pending_approval',
      });
    if (insertLogErr) {
      return { success: false, error: insertLogErr.message };
    }
  }

  // Calcular proximo revision_number.
  let nextRevisionNumber = 1;
  if (isRepublication) {
    const { data: maxRow } = await gate.supabase
      .from('work_daily_log_revisions')
      .select('revision_number')
      .eq('daily_log_id', dailyLogId)
      .order('revision_number', { ascending: false })
      .limit(1)
      .maybeSingle();
    nextRevisionNumber = ((maxRow?.revision_number as number | undefined) ?? 0) + 1;
  }

  const revisionId = generateUuid();
  const { error: insertRevErr } = await gate.supabase
    .from('work_daily_log_revisions')
    .insert({
      id: revisionId,
      daily_log_id: dailyLogId,
      revision_number: nextRevisionNumber,
      crew_present: crewPresent,
      activities,
      posts_installed_count: postsInstalledCount,
      meters_installed: metersInstalled,
      materials_consumed: materialsConsumed,
      incidents,
      client_event_id: clientEventId,
    });
  if (insertRevErr) {
    return { success: false, error: insertRevErr.message };
  }

  // Atualizar diario: ponteiro e status.
  if (isRepublication) {
    const { error: updErr } = await gate.supabase
      .from('work_daily_logs')
      .update({
        current_revision_id: revisionId,
        status: 'pending_approval',
        rejected_at: null,
        approved_by: null,
        approved_at: null,
      })
      .eq('id', dailyLogId);
    if (updErr) {
      return { success: false, error: `Diario republicado parcialmente: ${updErr.message}` };
    }
  } else {
    // Primeira publicacao: atualizar current_revision_id.
    const { error: updErr } = await gate.supabase
      .from('work_daily_logs')
      .update({ current_revision_id: revisionId })
      .eq('id', dailyLogId);
    if (updErr) {
      return { success: false, error: `Falha ao definir revisao atual: ${updErr.message}` };
    }
  }

  // Insere midias (se houver).
  if (media.length > 0) {
    const rows = media.map((m) => ({
      revision_id: revisionId,
      daily_log_id: dailyLogId,
      work_id: input.workId,
      kind: m.kind,
      storage_path: m.storagePath,
      mime_type: m.mimeType ?? null,
      size_bytes: typeof m.sizeBytes === 'number' && m.sizeBytes > 0 ? m.sizeBytes : null,
      width: typeof m.width === 'number' && m.width > 0 ? m.width : null,
      height: typeof m.height === 'number' && m.height > 0 ? m.height : null,
      duration_seconds:
        typeof m.durationSeconds === 'number' && m.durationSeconds > 0
          ? m.durationSeconds
          : null,
    }));
    const { error: mediaErr } = await gate.supabase
      .from('work_daily_log_media')
      .insert(rows);
    if (mediaErr) {
      return {
        success: false,
        error: `Diario publicado, mas falha ao salvar midias: ${mediaErr.message}`,
      };
    }
  }

  revalidatePath(WORKS_PATH);
  revalidatePath(`${WORKS_PATH}/obras/${input.workId}/diario`);

  return {
    success: true,
    data: {
      dailyLogId,
      revisionId,
      revisionNumber: nextRevisionNumber,
    },
  };
}

/**
 * Aprova um diario pendente. Apenas engineer membro.
 */
export async function approveDailyLog(input: {
  dailyLogId: string;
  comment?: string;
}): Promise<ActionResult> {
  if (!input.dailyLogId || !UUID_RE.test(input.dailyLogId)) {
    return { success: false, error: 'ID de diario invalido.' };
  }

  const supabase = await createSupabaseServerClient();
  let userId: string;
  try {
    userId = await requireAuthUserId(supabase);
  } catch {
    return { success: false, error: 'Sessao expirada. Faca login novamente.' };
  }

  const { data: log, error: logErr } = await supabase
    .from('work_daily_logs')
    .select('id, work_id, status')
    .eq('id', input.dailyLogId)
    .maybeSingle();

  if (logErr) return { success: false, error: logErr.message };
  if (!log) return { success: false, error: 'Diario nao encontrado.' };

  const { data: member } = await supabase
    .from('work_members')
    .select('role')
    .eq('work_id', log.work_id as string)
    .eq('user_id', userId)
    .maybeSingle();
  if (!member || member.role !== 'engineer') {
    return { success: false, error: 'Apenas o engenheiro pode aprovar diarios.' };
  }

  if (log.status !== 'pending_approval') {
    return {
      success: false,
      error: `Diario nao esta aguardando aprovacao (status: ${log.status as string}).`,
    };
  }

  const nowIso = new Date().toISOString();
  const { error: updErr } = await supabase
    .from('work_daily_logs')
    .update({
      status: 'approved',
      approved_by: userId,
      approved_at: nowIso,
    })
    .eq('id', input.dailyLogId);

  if (updErr) {
    return { success: false, error: updErr.message };
  }

  revalidatePath(WORKS_PATH);
  revalidatePath(`${WORKS_PATH}/obras/${log.work_id as string}/diario`);
  revalidatePath(`${WORKS_PATH}/obras/${log.work_id as string}/visao-geral`);

  return { success: true };
}

/**
 * Rejeita um diario pendente com motivo. Apenas engineer membro.
 *
 * Persiste o motivo em work_daily_log_revisions.rejection_reason da
 * revisao atual (current_revision_id), conforme decidido no plano.
 */
export async function rejectDailyLog(input: {
  dailyLogId: string;
  reason: string;
}): Promise<ActionResult> {
  if (!input.dailyLogId || !UUID_RE.test(input.dailyLogId)) {
    return { success: false, error: 'ID de diario invalido.' };
  }
  const reason = (input.reason ?? '').trim();
  if (reason.length < DAILY_LOG_REJECTION_REASON_MIN) {
    return {
      success: false,
      error: `Informe o motivo da rejeicao (minimo ${DAILY_LOG_REJECTION_REASON_MIN} caracteres).`,
    };
  }
  if (reason.length > DAILY_LOG_REJECTION_REASON_MAX) {
    return {
      success: false,
      error: `Motivo muito longo (maximo ${DAILY_LOG_REJECTION_REASON_MAX} caracteres).`,
    };
  }

  const supabase = await createSupabaseServerClient();
  let userId: string;
  try {
    userId = await requireAuthUserId(supabase);
  } catch {
    return { success: false, error: 'Sessao expirada. Faca login novamente.' };
  }

  const { data: log, error: logErr } = await supabase
    .from('work_daily_logs')
    .select('id, work_id, status, current_revision_id')
    .eq('id', input.dailyLogId)
    .maybeSingle();

  if (logErr) return { success: false, error: logErr.message };
  if (!log) return { success: false, error: 'Diario nao encontrado.' };

  const { data: member } = await supabase
    .from('work_members')
    .select('role')
    .eq('work_id', log.work_id as string)
    .eq('user_id', userId)
    .maybeSingle();
  if (!member || member.role !== 'engineer') {
    return { success: false, error: 'Apenas o engenheiro pode rejeitar diarios.' };
  }

  if (log.status !== 'pending_approval') {
    return {
      success: false,
      error: `Diario nao esta aguardando aprovacao (status: ${log.status as string}).`,
    };
  }

  // Salvar motivo na revisao atual via service role (revisoes sao imutaveis
  // para authenticated, mas a coluna rejection_reason e editavel via admin
  // path apenas no momento da rejeicao). Optamos por permitir esse update
  // via service role exclusivamente neste fluxo.
  const serviceRole = createSupabaseServiceRoleClient();
  if (log.current_revision_id) {
    const { error: revErr } = await serviceRole
      .from('work_daily_log_revisions')
      .update({ rejection_reason: reason })
      .eq('id', log.current_revision_id as string);
    if (revErr) {
      return { success: false, error: `Falha ao registrar motivo: ${revErr.message}` };
    }
  }

  const nowIso = new Date().toISOString();
  const { error: updErr } = await supabase
    .from('work_daily_logs')
    .update({
      status: 'rejected',
      rejected_at: nowIso,
    })
    .eq('id', input.dailyLogId);

  if (updErr) {
    return { success: false, error: updErr.message };
  }

  revalidatePath(WORKS_PATH);
  revalidatePath(`${WORKS_PATH}/obras/${log.work_id as string}/diario`);

  return { success: true };
}

/**
 * Carrega diarios mais antigos (paginacao reversa por log_date).
 * Inclui signed URLs das midias.
 */
export async function getOlderDailyLogs(
  workId: string,
  cursor: string,
): Promise<ActionResult<{ items: import('@/types/works').WorkDailyLog[]; hasMore: boolean; signedUrls: Record<string, string> }>> {
  if (!workId) return { success: false, error: 'Obra invalida.' };

  const supabase = await createSupabaseServerClient();
  try {
    await requireAuthUserId(supabase);
  } catch {
    return { success: false, error: 'Sessao expirada. Faca login novamente.' };
  }

  const { getWorkDailyLogs } = await import('@/services/works/getWorkDailyLogs');
  const { items, hasMore } = await getWorkDailyLogs(supabase, workId, { cursor });

  const paths = items.flatMap((log) =>
    log.currentRevision ? log.currentRevision.media.map((m) => m.storagePath) : [],
  );
  const signedUrls = await getDailyLogSignedUrls(paths);

  return { success: true, data: { items, hasMore, signedUrls } };
}

interface DailyLogWithHistoryWithUrls {
  history: WorkDailyLogWithHistory;
  signedUrls: Record<string, string>;
}

/**
 * Carrega historico completo de um diario com URLs assinadas das midias.
 * Usado pelo dialog de historico no client.
 *
 * RLS de work_daily_logs garante que so membros leem; URLs assinadas usam
 * service role com TTL 30 min.
 */
export async function loadDailyLogHistory(
  dailyLogId: string,
): Promise<ActionResult<DailyLogWithHistoryWithUrls>> {
  if (!dailyLogId || !UUID_RE.test(dailyLogId)) {
    return { success: false, error: 'ID de diario invalido.' };
  }

  const supabase = await createSupabaseServerClient();
  try {
    await requireAuthUserId(supabase);
  } catch {
    return { success: false, error: 'Sessao expirada. Faca login novamente.' };
  }

  const history = await getDailyLogWithHistory(supabase, dailyLogId);
  if (!history) {
    return { success: false, error: 'Diario nao encontrado.' };
  }

  const paths = history.revisions.flatMap((r) => r.media.map((m) => m.storagePath));
  const signedUrls = await getDailyLogSignedUrls(paths);

  return { success: true, data: { history, signedUrls } };
}
