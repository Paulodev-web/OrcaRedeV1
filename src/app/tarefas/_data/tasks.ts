import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  TaskBoardColumns,
  TaskDetail,
  TaskListItem,
  TaskMemberRow,
  TaskMessageRow,
  TaskRow,
  TaskSector,
  TaskTransitionRow,
} from '@/types/tasks';

interface TaskDbRow {
  id: string;
  org_id: string;
  budget_id: string;
  title: string;
  description: string | null;
  sector: string;
  status: string;
  assigned_to: string | null;
  due_date: string | null;
  created_by: string;
  last_activity_at: string;
  created_at: string;
  updated_at: string;
}

function mapTaskRow(row: TaskDbRow): TaskRow {
  return {
    id: row.id,
    orgId: row.org_id,
    budgetId: row.budget_id,
    title: row.title,
    description: row.description,
    sector: row.sector as TaskSector,
    status: row.status as TaskRow['status'],
    assignedTo: row.assigned_to,
    dueDate: row.due_date,
    createdBy: row.created_by,
    lastActivityAt: row.last_activity_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Nome de exibição por id de usuário — busca em lote, uma vez por tela. */
async function resolveProfileNames(
  supabase: SupabaseClient,
  userIds: ReadonlyArray<string>,
): Promise<Map<string, string>> {
  const unique = [...new Set(userIds)];
  if (unique.length === 0) return new Map();

  const { data } = await supabase
    .from('profiles')
    .select('id, full_name, email')
    .in('id', unique);

  const map = new Map<string, string>();
  for (const row of (data ?? []) as Array<{ id: string; full_name: string | null; email: string | null }>) {
    map.set(row.id, (row.full_name && row.full_name.trim()) || row.email || row.id);
  }
  return map;
}

async function resolveBudgetNames(
  supabase: SupabaseClient,
  budgetIds: ReadonlyArray<string>,
): Promise<Map<string, string>> {
  const unique = [...new Set(budgetIds)];
  if (unique.length === 0) return new Map();

  const { data } = await supabase
    .from('budgets')
    .select('id, project_name')
    .in('id', unique);

  const map = new Map<string, string>();
  for (const row of (data ?? []) as Array<{ id: string; project_name: string }>) {
    map.set(row.id, row.project_name);
  }
  return map;
}

async function toListItems(supabase: SupabaseClient, rows: TaskDbRow[]): Promise<TaskListItem[]> {
  if (rows.length === 0) return [];

  const tasks = rows.map(mapTaskRow);
  const [budgetNames, profileNames] = await Promise.all([
    resolveBudgetNames(supabase, tasks.map((t) => t.budgetId)),
    resolveProfileNames(supabase, tasks.filter((t) => t.assignedTo).map((t) => t.assignedTo as string)),
  ]);

  return tasks.map((task) => ({
    ...task,
    budgetProjectName: budgetNames.get(task.budgetId) ?? null,
    assignedToName: task.assignedTo ? profileNames.get(task.assignedTo) ?? null : null,
  }));
}

/** Setor do usuário na org ativa — default do board ao abrir /tarefas. */
export async function getDefaultSector(supabase: SupabaseClient): Promise<TaskSector | null> {
  const { data } = await supabase.rpc('current_org_sector');
  return (data as TaskSector | null) ?? null;
}

/**
 * Board de um setor, agrupado por status — as 3 colunas do Quadro de Trabalho
 * (mapeamentooperacional.md §5.1: "visão do que está na fila, em andamento e
 * concluído para cada setor"). RLS já escopa por org; o filtro aqui é só por
 * `sector`.
 */
export async function getBoardData(
  supabase: SupabaseClient,
  sector: TaskSector,
): Promise<TaskBoardColumns> {
  const { data, error } = await supabase
    .from('tasks')
    .select(
      'id, org_id, budget_id, title, description, sector, status, assigned_to, due_date, created_by, last_activity_at, created_at, updated_at',
    )
    .eq('sector', sector)
    .order('last_activity_at', { ascending: false });

  if (error) throw new Error(`Não foi possível carregar o quadro: ${error.message}`);

  const items = await toListItems(supabase, (data ?? []) as TaskDbRow[]);

  return {
    fila: items.filter((t) => t.status === 'fila'),
    andamento: items.filter((t) => t.status === 'andamento'),
    concluida: items.filter((t) => t.status === 'concluida'),
  };
}

/** Tasks de um orçamento — alimenta a aba "Tarefas" do workspace de orçamento. */
export async function getTasksForBudget(
  supabase: SupabaseClient,
  budgetId: string,
): Promise<TaskListItem[]> {
  const { data, error } = await supabase
    .from('tasks')
    .select(
      'id, org_id, budget_id, title, description, sector, status, assigned_to, due_date, created_by, last_activity_at, created_at, updated_at',
    )
    .eq('budget_id', budgetId)
    .order('created_at', { ascending: false });

  if (error) throw new Error(`Não foi possível carregar as tarefas do orçamento: ${error.message}`);

  return toListItems(supabase, (data ?? []) as TaskDbRow[]);
}

/** Task + histórico de transições + chat + participantes, para /tarefas/[taskId]. */
export async function getTaskDetail(
  supabase: SupabaseClient,
  taskId: string,
): Promise<TaskDetail | null> {
  const { data: taskRow, error: taskError } = await supabase
    .from('tasks')
    .select(
      'id, org_id, budget_id, title, description, sector, status, assigned_to, due_date, created_by, last_activity_at, created_at, updated_at',
    )
    .eq('id', taskId)
    .maybeSingle();

  if (taskError) throw new Error(`Não foi possível carregar a tarefa: ${taskError.message}`);
  if (!taskRow) return null;

  const [{ data: transitionRows }, { data: messageRows }, { data: memberRows }] = await Promise.all([
    supabase
      .from('task_transitions')
      .select('id, task_id, actor_id, from_sector, to_sector, from_status, to_status, note, created_at')
      .eq('task_id', taskId)
      .order('created_at', { ascending: false }),
    supabase
      .from('task_messages')
      .select('id, task_id, sender_id, body, client_event_id, created_at')
      .eq('task_id', taskId)
      .order('created_at', { ascending: true }),
    supabase
      .from('task_members')
      .select('task_id, user_id, added_by, created_at')
      .eq('task_id', taskId),
  ]);

  const listItems = await toListItems(supabase, [taskRow as TaskDbRow]);
  const base = listItems[0];

  const actorIds = (transitionRows ?? []).map((r) => r.actor_id as string);
  const senderIds = (messageRows ?? []).map((r) => r.sender_id as string);
  const memberIds = (memberRows ?? []).map((r) => r.user_id as string);
  const names = await resolveProfileNames(supabase, [...actorIds, ...senderIds, ...memberIds]);

  const transitions: TaskTransitionRow[] = (transitionRows ?? []).map((row) => ({
    id: row.id as string,
    taskId: row.task_id as string,
    actorId: row.actor_id as string,
    actorName: names.get(row.actor_id as string) ?? null,
    fromSector: (row.from_sector as TaskSector | null) ?? null,
    toSector: (row.to_sector as TaskSector | null) ?? null,
    fromStatus: (row.from_status as TaskRow['status'] | null) ?? null,
    toStatus: (row.to_status as TaskRow['status'] | null) ?? null,
    note: (row.note as string | null) ?? null,
    createdAt: row.created_at as string,
  }));

  const messages: TaskMessageRow[] = (messageRows ?? []).map((row) => ({
    id: row.id as string,
    taskId: row.task_id as string,
    senderId: row.sender_id as string,
    senderName: names.get(row.sender_id as string) ?? null,
    body: row.body as string,
    clientEventId: (row.client_event_id as string | null) ?? null,
    createdAt: row.created_at as string,
  }));

  const members: TaskMemberRow[] = (memberRows ?? []).map((row) => ({
    taskId: row.task_id as string,
    userId: row.user_id as string,
    userName: names.get(row.user_id as string) ?? null,
    addedBy: row.added_by as string,
    createdAt: row.created_at as string,
  }));

  return { ...base, transitions, messages, members };
}

/** Orçamentos da org ativa, para o seletor do formulário de criação de task. */
export async function getBudgetsForTaskPicker(
  supabase: SupabaseClient,
): Promise<Array<{ id: string; projectName: string }>> {
  const { data, error } = await supabase
    .from('budgets')
    .select('id, project_name')
    .order('updated_at', { ascending: false })
    .limit(200);

  if (error) throw new Error(`Não foi possível carregar orçamentos: ${error.message}`);

  return (data ?? []).map((row) => ({ id: row.id as string, projectName: row.project_name as string }));
}
