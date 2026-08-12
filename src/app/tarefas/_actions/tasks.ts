'use server';

import { revalidatePath } from 'next/cache';
import { ensureOrgMember } from '@/lib/auth/ensureOrgMember';
import type { ActionResult } from '@/types/works';
import type { CreateTaskInput, MoveTaskInput } from '@/types/tasks';

function revalidateTask(taskId: string) {
  revalidatePath('/tarefas');
  revalidatePath(`/tarefas/${taskId}`);
}

export async function createTaskAction(input: CreateTaskInput): Promise<ActionResult<{ id: string }>> {
  const gate = await ensureOrgMember();
  if (!gate.ok) return { success: false, error: gate.error };

  const title = input.title.trim();
  if (title.length === 0) {
    return { success: false, error: 'O título da tarefa é obrigatório.' };
  }

  const { data, error } = await gate.supabase
    .from('tasks')
    .insert({
      org_id: gate.orgId,
      budget_id: input.budgetId,
      title,
      description: input.description?.trim() || null,
      sector: input.sector,
      due_date: input.dueDate || null,
      created_by: gate.userId,
    })
    .select('id')
    .single();

  if (error) return { success: false, error: error.message };

  revalidatePath('/tarefas');
  revalidatePath(`/orcamentos/${input.budgetId}/tarefas`);
  return { success: true, data: { id: data.id as string } };
}

/**
 * Ação central do board: um único UPDATE que muda `sector` e/ou `status`. O
 * trigger `tasks_audit_transitions` (20260812120000_tarefas_core.sql) cuida
 * do resto — histórico, reset de status no handoff, notificação. Drag-and-drop
 * e o botão "Mover para <setor>" chamam a mesma função.
 */
export async function moveTaskAction(input: MoveTaskInput): Promise<ActionResult> {
  const gate = await ensureOrgMember();
  if (!gate.ok) return { success: false, error: gate.error };

  const patch: Record<string, unknown> = {};
  if (input.sector) patch.sector = input.sector;
  if (input.status) patch.status = input.status;
  if (input.note !== undefined) patch.transition_note = input.note;

  if (Object.keys(patch).length === 0) {
    return { success: false, error: 'Nada para mover.' };
  }

  const { error } = await gate.supabase.from('tasks').update(patch).eq('id', input.taskId);
  if (error) return { success: false, error: error.message };

  revalidateTask(input.taskId);
  return { success: true };
}

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

  revalidateTask(taskId);
  return { success: true };
}

export async function sendTaskMessageAction(
  taskId: string,
  body: string,
  clientEventId: string,
): Promise<ActionResult> {
  const gate = await ensureOrgMember();
  if (!gate.ok) return { success: false, error: gate.error };

  const trimmed = body.trim();
  if (trimmed.length === 0) return { success: false, error: 'Mensagem vazia.' };

  const { error } = await gate.supabase.from('task_messages').insert({
    task_id: taskId,
    sender_id: gate.userId,
    body: trimmed,
    client_event_id: clientEventId,
  });

  // Índice único em client_event_id: reenvio (ex.: retry de rede) não duplica.
  if (error && error.code !== '23505') {
    return { success: false, error: error.message };
  }

  revalidatePath(`/tarefas/${taskId}`);
  return { success: true };
}

export async function addTaskParticipantAction(
  taskId: string,
  userId: string,
): Promise<ActionResult> {
  const gate = await ensureOrgMember();
  if (!gate.ok) return { success: false, error: gate.error };

  const { error } = await gate.supabase
    .from('task_members')
    .insert({ task_id: taskId, user_id: userId, added_by: gate.userId });

  if (error && error.code !== '23505') {
    return { success: false, error: error.message };
  }

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
