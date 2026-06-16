'use server';

import { revalidatePath } from 'next/cache';
import { ensureMember } from '@/lib/auth/ensureMember';
import {
  createSupabaseServerClient,
  createSupabaseServiceRoleClient,
  requireAuthUserId,
} from '@/lib/supabaseServer';
import { getDailyLogSignedUrls } from '@/services/works/getDailyLogSignedUrls';
import { getMilestoneFullHistory } from '@/services/works/getMilestoneFullHistory';
import {
  DAILY_LOG_MEDIA_LIMITS,
  MILESTONE_NOTES_MAX,
  MILESTONE_REJECTION_REASON_MAX,
  MILESTONE_REJECTION_REASON_MIN,
  type ActionResult,
  type GetUploadUrlForMilestoneEvidenceInput,
  type MilestoneEvidenceUploadInfo,
  type MilestoneFullHistory,
  type ReportMilestoneInput,
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

/**
 * Gera URL assinada de upload para evidencia de marco.
 *
 * Path: {workId}/milestones/{milestoneId}/{eventId}/{uuid}.{ext}
 *
 * O eventId e gerado AQUI (action de upload) e devolvido para o caller
 * passar em reportMilestone via array `media`. Isso permite criacao
 * atomica do evento + media references mesmo apos uploads paralelos.
 */
export async function getUploadUrlForMilestoneEvidence(
  input: GetUploadUrlForMilestoneEvidenceInput,
): Promise<ActionResult<MilestoneEvidenceUploadInfo>> {
  const gate = await ensureMember(input.workId);
  if (!gate.ok) return { success: false, error: gate.error };
  if (gate.role !== 'manager') {
    return { success: false, error: 'Apenas o gerente reporta marcos.' };
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
  if (!UUID_RE.test(input.milestoneId)) {
    return { success: false, error: 'ID de marco invalido.' };
  }

  const eventId = input.eventId && UUID_RE.test(input.eventId) ? input.eventId : generateUuid();
  const fileId = generateUuid();
  const ext = inferExtension(input.fileName ?? '', input.mimeType, input.kind);
  const storagePath = `${input.workId}/milestones/${input.milestoneId}/${eventId}/${fileId}.${ext}`;

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
      eventId,
    },
  };
}

/**
 * Manager reporta conclusao de marco. Apenas para status atual em
 * pending|in_progress|rejected. Cria 1 work_milestone_events com
 * event_type='reported' e N work_milestone_event_media (ate 1 por path).
 *
 * Idempotencia: se clientEventId ja existe em work_milestone_events,
 * retorna o evento existente SEM repetir o UPDATE no marco.
 */
export async function reportMilestone(
  input: ReportMilestoneInput,
): Promise<ActionResult<{ eventId: string }>> {
  if (!input.milestoneId || !UUID_RE.test(input.milestoneId)) {
    return { success: false, error: 'ID de marco invalido.' };
  }

  const supabase = await createSupabaseServerClient();
  let userId: string;
  try {
    userId = await requireAuthUserId(supabase);
  } catch {
    return { success: false, error: 'Sessao expirada. Faca login novamente.' };
  }

  const { data: milestone, error: msErr } = await supabase
    .from('work_milestones')
    .select('id, work_id, status, evidence_media_ids')
    .eq('id', input.milestoneId)
    .maybeSingle();

  if (msErr) return { success: false, error: msErr.message };
  if (!milestone) return { success: false, error: 'Marco nao encontrado.' };

  const workId = milestone.work_id as string;
  const gate = await ensureMember(workId);
  if (!gate.ok) return { success: false, error: gate.error };
  if (gate.role !== 'manager') {
    return { success: false, error: 'Apenas o gerente reporta marcos.' };
  }

  const status = milestone.status as string;
  if (!['pending', 'in_progress', 'rejected'].includes(status)) {
    return {
      success: false,
      error: `Marco com status "${status}" nao pode ser reportado.`,
    };
  }

  const notes = input.notes ? input.notes.trim() : null;
  if (notes && notes.length > MILESTONE_NOTES_MAX) {
    return {
      success: false,
      error: `Observacoes muito longas (maximo ${MILESTONE_NOTES_MAX} caracteres).`,
    };
  }

  const clientEventId =
    input.clientEventId && UUID_RE.test(input.clientEventId) ? input.clientEventId : null;

  // Idempotencia: ANTES do UPDATE, checa se evento existente.
  if (clientEventId) {
    const { data: existing } = await supabase
      .from('work_milestone_events')
      .select('id')
      .eq('client_event_id', clientEventId)
      .maybeSingle();
    if (existing && existing.id) {
      return { success: true, data: { eventId: existing.id as string } };
    }
  }

  const media = Array.isArray(input.media) ? input.media : [];
  // Determina o eventId a partir dos paths de midia (todos devem usar o mesmo
  // eventId se o caller seguiu o fluxo com getUploadUrlForMilestoneEvidence).
  let eventId: string;
  if (media.length > 0) {
    const ids = new Set(media.map((m) => m.eventId));
    if (ids.size !== 1) {
      return {
        success: false,
        error: 'Inconsistencia: midias com event_id diferentes.',
      };
    }
    const single = Array.from(ids)[0];
    if (!UUID_RE.test(single)) {
      return { success: false, error: 'ID de evento invalido nas midias.' };
    }
    eventId = single;
  } else {
    eventId = generateUuid();
  }

  // Validar paths de midia.
  for (const m of media) {
    if (m.kind !== 'image' && m.kind !== 'video') {
      return { success: false, error: 'Tipo de midia invalido.' };
    }
    if (!m.storagePath || !m.storagePath.startsWith(`${workId}/milestones/`)) {
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

  // 1) UPDATE no marco com nova status awaiting_approval + reported_*.
  const nowIso = new Date().toISOString();
  const existingIds = Array.isArray(milestone.evidence_media_ids)
    ? (milestone.evidence_media_ids as string[])
    : [];
  const newEvidenceIds = [...existingIds, ...(media.length > 0 ? [eventId] : [])];

  const updatePayload: Record<string, unknown> = {
    status: 'awaiting_approval',
    reported_by: userId,
    reported_at: nowIso,
    notes,
    evidence_media_ids: newEvidenceIds,
  };
  // Limpar campos de approval se vinha de rejected.
  if (status === 'rejected') {
    updatePayload.approved_by = null;
    updatePayload.approved_at = null;
  }

  const { error: updErr } = await supabase
    .from('work_milestones')
    .update(updatePayload)
    .eq('id', input.milestoneId);

  if (updErr) {
    return { success: false, error: updErr.message };
  }

  // 2) INSERT em work_milestone_events.
  const { error: evErr } = await supabase
    .from('work_milestone_events')
    .insert({
      id: eventId,
      milestone_id: input.milestoneId,
      work_id: workId,
      event_type: 'reported',
      actor_id: userId,
      actor_role: 'manager',
      notes,
      client_event_id: clientEventId,
    });

  if (evErr) {
    return {
      success: false,
      error: `Marco atualizado, mas falha ao registrar evento: ${evErr.message}`,
    };
  }

  // 3) INSERT em work_milestone_event_media.
  if (media.length > 0) {
    const rows = media.map((m) => ({
      event_id: eventId,
      milestone_id: input.milestoneId,
      work_id: workId,
      kind: m.kind,
      storage_path: m.storagePath,
      mime_type: m.mimeType ?? null,
      size_bytes: typeof m.sizeBytes === 'number' && m.sizeBytes > 0 ? m.sizeBytes : null,
      width: typeof m.width === 'number' && m.width > 0 ? m.width : null,
      height: typeof m.height === 'number' && m.height > 0 ? m.height : null,
    }));
    const { error: mediaErr } = await supabase
      .from('work_milestone_event_media')
      .insert(rows);
    if (mediaErr) {
      return {
        success: false,
        error: `Marco reportado, mas falha ao salvar midias: ${mediaErr.message}`,
      };
    }
  }

  revalidatePath(WORKS_PATH);
  revalidatePath(`${WORKS_PATH}/obras/${workId}/progresso`);
  revalidatePath(`${WORKS_PATH}/obras/${workId}/visao-geral`);

  return { success: true, data: { eventId } };
}

/**
 * Engineer aprova marco em awaiting_approval.
 */
export async function approveMilestone(input: {
  milestoneId: string;
  comment?: string;
}): Promise<ActionResult> {
  if (!input.milestoneId || !UUID_RE.test(input.milestoneId)) {
    return { success: false, error: 'ID de marco invalido.' };
  }

  const supabase = await createSupabaseServerClient();
  let userId: string;
  try {
    userId = await requireAuthUserId(supabase);
  } catch {
    return { success: false, error: 'Sessao expirada. Faca login novamente.' };
  }

  const { data: milestone, error: msErr } = await supabase
    .from('work_milestones')
    .select('id, work_id, status')
    .eq('id', input.milestoneId)
    .maybeSingle();

  if (msErr) return { success: false, error: msErr.message };
  if (!milestone) return { success: false, error: 'Marco nao encontrado.' };

  const workId = milestone.work_id as string;
  const { data: member } = await supabase
    .from('work_members')
    .select('role')
    .eq('work_id', workId)
    .eq('user_id', userId)
    .maybeSingle();
  if (!member || member.role !== 'engineer') {
    return { success: false, error: 'Apenas o engenheiro pode aprovar marcos.' };
  }

  if ((milestone.status as string) !== 'awaiting_approval') {
    return {
      success: false,
      error: `Marco nao esta aguardando aprovacao (status: ${milestone.status as string}).`,
    };
  }

  const comment = input.comment ? input.comment.trim() : null;
  if (comment && comment.length > MILESTONE_NOTES_MAX) {
    return {
      success: false,
      error: `Comentario muito longo (maximo ${MILESTONE_NOTES_MAX} caracteres).`,
    };
  }

  const nowIso = new Date().toISOString();
  const { error: updErr } = await supabase
    .from('work_milestones')
    .update({
      status: 'approved',
      approved_by: userId,
      approved_at: nowIso,
    })
    .eq('id', input.milestoneId);

  if (updErr) {
    return { success: false, error: updErr.message };
  }

  // Registrar evento (RLS valida actor_role='engineer' bate com role real).
  const { error: evErr } = await supabase
    .from('work_milestone_events')
    .insert({
      milestone_id: input.milestoneId,
      work_id: workId,
      event_type: 'approved',
      actor_id: userId,
      actor_role: 'engineer',
      notes: comment,
    });

  if (evErr) {
    // Marco ja foi aprovado, mas evento nao registrou. Nao revertemos.
    return {
      success: false,
      error: `Marco aprovado, mas falha ao registrar evento: ${evErr.message}`,
    };
  }

  revalidatePath(WORKS_PATH);
  revalidatePath(`${WORKS_PATH}/obras/${workId}/progresso`);
  revalidatePath(`${WORKS_PATH}/obras/${workId}/visao-geral`);

  return { success: true };
}

/**
 * Engineer rejeita marco em awaiting_approval com motivo.
 */
export async function rejectMilestone(input: {
  milestoneId: string;
  reason: string;
}): Promise<ActionResult> {
  if (!input.milestoneId || !UUID_RE.test(input.milestoneId)) {
    return { success: false, error: 'ID de marco invalido.' };
  }
  const reason = (input.reason ?? '').trim();
  if (reason.length < MILESTONE_REJECTION_REASON_MIN) {
    return {
      success: false,
      error: `Informe o motivo da rejeicao (minimo ${MILESTONE_REJECTION_REASON_MIN} caracteres).`,
    };
  }
  if (reason.length > MILESTONE_REJECTION_REASON_MAX) {
    return {
      success: false,
      error: `Motivo muito longo (maximo ${MILESTONE_REJECTION_REASON_MAX} caracteres).`,
    };
  }

  const supabase = await createSupabaseServerClient();
  let userId: string;
  try {
    userId = await requireAuthUserId(supabase);
  } catch {
    return { success: false, error: 'Sessao expirada. Faca login novamente.' };
  }

  const { data: milestone, error: msErr } = await supabase
    .from('work_milestones')
    .select('id, work_id, status')
    .eq('id', input.milestoneId)
    .maybeSingle();

  if (msErr) return { success: false, error: msErr.message };
  if (!milestone) return { success: false, error: 'Marco nao encontrado.' };

  const workId = milestone.work_id as string;
  const { data: member } = await supabase
    .from('work_members')
    .select('role')
    .eq('work_id', workId)
    .eq('user_id', userId)
    .maybeSingle();
  if (!member || member.role !== 'engineer') {
    return { success: false, error: 'Apenas o engenheiro pode rejeitar marcos.' };
  }

  if ((milestone.status as string) !== 'awaiting_approval') {
    return {
      success: false,
      error: `Marco nao esta aguardando aprovacao (status: ${milestone.status as string}).`,
    };
  }

  const nowIso = new Date().toISOString();
  const { error: updErr } = await supabase
    .from('work_milestones')
    .update({
      status: 'rejected',
      rejected_at: nowIso,
      rejection_reason: reason,
    })
    .eq('id', input.milestoneId);

  if (updErr) {
    return { success: false, error: updErr.message };
  }

  const { error: evErr } = await supabase
    .from('work_milestone_events')
    .insert({
      milestone_id: input.milestoneId,
      work_id: workId,
      event_type: 'rejected',
      actor_id: userId,
      actor_role: 'engineer',
      notes: reason,
    });

  if (evErr) {
    return {
      success: false,
      error: `Marco rejeitado, mas falha ao registrar evento: ${evErr.message}`,
    };
  }

  revalidatePath(WORKS_PATH);
  revalidatePath(`${WORKS_PATH}/obras/${workId}/progresso`);

  return { success: true };
}

/**
 * Manager marca marco como em andamento (apenas pending -> in_progress).
 * Outras transicoes (rejected -> in_progress) ficam fora: usar reportMilestone.
 */
export async function setMilestoneInProgress(input: {
  milestoneId: string;
}): Promise<ActionResult> {
  if (!input.milestoneId || !UUID_RE.test(input.milestoneId)) {
    return { success: false, error: 'ID de marco invalido.' };
  }

  const supabase = await createSupabaseServerClient();
  let userId: string;
  try {
    userId = await requireAuthUserId(supabase);
  } catch {
    return { success: false, error: 'Sessao expirada. Faca login novamente.' };
  }

  const { data: milestone, error: msErr } = await supabase
    .from('work_milestones')
    .select('id, work_id, status')
    .eq('id', input.milestoneId)
    .maybeSingle();

  if (msErr) return { success: false, error: msErr.message };
  if (!milestone) return { success: false, error: 'Marco nao encontrado.' };

  const workId = milestone.work_id as string;
  const { data: member } = await supabase
    .from('work_members')
    .select('role')
    .eq('work_id', workId)
    .eq('user_id', userId)
    .maybeSingle();
  if (!member || member.role !== 'manager') {
    return { success: false, error: 'Apenas o gerente pode iniciar marcos.' };
  }

  const status = milestone.status as string;
  if (status !== 'pending') {
    if (status === 'rejected') {
      return {
        success: false,
        error: 'Use "Reportar conclusao" para marcos rejeitados.',
      };
    }
    return {
      success: false,
      error: `Marco com status "${status}" nao pode ser marcado como em andamento.`,
    };
  }

  const { error: updErr } = await supabase
    .from('work_milestones')
    .update({ status: 'in_progress' })
    .eq('id', input.milestoneId);

  if (updErr) {
    return { success: false, error: updErr.message };
  }

  // Sem evento dedicado para essa transicao nesta fase.
  revalidatePath(WORKS_PATH);
  revalidatePath(`${WORKS_PATH}/obras/${workId}/progresso`);

  return { success: true };
}

interface MilestoneHistoryWithUrls {
  history: MilestoneFullHistory;
  signedUrls: Record<string, string>;
}

/**
 * Carrega marco + todos os eventos com URLs assinadas das midias.
 * Usado pelo drawer de detalhe.
 */
export async function loadMilestoneHistory(
  milestoneId: string,
): Promise<ActionResult<MilestoneHistoryWithUrls>> {
  if (!milestoneId || !UUID_RE.test(milestoneId)) {
    return { success: false, error: 'ID de marco invalido.' };
  }

  const supabase = await createSupabaseServerClient();
  try {
    await requireAuthUserId(supabase);
  } catch {
    return { success: false, error: 'Sessao expirada. Faca login novamente.' };
  }

  const history = await getMilestoneFullHistory(supabase, milestoneId);
  if (!history) {
    return { success: false, error: 'Marco nao encontrado.' };
  }

  const paths = history.events.flatMap((e) => e.media.map((m) => m.storagePath));
  // getDailyLogSignedUrls e generico no bucket andamento-obra; serve aqui.
  const signedUrls = await getDailyLogSignedUrls(paths);

  return { success: true, data: { history, signedUrls } };
}
