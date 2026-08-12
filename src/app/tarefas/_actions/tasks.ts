'use server';

import { revalidatePath } from 'next/cache';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ensureOrgMember } from '@/lib/auth/ensureOrgMember';
import type { ActionResult } from '@/types/works';
import {
  taskMoveDirection,
  taskStageSector,
  type CreateTaskInput,
  type MoveTaskInput,
  type TaskSector,
  type TaskStage,
} from '@/types/tasks';

/**
 * O board é client-side e reconcilia por Realtime, então estas ações NÃO
 * chamam `router.refresh()` no cliente. O `revalidatePath` aqui serve só para o
 * próximo carregamento de servidor (deep link, F5) — nunca para redesenhar a
 * tela do autor da ação, que já se moveu de forma otimista.
 */
function revalidateBoard(taskId?: string) {
  revalidatePath('/tarefas');
  if (taskId) revalidatePath(`/tarefas/${taskId}`);
}

/** Espaço entre duas posições vizinhas abaixo do qual a coluna é reequilibrada. */
const MIN_POSITION_GAP = 0.001;
const POSITION_STEP = 1000;

// -----------------------------------------------------------------------------
// Criar
// -----------------------------------------------------------------------------

export async function createTaskAction(
  input: CreateTaskInput,
): Promise<ActionResult<{ id: string }>> {
  const gate = await ensureOrgMember();
  if (!gate.ok) return { success: false, error: gate.error };

  const title = input.title.trim();
  if (title.length === 0) return { success: false, error: 'O título é obrigatório.' };

  // Card com etapa tem o setor derivado pelo trigger; card avulso usa o setor
  // informado. Mandar os dois é inofensivo — o banco sobrescreve quando deve.
  const sector = taskStageSector(input.stage) ?? input.sector;

  const { data, error } = await gate.supabase
    .from('tasks')
    .insert({
      org_id: gate.orgId,
      title,
      description: input.description?.trim() || null,
      client_name: input.clientName?.trim() || null,
      stage: input.stage,
      sector,
      budget_id: input.budgetId || null,
      due_date: input.dueDate || null,
      created_by: gate.userId,
    })
    .select('id')
    .single();

  if (error) return { success: false, error: error.message };

  revalidateBoard();
  if (input.budgetId) revalidatePath(`/orcamentos/${input.budgetId}`);
  return { success: true, data: { id: data.id as string } };
}

// -----------------------------------------------------------------------------
// Mover — a ação central da esteira
// -----------------------------------------------------------------------------

/**
 * Um único UPDATE muda `stage`, `sector` e `position`. O trigger
 * `tasks_before_write` cuida do resto: deriva o setor, limpa responsável e
 * bloqueio no handoff, calcula a direção e grava o evento.
 *
 * A posição é calculada AQUI, a partir dos ids dos vizinhos, e não recebida
 * pronta do cliente: dois colegas arrastando na mesma coluna ao mesmo tempo
 * mandariam a mesma posição calculada sobre estados diferentes.
 */
export async function moveTaskAction(input: MoveTaskInput): Promise<ActionResult> {
  const gate = await ensureOrgMember();
  if (!gate.ok) return { success: false, error: gate.error };

  const { data: current, error: readError } = await gate.supabase
    .from('tasks')
    .select('id, stage, sector')
    .eq('id', input.taskId)
    .maybeSingle();

  if (readError) return { success: false, error: readError.message };
  if (!current) return { success: false, error: 'Tarefa não encontrada.' };

  const fromStage = (current.stage as TaskStage | null) ?? null;
  const toStage = input.stage;
  const note = input.note?.trim() || null;

  // Devolver exige motivo — é a única nota obrigatória do módulo, e é o que faz
  // o histórico responder "por que isso voltou pra mim?".
  if (fromStage !== toStage && taskMoveDirection(fromStage, toStage) === 'retorno' && !note) {
    return { success: false, error: 'Devolver um card exige um motivo.' };
  }

  const targetSector: TaskSector =
    taskStageSector(toStage) ?? input.sector ?? (current.sector as TaskSector);

  const position = await resolvePosition(gate.supabase, {
    stage: toStage,
    sector: targetSector,
    prevTaskId: input.prevTaskId ?? null,
    nextTaskId: input.nextTaskId ?? null,
  });

  const { error } = await gate.supabase
    .from('tasks')
    .update({
      stage: toStage,
      sector: targetSector,
      position,
      transition_note: note,
    })
    .eq('id', input.taskId);

  if (error) return { success: false, error: error.message };

  revalidateBoard(input.taskId);
  return { success: true };
}

/**
 * Ponto médio entre os dois vizinhos. Quando o intervalo aperta demais (o
 * arrasto repetido entre os mesmos dois cards divide o espaço pela metade a
 * cada vez), reequilibra a coluna e recalcula uma vez.
 */
async function resolvePosition(
  supabase: SupabaseClient,
  args: {
    stage: TaskStage | null;
    sector: TaskSector;
    prevTaskId: string | null;
    nextTaskId: string | null;
    retried?: boolean;
  },
): Promise<number> {
  const { stage, sector, prevTaskId, nextTaskId } = args;

  const neighbourIds = [prevTaskId, nextTaskId].filter((id): id is string => Boolean(id));

  let prevPos: number | null = null;
  let nextPos: number | null = null;

  if (neighbourIds.length > 0) {
    const { data } = await supabase.from('tasks').select('id, position').in('id', neighbourIds);
    const byId = new Map(
      ((data ?? []) as Array<{ id: string; position: number | string }>).map((r) => [
        r.id,
        Number(r.position),
      ]),
    );
    prevPos = prevTaskId ? byId.get(prevTaskId) ?? null : null;
    nextPos = nextTaskId ? byId.get(nextTaskId) ?? null : null;
  }

  if (prevPos !== null && nextPos !== null) {
    if (nextPos - prevPos < MIN_POSITION_GAP && !args.retried) {
      await supabase.rpc('rebalance_task_positions', {
        _stage: stage,
        _sector: stage === null ? sector : null,
      });
      return resolvePosition(supabase, { ...args, retried: true });
    }
    return (prevPos + nextPos) / 2;
  }

  if (prevPos !== null) return prevPos + POSITION_STEP;
  if (nextPos !== null) return nextPos - POSITION_STEP;

  // Coluna vazia: começa no primeiro degrau.
  return POSITION_STEP;
}

// -----------------------------------------------------------------------------
// Campos do card
// -----------------------------------------------------------------------------

export async function assignTaskAction(
  taskId: string,
  userId: string | null,
): Promise<ActionResult> {
  const gate = await ensureOrgMember();
  if (!gate.ok) return { success: false, error: gate.error };

  const { error } = await gate.supabase
    .from('tasks')
    .update({ assigned_to: userId })
    .eq('id', taskId);

  if (error) return { success: false, error: error.message };
  revalidateBoard(taskId);
  return { success: true };
}

/** `reason` null destrava. O trigger emite o evento e notifica os seguidores. */
export async function setTaskBlockedAction(
  taskId: string,
  reason: string | null,
): Promise<ActionResult> {
  const gate = await ensureOrgMember();
  if (!gate.ok) return { success: false, error: gate.error };

  const trimmed = reason?.trim() || null;
  if (reason !== null && !trimmed) {
    return { success: false, error: 'Diga o que está travando o card.' };
  }

  const { error } = await gate.supabase
    .from('tasks')
    .update({ blocked_reason: trimmed })
    .eq('id', taskId);

  if (error) return { success: false, error: error.message };
  revalidateBoard(taskId);
  return { success: true };
}

export interface UpdateTaskFieldsInput {
  taskId: string;
  title?: string;
  description?: string | null;
  clientName?: string | null;
  dueDate?: string | null;
  budgetId?: string | null;
}

export async function updateTaskFieldsAction(
  input: UpdateTaskFieldsInput,
): Promise<ActionResult> {
  const gate = await ensureOrgMember();
  if (!gate.ok) return { success: false, error: gate.error };

  const patch: Record<string, unknown> = {};

  if (input.title !== undefined) {
    const title = input.title.trim();
    if (!title) return { success: false, error: 'O título não pode ficar vazio.' };
    patch.title = title;
  }
  if (input.description !== undefined) patch.description = input.description?.trim() || null;
  if (input.clientName !== undefined) patch.client_name = input.clientName?.trim() || null;
  if (input.dueDate !== undefined) patch.due_date = input.dueDate || null;
  if (input.budgetId !== undefined) patch.budget_id = input.budgetId || null;

  if (Object.keys(patch).length === 0) return { success: true };

  const { error } = await gate.supabase.from('tasks').update(patch).eq('id', input.taskId);
  if (error) return { success: false, error: error.message };

  revalidateBoard(input.taskId);
  return { success: true };
}

export async function deleteTaskAction(taskId: string): Promise<ActionResult> {
  const gate = await ensureOrgMember();
  if (!gate.ok) return { success: false, error: gate.error };

  const { error } = await gate.supabase.from('tasks').delete().eq('id', taskId);
  if (error) return { success: false, error: error.message };

  revalidateBoard();
  return { success: true };
}

// -----------------------------------------------------------------------------
// Conversa e anexos
// -----------------------------------------------------------------------------

/**
 * `attachmentIds` são linhas de `task_attachments` já criadas por
 * `registerTaskAttachmentAction` (o arquivo subiu direto do browser para o
 * Storage). Aqui elas só são amarradas à mensagem — o que faz "mandei a foto no
 * chat" e "anexei no card" caírem na mesma grade de anexos.
 */
export async function sendTaskMessageAction(
  taskId: string,
  body: string,
  clientEventId: string,
  attachmentIds: string[] = [],
): Promise<ActionResult> {
  const gate = await ensureOrgMember();
  if (!gate.ok) return { success: false, error: gate.error };

  const trimmed = body.trim();
  if (!trimmed && attachmentIds.length === 0) {
    return { success: false, error: 'Escreva algo ou anexe um arquivo.' };
  }

  const { data, error } = await gate.supabase
    .from('task_messages')
    .insert({
      task_id: taskId,
      org_id: gate.orgId,
      sender_id: gate.userId,
      body: trimmed || null,
      client_event_id: clientEventId,
    })
    .select('id')
    .single();

  // 23505 = índice único em client_event_id. Reenvio (retry de rede, duplo
  // clique) não duplica, e não é erro para o usuário.
  if (error) {
    if (error.code === '23505') return { success: true };
    return { success: false, error: error.message };
  }

  if (attachmentIds.length > 0) {
    await gate.supabase
      .from('task_attachments')
      .update({ message_id: data.id as string })
      .in('id', attachmentIds);
  }

  revalidatePath(`/tarefas/${taskId}`);
  return { success: true };
}

export interface RegisterAttachmentInput {
  taskId: string;
  storagePath: string;
  fileName: string;
  mimeType?: string | null;
  fileSize?: number | null;
  width?: number | null;
  height?: number | null;
}

/**
 * Registra no banco um arquivo que o BROWSER já subiu para o bucket `tarefas`.
 *
 * O upload não passa por Server Action de propósito: o limite de body na Vercel
 * (~4.5 MB) é menor que uma foto de celular, e passar o arquivo por aqui
 * quebraria justamente o caso de uso principal — a equipe de campo mandando
 * foto do poste.
 */
export async function registerTaskAttachmentAction(
  input: RegisterAttachmentInput,
): Promise<ActionResult<{ id: string }>> {
  const gate = await ensureOrgMember();
  if (!gate.ok) return { success: false, error: gate.error };

  // O caminho é montado no cliente; conferir o prefixo aqui impede que uma
  // chamada forjada registre um arquivo de outra organização.
  if (!input.storagePath.startsWith(`${gate.orgId}/${input.taskId}/`)) {
    return { success: false, error: 'Caminho de arquivo inválido.' };
  }

  const { data, error } = await gate.supabase
    .from('task_attachments')
    .insert({
      task_id: input.taskId,
      org_id: gate.orgId,
      uploaded_by: gate.userId,
      storage_path: input.storagePath,
      file_name: input.fileName,
      mime_type: input.mimeType ?? null,
      file_size: input.fileSize ?? null,
      width: input.width ?? null,
      height: input.height ?? null,
    })
    .select('id')
    .single();

  if (error) return { success: false, error: error.message };

  revalidatePath(`/tarefas/${input.taskId}`);
  return { success: true, data: { id: data.id as string } };
}

export async function deleteTaskAttachmentAction(
  attachmentId: string,
): Promise<ActionResult> {
  const gate = await ensureOrgMember();
  if (!gate.ok) return { success: false, error: gate.error };

  const { data: row } = await gate.supabase
    .from('task_attachments')
    .select('task_id, storage_path')
    .eq('id', attachmentId)
    .maybeSingle();

  const { error } = await gate.supabase.from('task_attachments').delete().eq('id', attachmentId);
  if (error) return { success: false, error: error.message };

  // A linha some primeiro; se o objeto no bucket falhar, sobra um arquivo órfão
  // invisível — preferível ao inverso (miniatura quebrada na tela).
  if (row?.storage_path) {
    await gate.supabase.storage.from('tarefas').remove([row.storage_path as string]);
  }

  if (row?.task_id) revalidatePath(`/tarefas/${row.task_id}`);
  return { success: true };
}

/** URLs assinadas para os anexos de um card (bucket privado). */
export async function getTaskAttachmentUrlsAction(
  storagePaths: string[],
): Promise<ActionResult<Record<string, string>>> {
  const gate = await ensureOrgMember();
  if (!gate.ok) return { success: false, error: gate.error };
  if (storagePaths.length === 0) return { success: true, data: {} };

  const { data, error } = await gate.supabase.storage
    .from('tarefas')
    .createSignedUrls(storagePaths, 60 * 60);

  if (error) return { success: false, error: error.message };

  const map: Record<string, string> = {};
  for (const item of data ?? []) {
    if (item.path && item.signedUrl) map[item.path] = item.signedUrl;
  }
  return { success: true, data: map };
}

// -----------------------------------------------------------------------------
// Seguidores e notificações
// -----------------------------------------------------------------------------

export async function toggleTaskFollowAction(
  taskId: string,
  follow: boolean,
): Promise<ActionResult> {
  const gate = await ensureOrgMember();
  if (!gate.ok) return { success: false, error: gate.error };

  if (follow) {
    const { error } = await gate.supabase
      .from('task_followers')
      .insert({ task_id: taskId, user_id: gate.userId, org_id: gate.orgId, reason: 'manual' });
    if (error && error.code !== '23505') return { success: false, error: error.message };
  } else {
    const { error } = await gate.supabase
      .from('task_followers')
      .delete()
      .eq('task_id', taskId)
      .eq('user_id', gate.userId);
    if (error) return { success: false, error: error.message };
  }

  revalidatePath(`/tarefas/${taskId}`);
  return { success: true };
}

/** Traz um colega para o card — ele passa a receber as notificações. */
export async function addTaskFollowerAction(
  taskId: string,
  userId: string,
): Promise<ActionResult> {
  const gate = await ensureOrgMember();
  if (!gate.ok) return { success: false, error: gate.error };

  const { error } = await gate.supabase
    .from('task_followers')
    .insert({ task_id: taskId, user_id: userId, org_id: gate.orgId, reason: 'manual' });

  if (error && error.code !== '23505') return { success: false, error: error.message };

  revalidatePath(`/tarefas/${taskId}`);
  return { success: true };
}

export async function markTaskModuleSeenAction(scopeKey = ''): Promise<ActionResult> {
  const gate = await ensureOrgMember();
  if (!gate.ok) return { success: false, error: gate.error };

  const { error } = await gate.supabase.from('user_module_seen').upsert(
    {
      user_id: gate.userId,
      module_key: 'tarefas',
      scope_key: scopeKey,
      last_seen_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,module_key,scope_key' },
  );

  if (error) return { success: false, error: error.message };
  return { success: true };
}
