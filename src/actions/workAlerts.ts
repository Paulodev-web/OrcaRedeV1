'use server';

import { revalidatePath } from 'next/cache';
import { ensureMember } from '@/lib/auth/ensureMember';
import {
  createSupabaseServerClient,
  createSupabaseServiceRoleClient,
  requireAuthUserId,
} from '@/lib/supabaseServer';
import {
  ALERT_TITLE_MIN,
  ALERT_TITLE_MAX,
  ALERT_DESCRIPTION_MIN,
  ALERT_DESCRIPTION_MAX,
  ALERT_CLOSURE_NOTES_MIN,
  ALERT_CLOSURE_NOTES_MAX,
  ALERT_MEDIA_LIMITS,
  type ActionResult,
  type AlertMediaUploadInfo,
  type GetUploadUrlForAlertMediaInput,
  type OpenAlertInput,
} from '@/types/works';

const WORKS_PATH = '/tools/andamento-obra';
const ANDAMENTO_OBRA_BUCKET = 'andamento-obra';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

const VALID_SEVERITIES = ['low', 'medium', 'high', 'critical'] as const;
const VALID_CATEGORIES = ['accident', 'material_shortage', 'safety', 'equipment', 'weather', 'other'] as const;

export async function openAlert(
  input: OpenAlertInput,
): Promise<ActionResult<{ alertId: string }>> {
  const gate = await ensureMember(input.workId);
  if (!gate.ok) return { success: false, error: gate.error };
  if (gate.role !== 'manager') {
    return { success: false, error: 'Apenas o gerente pode abrir alertas.' };
  }

  const title = (input.title ?? '').trim();
  if (title.length < ALERT_TITLE_MIN || title.length > ALERT_TITLE_MAX) {
    return { success: false, error: `Titulo deve ter entre ${ALERT_TITLE_MIN} e ${ALERT_TITLE_MAX} caracteres.` };
  }
  const description = (input.description ?? '').trim();
  if (description.length < ALERT_DESCRIPTION_MIN || description.length > ALERT_DESCRIPTION_MAX) {
    return { success: false, error: `Descricao deve ter entre ${ALERT_DESCRIPTION_MIN} e ${ALERT_DESCRIPTION_MAX} caracteres.` };
  }
  if (!VALID_SEVERITIES.includes(input.severity as typeof VALID_SEVERITIES[number])) {
    return { success: false, error: 'Severidade invalida.' };
  }
  if (!VALID_CATEGORIES.includes(input.category as typeof VALID_CATEGORIES[number])) {
    return { success: false, error: 'Categoria invalida.' };
  }
  if (!input.clientEventId || !UUID_RE.test(input.clientEventId)) {
    return { success: false, error: 'clientEventId obrigatorio.' };
  }

  const { data: existingAlert } = await gate.supabase
    .from('work_alerts')
    .select('id')
    .eq('client_event_id', input.clientEventId)
    .maybeSingle();
  if (existingAlert) {
    return { success: true, data: { alertId: existingAlert.id as string } };
  }

  const alertId = generateUuid();
  const { error: insertErr } = await gate.supabase
    .from('work_alerts')
    .insert({
      id: alertId,
      work_id: input.workId,
      created_by: gate.userId,
      severity: input.severity,
      category: input.category,
      title,
      description,
      gps_lat: input.gpsLat ?? null,
      gps_lng: input.gpsLng ?? null,
      gps_accuracy_meters: input.gpsAccuracyMeters ?? null,
      client_event_id: input.clientEventId,
    });

  if (insertErr) return { success: false, error: insertErr.message };

  const { error: updateErr } = await gate.supabase
    .from('work_alert_updates')
    .insert({
      alert_id: alertId,
      work_id: input.workId,
      actor_id: gate.userId,
      actor_role: 'manager',
      update_type: 'opened',
      notes: null,
    });
  if (updateErr) {
    // Non-blocking
  }

  if (input.mediaPaths && input.mediaPaths.length > 0) {
    const mediaRows = input.mediaPaths.map((m) => ({
      alert_id: alertId,
      update_id: null,
      work_id: input.workId,
      kind: m.kind,
      storage_path: m.storagePath,
      mime_type: m.mimeType ?? null,
      size_bytes: typeof m.sizeBytes === 'number' ? m.sizeBytes : null,
      width: typeof m.width === 'number' ? m.width : null,
      height: typeof m.height === 'number' ? m.height : null,
    }));
    await gate.supabase.from('work_alert_media').insert(mediaRows);
  }

  revalidatePath(`${WORKS_PATH}/obras/${input.workId}/alertas`);
  revalidatePath(WORKS_PATH);
  return { success: true, data: { alertId } };
}

const ALERTS_PAGE_SIZE = 20;

/**
 * Carrega alertas mais antigos (paginacao reversa por created_at).
 */
export async function getOlderAlerts(
  workId: string,
  cursor: string,
): Promise<ActionResult<{ items: import('@/types/works').WorkAlert[]; hasMore: boolean }>> {
  if (!workId) return { success: false, error: 'Obra invalida.' };

  const supabase = await createSupabaseServerClient();
  try {
    await requireAuthUserId(supabase);
  } catch {
    return { success: false, error: 'Sessao expirada.' };
  }

  const fetchLimit = ALERTS_PAGE_SIZE + 1;
  const { data, error } = await supabase
    .from('work_alerts')
    .select('*')
    .eq('work_id', workId)
    .lt('created_at', cursor)
    .order('created_at', { ascending: false })
    .limit(fetchLimit);

  if (error || !data) return { success: false, error: error?.message ?? 'Falha ao carregar alertas.' };

  const rows = data as Array<Record<string, unknown>>;
  const hasMore = rows.length > ALERTS_PAGE_SIZE;
  const sliced = hasMore ? rows.slice(0, ALERTS_PAGE_SIZE) : rows;

  const items = sliced.map((r): import('@/types/works').WorkAlert => ({
    id: r.id as string,
    workId: r.work_id as string,
    createdBy: r.created_by as string,
    severity: r.severity as import('@/types/works').WorkAlert['severity'],
    category: r.category as import('@/types/works').WorkAlert['category'],
    title: r.title as string,
    description: r.description as string,
    gpsLat: (r.gps_lat as number) ?? null,
    gpsLng: (r.gps_lng as number) ?? null,
    gpsAccuracyMeters: (r.gps_accuracy_meters as number) ?? null,
    status: r.status as import('@/types/works').WorkAlert['status'],
    fieldResolutionAt: (r.field_resolution_at as string) || null,
    fieldResolutionNotes: (r.field_resolution_notes as string) || null,
    closedBy: (r.closed_by as string) || null,
    closedAt: (r.closed_at as string) || null,
    closureNotes: (r.closure_notes as string) || null,
    clientEventId: r.client_event_id as string,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  }));

  return { success: true, data: { items, hasMore } };
}

export async function acknowledgeAlert(input: {
  alertId: string;
  notes?: string;
}): Promise<ActionResult> {
  if (!input.alertId || !UUID_RE.test(input.alertId)) {
    return { success: false, error: 'ID invalido.' };
  }

  const supabase = await createSupabaseServerClient();
  let userId: string;
  try { userId = await requireAuthUserId(supabase); } catch { return { success: false, error: 'Sessao expirada.' }; }

  const { data: alert } = await supabase
    .from('work_alerts')
    .select('id, work_id, status')
    .eq('id', input.alertId)
    .maybeSingle();

  if (!alert) return { success: false, error: 'Alerta nao encontrado.' };

  const { data: member } = await supabase
    .from('work_members')
    .select('role')
    .eq('work_id', alert.work_id as string)
    .eq('user_id', userId)
    .maybeSingle();

  if (!member || member.role !== 'engineer') {
    return { success: false, error: 'Apenas o engenheiro pode reconhecer alertas.' };
  }
  if (alert.status !== 'open') {
    return { success: false, error: 'Alerta nao esta em status aberto.' };
  }

  const { error } = await supabase
    .from('work_alerts')
    .update({ status: 'in_progress' })
    .eq('id', input.alertId);
  if (error) return { success: false, error: error.message };

  await supabase.from('work_alert_updates').insert({
    alert_id: input.alertId,
    work_id: alert.work_id as string,
    actor_id: userId,
    actor_role: 'engineer',
    update_type: 'in_progress',
    notes: input.notes?.trim() || null,
  });

  revalidatePath(`${WORKS_PATH}/obras/${alert.work_id as string}/alertas`);
  revalidatePath(WORKS_PATH);
  return { success: true };
}

export async function resolveAlertInField(input: {
  alertId: string;
  resolutionNotes: string;
  mediaPaths?: { kind: 'image' | 'video'; storagePath: string; mimeType?: string; sizeBytes?: number; width?: number; height?: number }[];
}): Promise<ActionResult> {
  if (!input.alertId || !UUID_RE.test(input.alertId)) {
    return { success: false, error: 'ID invalido.' };
  }
  const notes = (input.resolutionNotes ?? '').trim();
  if (notes.length < 5) {
    return { success: false, error: 'Notas de resolucao obrigatorias (minimo 5 caracteres).' };
  }

  const supabase = await createSupabaseServerClient();
  let userId: string;
  try { userId = await requireAuthUserId(supabase); } catch { return { success: false, error: 'Sessao expirada.' }; }

  const { data: alert } = await supabase
    .from('work_alerts')
    .select('id, work_id, status, created_by')
    .eq('id', input.alertId)
    .maybeSingle();

  if (!alert) return { success: false, error: 'Alerta nao encontrado.' };

  const { data: member } = await supabase
    .from('work_members')
    .select('role')
    .eq('work_id', alert.work_id as string)
    .eq('user_id', userId)
    .maybeSingle();

  if (!member || member.role !== 'manager') {
    return { success: false, error: 'Apenas o gerente pode resolver em campo.' };
  }
  if (alert.status !== 'in_progress') {
    return { success: false, error: 'Alerta deve estar em tratativa para resolver em campo.' };
  }

  const { error } = await supabase
    .from('work_alerts')
    .update({
      status: 'resolved_in_field',
      field_resolution_at: new Date().toISOString(),
      field_resolution_notes: notes,
    })
    .eq('id', input.alertId);
  if (error) return { success: false, error: error.message };

  const { data: updateRow } = await supabase.from('work_alert_updates').insert({
    alert_id: input.alertId,
    work_id: alert.work_id as string,
    actor_id: userId,
    actor_role: 'manager',
    update_type: 'resolved_in_field',
    notes,
  }).select('id').single();

  if (input.mediaPaths && input.mediaPaths.length > 0 && updateRow) {
    const mediaRows = input.mediaPaths.map((m) => ({
      alert_id: input.alertId,
      update_id: updateRow.id as string,
      work_id: alert.work_id as string,
      kind: m.kind,
      storage_path: m.storagePath,
      mime_type: m.mimeType ?? null,
      size_bytes: typeof m.sizeBytes === 'number' ? m.sizeBytes : null,
      width: typeof m.width === 'number' ? m.width : null,
      height: typeof m.height === 'number' ? m.height : null,
    }));
    await supabase.from('work_alert_media').insert(mediaRows);
  }

  revalidatePath(`${WORKS_PATH}/obras/${alert.work_id as string}/alertas`);
  revalidatePath(WORKS_PATH);
  return { success: true };
}

export async function closeAlert(input: {
  alertId: string;
  closureNotes: string;
}): Promise<ActionResult> {
  if (!input.alertId || !UUID_RE.test(input.alertId)) {
    return { success: false, error: 'ID invalido.' };
  }
  const closureNotes = (input.closureNotes ?? '').trim();
  if (closureNotes.length < ALERT_CLOSURE_NOTES_MIN || closureNotes.length > ALERT_CLOSURE_NOTES_MAX) {
    return { success: false, error: `Notas de encerramento devem ter entre ${ALERT_CLOSURE_NOTES_MIN} e ${ALERT_CLOSURE_NOTES_MAX} caracteres.` };
  }

  const supabase = await createSupabaseServerClient();
  let userId: string;
  try { userId = await requireAuthUserId(supabase); } catch { return { success: false, error: 'Sessao expirada.' }; }

  const { data: alert } = await supabase
    .from('work_alerts')
    .select('id, work_id, status')
    .eq('id', input.alertId)
    .maybeSingle();

  if (!alert) return { success: false, error: 'Alerta nao encontrado.' };

  const { data: member } = await supabase
    .from('work_members')
    .select('role')
    .eq('work_id', alert.work_id as string)
    .eq('user_id', userId)
    .maybeSingle();

  if (!member || member.role !== 'engineer') {
    return { success: false, error: 'Apenas o engenheiro pode encerrar alertas.' };
  }
  if (alert.status !== 'resolved_in_field') {
    return { success: false, error: 'Alerta deve estar resolvido em campo para encerrar.' };
  }

  const { error } = await supabase
    .from('work_alerts')
    .update({
      status: 'closed',
      closed_by: userId,
      closed_at: new Date().toISOString(),
      closure_notes: closureNotes,
    })
    .eq('id', input.alertId);
  if (error) return { success: false, error: error.message };

  await supabase.from('work_alert_updates').insert({
    alert_id: input.alertId,
    work_id: alert.work_id as string,
    actor_id: userId,
    actor_role: 'engineer',
    update_type: 'closed',
    notes: closureNotes,
  });

  revalidatePath(`${WORKS_PATH}/obras/${alert.work_id as string}/alertas`);
  revalidatePath(WORKS_PATH);
  return { success: true };
}

export async function reopenAlert(input: {
  alertId: string;
  reason: string;
}): Promise<ActionResult> {
  if (!input.alertId || !UUID_RE.test(input.alertId)) {
    return { success: false, error: 'ID invalido.' };
  }
  const reason = (input.reason ?? '').trim();
  if (reason.length < 5) {
    return { success: false, error: 'Motivo obrigatorio (minimo 5 caracteres).' };
  }

  const supabase = await createSupabaseServerClient();
  let userId: string;
  try { userId = await requireAuthUserId(supabase); } catch { return { success: false, error: 'Sessao expirada.' }; }

  const { data: alert } = await supabase
    .from('work_alerts')
    .select('id, work_id, status')
    .eq('id', input.alertId)
    .maybeSingle();

  if (!alert) return { success: false, error: 'Alerta nao encontrado.' };

  const { data: member } = await supabase
    .from('work_members')
    .select('role')
    .eq('work_id', alert.work_id as string)
    .eq('user_id', userId)
    .maybeSingle();

  if (!member || member.role !== 'engineer') {
    return { success: false, error: 'Apenas o engenheiro pode reabrir alertas.' };
  }
  if (alert.status !== 'closed') {
    return { success: false, error: 'Apenas alertas encerrados podem ser reabertos.' };
  }

  const { error } = await supabase
    .from('work_alerts')
    .update({ status: 'in_progress' })
    .eq('id', input.alertId);
  if (error) return { success: false, error: error.message };

  await supabase.from('work_alert_updates').insert({
    alert_id: input.alertId,
    work_id: alert.work_id as string,
    actor_id: userId,
    actor_role: 'engineer',
    update_type: 'reopened',
    notes: reason,
  });

  revalidatePath(`${WORKS_PATH}/obras/${alert.work_id as string}/alertas`);
  revalidatePath(WORKS_PATH);
  return { success: true };
}

export async function addAlertComment(input: {
  alertId: string;
  notes: string;
  mediaPaths?: { kind: 'image' | 'video'; storagePath: string; mimeType?: string; sizeBytes?: number; width?: number; height?: number }[];
}): Promise<ActionResult> {
  if (!input.alertId || !UUID_RE.test(input.alertId)) {
    return { success: false, error: 'ID invalido.' };
  }
  const notes = (input.notes ?? '').trim();
  if (notes.length < 1) {
    return { success: false, error: 'Comentario nao pode ser vazio.' };
  }

  const supabase = await createSupabaseServerClient();
  let userId: string;
  try { userId = await requireAuthUserId(supabase); } catch { return { success: false, error: 'Sessao expirada.' }; }

  const { data: alert } = await supabase
    .from('work_alerts')
    .select('id, work_id')
    .eq('id', input.alertId)
    .maybeSingle();

  if (!alert) return { success: false, error: 'Alerta nao encontrado.' };

  const { data: member } = await supabase
    .from('work_members')
    .select('role')
    .eq('work_id', alert.work_id as string)
    .eq('user_id', userId)
    .maybeSingle();

  if (!member) return { success: false, error: 'Nao e membro da obra.' };

  const { data: updateRow } = await supabase.from('work_alert_updates').insert({
    alert_id: input.alertId,
    work_id: alert.work_id as string,
    actor_id: userId,
    actor_role: member.role as string,
    update_type: 'comment',
    notes,
  }).select('id').single();

  if (input.mediaPaths && input.mediaPaths.length > 0 && updateRow) {
    const mediaRows = input.mediaPaths.map((m) => ({
      alert_id: input.alertId,
      update_id: updateRow.id as string,
      work_id: alert.work_id as string,
      kind: m.kind,
      storage_path: m.storagePath,
      mime_type: m.mimeType ?? null,
      size_bytes: typeof m.sizeBytes === 'number' ? m.sizeBytes : null,
      width: typeof m.width === 'number' ? m.width : null,
      height: typeof m.height === 'number' ? m.height : null,
    }));
    await supabase.from('work_alert_media').insert(mediaRows);
  }

  revalidatePath(`${WORKS_PATH}/obras/${alert.work_id as string}/alertas`);
  return { success: true };
}

export async function getUploadUrlForAlertMedia(
  input: GetUploadUrlForAlertMediaInput,
): Promise<ActionResult<AlertMediaUploadInfo>> {
  const gate = await ensureMember(input.workId);
  if (!gate.ok) return { success: false, error: gate.error };

  if (input.kind !== 'image' && input.kind !== 'video') {
    return { success: false, error: 'Tipo invalido.' };
  }
  const limits = ALERT_MEDIA_LIMITS[input.kind];
  if (!Number.isFinite(input.sizeBytes) || input.sizeBytes <= 0 || input.sizeBytes > limits.maxBytes) {
    const maxMb = Math.round(limits.maxBytes / (1024 * 1024));
    return { success: false, error: `Arquivo excede ${maxMb} MB.` };
  }

  const fileName = (input.fileName ?? '').trim();
  if (!fileName) return { success: false, error: 'Nome do arquivo invalido.' };

  const fileId = generateUuid();
  const ext = inferExtension(fileName, input.mimeType, input.kind);
  const subPath = input.updateId ? `updates/${input.updateId}` : input.alertId;
  const storagePath = `${input.workId}/alerts/${input.alertId}/${subPath}/${fileId}.${ext}`;

  const serviceRole = createSupabaseServiceRoleClient();
  const { data, error } = await serviceRole.storage
    .from(ANDAMENTO_OBRA_BUCKET)
    .createSignedUploadUrl(storagePath);

  if (error || !data) {
    return { success: false, error: error?.message ?? 'Falha ao gerar URL.' };
  }

  return {
    success: true,
    data: { uploadUrl: data.signedUrl, uploadToken: data.token, storagePath },
  };
}
