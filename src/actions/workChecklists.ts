'use server';

import { revalidatePath } from 'next/cache';
import { ensureMember } from '@/lib/auth/ensureMember';
import { ensureEngineer } from '@/lib/auth/ensureEngineer';
import {
  createSupabaseServerClient,
  createSupabaseServiceRoleClient,
  requireAuthUserId,
} from '@/lib/supabaseServer';
import {
  CHECKLIST_TEMPLATE_NAME_MIN,
  CHECKLIST_TEMPLATE_NAME_MAX,
  CHECKLIST_ITEM_LABEL_MAX,
  CHECKLIST_RETURN_REASON_MIN,
  CHECKLIST_RETURN_REASON_MAX,
  CHECKLIST_MEDIA_LIMITS,
  type ActionResult,
  type AssignChecklistToWorkInput,
  type ChecklistItemMediaUploadInfo,
  type CreateChecklistTemplateInput,
  type GetUploadUrlForChecklistItemMediaInput,
  type MarkChecklistItemInput,
  type TemplateSnapshot,
  type UpdateChecklistTemplateInput,
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

export async function createChecklistTemplate(
  input: CreateChecklistTemplateInput,
): Promise<ActionResult<{ templateId: string }>> {
  const eng = await ensureEngineer();
  if (!eng.ok) return { success: false, error: eng.error };

  const name = (input.name ?? '').trim();
  if (name.length < CHECKLIST_TEMPLATE_NAME_MIN || name.length > CHECKLIST_TEMPLATE_NAME_MAX) {
    return { success: false, error: `Nome deve ter entre ${CHECKLIST_TEMPLATE_NAME_MIN} e ${CHECKLIST_TEMPLATE_NAME_MAX} caracteres.` };
  }
  if (!input.items || input.items.length === 0) {
    return { success: false, error: 'Template precisa de pelo menos 1 item.' };
  }
  for (const item of input.items) {
    if (!item.label || item.label.trim().length === 0) {
      return { success: false, error: 'Todos os itens precisam de um titulo.' };
    }
    if (item.label.length > CHECKLIST_ITEM_LABEL_MAX) {
      return { success: false, error: `Titulo do item excede ${CHECKLIST_ITEM_LABEL_MAX} caracteres.` };
    }
  }

  const supabase = await createSupabaseServerClient();
  const templateId = generateUuid();

  if (input.isDefault) {
    await supabase
      .from('checklist_templates')
      .update({ is_default: false })
      .eq('engineer_id', eng.engineerId)
      .eq('is_default', true);
  }

  const { error: insertErr } = await supabase
    .from('checklist_templates')
    .insert({
      id: templateId,
      engineer_id: eng.engineerId,
      name,
      description: input.description?.trim() || null,
      is_default: input.isDefault ?? false,
    });

  if (insertErr) return { success: false, error: insertErr.message };

  const itemRows = input.items.map((item, idx) => ({
    template_id: templateId,
    order_index: item.orderIndex ?? idx,
    label: item.label.trim(),
    description: item.description?.trim() || null,
    requires_photo: item.requiresPhoto ?? false,
  }));

  const { error: itemsErr } = await supabase
    .from('checklist_template_items')
    .insert(itemRows);

  if (itemsErr) return { success: false, error: itemsErr.message };

  revalidatePath(`${WORKS_PATH}/checklists`);
  return { success: true, data: { templateId } };
}

export async function updateChecklistTemplate(
  input: UpdateChecklistTemplateInput,
): Promise<ActionResult> {
  if (!input.id || !UUID_RE.test(input.id)) {
    return { success: false, error: 'ID de template invalido.' };
  }

  const eng = await ensureEngineer();
  if (!eng.ok) return { success: false, error: eng.error };

  const supabase = await createSupabaseServerClient();

  const { data: existing } = await supabase
    .from('checklist_templates')
    .select('id, engineer_id')
    .eq('id', input.id)
    .maybeSingle();

  if (!existing) return { success: false, error: 'Template nao encontrado.' };
  if (existing.engineer_id !== eng.engineerId) return { success: false, error: 'Sem permissao.' };

  const updates: Record<string, unknown> = {};
  if (input.name !== undefined) {
    const name = input.name.trim();
    if (name.length < CHECKLIST_TEMPLATE_NAME_MIN || name.length > CHECKLIST_TEMPLATE_NAME_MAX) {
      return { success: false, error: `Nome deve ter entre ${CHECKLIST_TEMPLATE_NAME_MIN} e ${CHECKLIST_TEMPLATE_NAME_MAX} caracteres.` };
    }
    updates.name = name;
  }
  if (input.description !== undefined) updates.description = input.description?.trim() || null;
  if (input.isDefault !== undefined) {
    if (input.isDefault) {
      await supabase
        .from('checklist_templates')
        .update({ is_default: false })
        .eq('engineer_id', eng.engineerId)
        .eq('is_default', true)
        .neq('id', input.id);
    }
    updates.is_default = input.isDefault;
  }

  if (Object.keys(updates).length > 0) {
    const { error } = await supabase
      .from('checklist_templates')
      .update(updates)
      .eq('id', input.id);
    if (error) return { success: false, error: error.message };
  }

  if (input.items && input.items.length > 0) {
    for (const item of input.items) {
      if (!item.label || item.label.trim().length === 0) {
        return { success: false, error: 'Todos os itens precisam de um titulo.' };
      }
    }

    await supabase
      .from('checklist_template_items')
      .delete()
      .eq('template_id', input.id);

    const itemRows = input.items.map((item, idx) => ({
      template_id: input.id,
      order_index: item.orderIndex ?? idx,
      label: item.label.trim(),
      description: item.description?.trim() || null,
      requires_photo: item.requiresPhoto ?? false,
    }));

    const { error: itemsErr } = await supabase
      .from('checklist_template_items')
      .insert(itemRows);
    if (itemsErr) return { success: false, error: itemsErr.message };
  }

  revalidatePath(`${WORKS_PATH}/checklists`);
  revalidatePath(`${WORKS_PATH}/checklists/${input.id}`);
  return { success: true };
}

export async function deactivateChecklistTemplate(input: {
  id: string;
}): Promise<ActionResult> {
  if (!input.id || !UUID_RE.test(input.id)) {
    return { success: false, error: 'ID invalido.' };
  }

  const eng = await ensureEngineer();
  if (!eng.ok) return { success: false, error: eng.error };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from('checklist_templates')
    .update({ is_active: false, is_default: false })
    .eq('id', input.id)
    .eq('engineer_id', eng.engineerId);

  if (error) return { success: false, error: error.message };

  revalidatePath(`${WORKS_PATH}/checklists`);
  return { success: true };
}

export async function setDefaultTemplate(input: {
  id: string;
}): Promise<ActionResult> {
  if (!input.id || !UUID_RE.test(input.id)) {
    return { success: false, error: 'ID invalido.' };
  }

  const eng = await ensureEngineer();
  if (!eng.ok) return { success: false, error: eng.error };

  const supabase = await createSupabaseServerClient();

  await supabase
    .from('checklist_templates')
    .update({ is_default: false })
    .eq('engineer_id', eng.engineerId)
    .eq('is_default', true);

  const { error } = await supabase
    .from('checklist_templates')
    .update({ is_default: true })
    .eq('id', input.id)
    .eq('engineer_id', eng.engineerId)
    .eq('is_active', true);

  if (error) return { success: false, error: error.message };

  revalidatePath(`${WORKS_PATH}/checklists`);
  return { success: true };
}

export async function assignChecklistToWork(
  input: AssignChecklistToWorkInput,
): Promise<ActionResult<{ checklistId: string }>> {
  const gate = await ensureMember(input.workId);
  if (!gate.ok) return { success: false, error: gate.error };
  if (gate.role !== 'engineer') {
    return { success: false, error: 'Apenas o engenheiro pode atribuir checklists.' };
  }

  const name = (input.name ?? '').trim();
  if (name.length < CHECKLIST_TEMPLATE_NAME_MIN) {
    return { success: false, error: 'Nome do checklist muito curto.' };
  }

  let snapshot: TemplateSnapshot;

  if (input.templateId && UUID_RE.test(input.templateId)) {
    const { data: template } = await gate.supabase
      .from('checklist_templates')
      .select('name, description')
      .eq('id', input.templateId)
      .maybeSingle();

    const { data: items } = await gate.supabase
      .from('checklist_template_items')
      .select('order_index, label, description, requires_photo')
      .eq('template_id', input.templateId)
      .order('order_index', { ascending: true });

    if (!template || !items || items.length === 0) {
      return { success: false, error: 'Template nao encontrado ou sem itens.' };
    }

    snapshot = {
      name: template.name as string,
      description: (template.description as string) || null,
      items: (items as Array<{ order_index: number; label: string; description: string | null; requires_photo: boolean }>).map((i) => ({
        order_index: i.order_index,
        label: i.label,
        description: i.description,
        requires_photo: i.requires_photo,
      })),
    };
  } else {
    if (!input.items || input.items.length === 0) {
      return { success: false, error: 'Checklist ad-hoc precisa de pelo menos 1 item.' };
    }
    snapshot = {
      name,
      description: input.description?.trim() || null,
      items: input.items.map((i, idx) => ({
        order_index: i.orderIndex ?? idx,
        label: i.label.trim(),
        description: i.description?.trim() || null,
        requires_photo: i.requiresPhoto ?? false,
      })),
    };
  }

  const { data: work } = await gate.supabase
    .from('works')
    .select('manager_id, status')
    .eq('id', input.workId)
    .single();

  if (work?.status === 'cancelled') {
    return { success: false, error: 'Nao e possivel atribuir checklist a obra cancelada.' };
  }

  const assignedTo = input.assignedTo ?? (work?.manager_id as string | null) ?? null;

  const checklistId = generateUuid();
  const { error: insertErr } = await gate.supabase
    .from('work_checklists')
    .insert({
      id: checklistId,
      work_id: input.workId,
      template_id: input.templateId || null,
      template_snapshot: snapshot,
      name,
      description: input.description?.trim() || null,
      assigned_by: gate.userId,
      assigned_to: assignedTo,
      due_date: input.dueDate || null,
    });

  if (insertErr) return { success: false, error: insertErr.message };

  revalidatePath(`${WORKS_PATH}/obras/${input.workId}/checklists`);
  revalidatePath(WORKS_PATH);
  return { success: true, data: { checklistId } };
}

export async function validateChecklist(input: {
  checklistId: string;
}): Promise<ActionResult> {
  if (!input.checklistId || !UUID_RE.test(input.checklistId)) {
    return { success: false, error: 'ID invalido.' };
  }

  const supabase = await createSupabaseServerClient();
  let userId: string;
  try { userId = await requireAuthUserId(supabase); } catch { return { success: false, error: 'Sessao expirada.' }; }

  const { data: cl } = await supabase
    .from('work_checklists')
    .select('id, work_id, status')
    .eq('id', input.checklistId)
    .maybeSingle();

  if (!cl) return { success: false, error: 'Checklist nao encontrado.' };

  const { data: member } = await supabase
    .from('work_members')
    .select('role')
    .eq('work_id', cl.work_id as string)
    .eq('user_id', userId)
    .maybeSingle();

  if (!member || member.role !== 'engineer') {
    return { success: false, error: 'Apenas o engenheiro pode validar checklists.' };
  }
  if (cl.status !== 'awaiting_validation') {
    return { success: false, error: 'Checklist nao esta aguardando validacao.' };
  }

  const { error } = await supabase
    .from('work_checklists')
    .update({
      status: 'validated',
      validated_by: userId,
      validated_at: new Date().toISOString(),
    })
    .eq('id', input.checklistId);

  if (error) return { success: false, error: error.message };

  revalidatePath(`${WORKS_PATH}/obras/${cl.work_id as string}/checklists`);
  revalidatePath(WORKS_PATH);
  return { success: true };
}

export async function returnChecklist(input: {
  checklistId: string;
  reason: string;
}): Promise<ActionResult> {
  if (!input.checklistId || !UUID_RE.test(input.checklistId)) {
    return { success: false, error: 'ID invalido.' };
  }
  const reason = (input.reason ?? '').trim();
  if (reason.length < CHECKLIST_RETURN_REASON_MIN) {
    return { success: false, error: `Motivo deve ter no minimo ${CHECKLIST_RETURN_REASON_MIN} caracteres.` };
  }
  if (reason.length > CHECKLIST_RETURN_REASON_MAX) {
    return { success: false, error: `Motivo excede ${CHECKLIST_RETURN_REASON_MAX} caracteres.` };
  }

  const supabase = await createSupabaseServerClient();
  let userId: string;
  try { userId = await requireAuthUserId(supabase); } catch { return { success: false, error: 'Sessao expirada.' }; }

  const { data: cl } = await supabase
    .from('work_checklists')
    .select('id, work_id, status')
    .eq('id', input.checklistId)
    .maybeSingle();

  if (!cl) return { success: false, error: 'Checklist nao encontrado.' };

  const { data: member } = await supabase
    .from('work_members')
    .select('role')
    .eq('work_id', cl.work_id as string)
    .eq('user_id', userId)
    .maybeSingle();

  if (!member || member.role !== 'engineer') {
    return { success: false, error: 'Apenas o engenheiro pode devolver checklists.' };
  }
  if (cl.status !== 'awaiting_validation') {
    return { success: false, error: 'Checklist nao esta aguardando validacao.' };
  }

  const { error } = await supabase
    .from('work_checklists')
    .update({
      status: 'returned',
      returned_at: new Date().toISOString(),
      return_reason: reason,
    })
    .eq('id', input.checklistId);

  if (error) return { success: false, error: error.message };

  revalidatePath(`${WORKS_PATH}/obras/${cl.work_id as string}/checklists`);
  revalidatePath(WORKS_PATH);
  return { success: true };
}

export async function markChecklistItem(
  input: MarkChecklistItemInput,
): Promise<ActionResult> {
  if (!input.itemId || !UUID_RE.test(input.itemId)) {
    return { success: false, error: 'ID de item invalido.' };
  }

  const supabase = await createSupabaseServerClient();
  let userId: string;
  try { userId = await requireAuthUserId(supabase); } catch { return { success: false, error: 'Sessao expirada.' }; }

  if (input.clientEventId && UUID_RE.test(input.clientEventId)) {
    const { data: existingItem } = await supabase
      .from('work_checklist_items')
      .select('id')
      .eq('client_event_id', input.clientEventId)
      .maybeSingle();
    if (existingItem) return { success: true };
  }

  const { data: item } = await supabase
    .from('work_checklist_items')
    .select('id, work_checklist_id, requires_photo, is_completed')
    .eq('id', input.itemId)
    .maybeSingle();

  if (!item) return { success: false, error: 'Item nao encontrado.' };

  const { data: cl } = await supabase
    .from('work_checklists')
    .select('id, work_id')
    .eq('id', item.work_checklist_id as string)
    .maybeSingle();

  if (!cl) return { success: false, error: 'Checklist nao encontrado.' };

  const { data: member } = await supabase
    .from('work_members')
    .select('role')
    .eq('work_id', cl.work_id as string)
    .eq('user_id', userId)
    .maybeSingle();

  if (!member || member.role !== 'manager') {
    return { success: false, error: 'Apenas o gerente pode marcar itens.' };
  }

  if (input.isCompleted && item.requires_photo) {
    const hasMedia = (input.mediaPaths && input.mediaPaths.length > 0);
    if (!hasMedia) {
      const { data: existingMedia } = await supabase
        .from('work_checklist_item_media')
        .select('id')
        .eq('item_id', input.itemId)
        .limit(1);
      if (!existingMedia || existingMedia.length === 0) {
        return { success: false, error: 'Este item exige foto para ser marcado como concluido.' };
      }
    }
  }

  const updateData: Record<string, unknown> = {
    is_completed: input.isCompleted,
    completed_at: input.isCompleted ? new Date().toISOString() : null,
    completed_by: input.isCompleted ? userId : null,
    notes: input.notes?.trim() || null,
  };
  if (input.clientEventId && UUID_RE.test(input.clientEventId)) {
    updateData.client_event_id = input.clientEventId;
  }

  const { error } = await supabase
    .from('work_checklist_items')
    .update(updateData)
    .eq('id', input.itemId);

  if (error) return { success: false, error: error.message };

  if (input.mediaPaths && input.mediaPaths.length > 0 && input.isCompleted) {
    const mediaRows = input.mediaPaths.map((m) => ({
      item_id: input.itemId,
      work_checklist_id: cl.id as string,
      work_id: cl.work_id as string,
      kind: m.kind,
      storage_path: m.storagePath,
      mime_type: m.mimeType ?? null,
      size_bytes: typeof m.sizeBytes === 'number' ? m.sizeBytes : null,
      width: typeof m.width === 'number' ? m.width : null,
      height: typeof m.height === 'number' ? m.height : null,
    }));
    await supabase.from('work_checklist_item_media').insert(mediaRows);
  }

  revalidatePath(`${WORKS_PATH}/obras/${cl.work_id as string}/checklists`);
  return { success: true };
}

export async function setChecklistInProgress(input: {
  checklistId: string;
}): Promise<ActionResult> {
  if (!input.checklistId || !UUID_RE.test(input.checklistId)) {
    return { success: false, error: 'ID invalido.' };
  }

  const supabase = await createSupabaseServerClient();
  let userId: string;
  try { userId = await requireAuthUserId(supabase); } catch { return { success: false, error: 'Sessao expirada.' }; }

  const { data: cl } = await supabase
    .from('work_checklists')
    .select('id, work_id, status')
    .eq('id', input.checklistId)
    .maybeSingle();

  if (!cl) return { success: false, error: 'Checklist nao encontrado.' };

  const { data: member } = await supabase
    .from('work_members')
    .select('role')
    .eq('work_id', cl.work_id as string)
    .eq('user_id', userId)
    .maybeSingle();

  if (!member || member.role !== 'manager') {
    return { success: false, error: 'Apenas o gerente pode iniciar checklists.' };
  }
  if (cl.status !== 'pending' && cl.status !== 'returned') {
    return { success: false, error: 'Checklist nao pode ser iniciado neste status.' };
  }

  const { error } = await supabase
    .from('work_checklists')
    .update({ status: 'in_progress' })
    .eq('id', input.checklistId);

  if (error) return { success: false, error: error.message };

  revalidatePath(`${WORKS_PATH}/obras/${cl.work_id as string}/checklists`);
  return { success: true };
}

export async function getUploadUrlForChecklistItemMedia(
  input: GetUploadUrlForChecklistItemMediaInput,
): Promise<ActionResult<ChecklistItemMediaUploadInfo>> {
  const gate = await ensureMember(input.workId);
  if (!gate.ok) return { success: false, error: gate.error };
  if (gate.role !== 'manager') {
    return { success: false, error: 'Apenas o gerente pode anexar fotos a itens.' };
  }

  if (input.kind !== 'image' && input.kind !== 'video') {
    return { success: false, error: 'Tipo invalido.' };
  }
  const limits = CHECKLIST_MEDIA_LIMITS[input.kind];
  if (!Number.isFinite(input.sizeBytes) || input.sizeBytes <= 0 || input.sizeBytes > limits.maxBytes) {
    const maxMb = Math.round(limits.maxBytes / (1024 * 1024));
    return { success: false, error: `Arquivo excede ${maxMb} MB.` };
  }

  const fileName = (input.fileName ?? '').trim();
  if (!fileName) return { success: false, error: 'Nome do arquivo invalido.' };

  const fileId = generateUuid();
  const ext = inferExtension(fileName, input.mimeType, input.kind);
  const storagePath = `${input.workId}/checklists/${input.checklistId}/${input.itemId}/${fileId}.${ext}`;

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
