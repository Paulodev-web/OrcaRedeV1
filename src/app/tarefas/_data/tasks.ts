import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  TASK_SECTORS,
  TASK_STAGES,
  type TaskAttachmentRow,
  type TaskBoard,
  type TaskBoardMember,
  type TaskCard,
  type TaskDetail,
  type TaskEventKind,
  type TaskEventRow,
  type TaskFollowerRow,
  type TaskMessageRow,
  type TaskMoveDirection,
  type TaskRow,
  type TaskSector,
  type TaskStage,
} from '@/types/tasks';

const TASK_COLUMNS =
  'id, org_id, title, description, client_name, stage, sector, position, ' +
  'assigned_to, blocked_reason, due_date, budget_id, work_id, created_by, ' +
  'last_activity_at, created_at, updated_at';

interface TaskDbRow {
  id: string;
  org_id: string;
  title: string;
  description: string | null;
  client_name: string | null;
  stage: string | null;
  sector: string;
  position: number | string;
  assigned_to: string | null;
  blocked_reason: string | null;
  due_date: string | null;
  budget_id: string | null;
  work_id: string | null;
  created_by: string;
  last_activity_at: string;
  created_at: string;
  updated_at: string;
}

function mapTaskRow(row: TaskDbRow): TaskRow {
  return {
    id: row.id,
    orgId: row.org_id,
    title: row.title,
    description: row.description,
    clientName: row.client_name,
    stage: (row.stage as TaskStage | null) ?? null,
    sector: row.sector as TaskSector,
    // `position` é NUMERIC no Postgres, e o driver entrega NUMERIC como string
    // para não perder precisão. Sem este Number() a ordenação do board vira
    // ordenação lexicográfica e "1000" fica depois de "10000".
    position: Number(row.position),
    assignedTo: row.assigned_to,
    blockedReason: row.blocked_reason,
    dueDate: row.due_date,
    budgetId: row.budget_id,
    workId: row.work_id,
    createdBy: row.created_by,
    lastActivityAt: row.last_activity_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Nome de exibição por id de usuário — uma consulta em lote por tela. */
async function resolveProfileNames(
  supabase: SupabaseClient,
  userIds: ReadonlyArray<string | null>,
): Promise<Map<string, string>> {
  const unique = [...new Set(userIds.filter((id): id is string => Boolean(id)))];
  if (unique.length === 0) return new Map();

  const { data } = await supabase.from('profiles').select('id, full_name, email').in('id', unique);

  const map = new Map<string, string>();
  for (const row of (data ?? []) as Array<{ id: string; full_name: string | null; email: string | null }>) {
    map.set(row.id, (row.full_name && row.full_name.trim()) || row.email || 'Sem nome');
  }
  return map;
}

async function resolveBudgetNames(
  supabase: SupabaseClient,
  budgetIds: ReadonlyArray<string | null>,
): Promise<Map<string, string>> {
  const unique = [...new Set(budgetIds.filter((id): id is string => Boolean(id)))];
  if (unique.length === 0) return new Map();

  const { data } = await supabase.from('budgets').select('id, project_name').in('id', unique);

  const map = new Map<string, string>();
  for (const row of (data ?? []) as Array<{ id: string; project_name: string }>) {
    map.set(row.id, row.project_name);
  }
  return map;
}

/**
 * Contadores de mensagem e anexo por task, em duas consultas para o board
 * inteiro. Vêm como agregação no cliente e não como subselect por card porque
 * o PostgREST não expõe `count` de relacionamento junto de outros filtros sem
 * pagar um round-trip por linha.
 */
async function resolveCounts(
  supabase: SupabaseClient,
  taskIds: ReadonlyArray<string>,
): Promise<{ messages: Map<string, number>; attachments: Map<string, number> }> {
  if (taskIds.length === 0) return { messages: new Map(), attachments: new Map() };

  const [{ data: msgRows }, { data: attRows }] = await Promise.all([
    supabase.from('task_messages').select('task_id').in('task_id', taskIds),
    supabase.from('task_attachments').select('task_id').in('task_id', taskIds),
  ]);

  const tally = (rows: Array<{ task_id: string }> | null) => {
    const map = new Map<string, number>();
    for (const row of rows ?? []) map.set(row.task_id, (map.get(row.task_id) ?? 0) + 1);
    return map;
  };

  return {
    messages: tally(msgRows as Array<{ task_id: string }> | null),
    attachments: tally(attRows as Array<{ task_id: string }> | null),
  };
}

async function toCards(supabase: SupabaseClient, rows: TaskDbRow[]): Promise<TaskCard[]> {
  if (rows.length === 0) return [];

  const tasks = rows.map(mapTaskRow);
  const [budgetNames, profileNames, counts] = await Promise.all([
    resolveBudgetNames(supabase, tasks.map((t) => t.budgetId)),
    resolveProfileNames(supabase, tasks.map((t) => t.assignedTo)),
    resolveCounts(supabase, tasks.map((t) => t.id)),
  ]);

  return tasks.map((task) => ({
    ...task,
    budgetProjectName: task.budgetId ? budgetNames.get(task.budgetId) ?? null : null,
    assignedToName: task.assignedTo ? profileNames.get(task.assignedTo) ?? null : null,
    messageCount: counts.messages.get(task.id) ?? 0,
    attachmentCount: counts.attachments.get(task.id) ?? 0,
  }));
}

/** Setor do usuário na org ativa — define qual faixa da esteira vem realçada. */
export async function getViewerSector(supabase: SupabaseClient): Promise<TaskSector | null> {
  const { data } = await supabase.rpc('current_org_sector');
  return (data as TaskSector | null) ?? null;
}

/**
 * A esteira inteira, de uma vez.
 *
 * Uma consulta só para todas as colunas — e não uma por etapa — porque o board
 * é client-side a partir daqui: o servidor entrega o estado inicial completo e
 * o `BoardProvider` passa a ser o dono. Trocar de filtro ou mover um card não
 * volta ao servidor para redesenhar.
 */
export async function getBoard(supabase: SupabaseClient): Promise<TaskBoard> {
  const { data, error } = await supabase
    .from('tasks')
    .select(TASK_COLUMNS)
    .order('position', { ascending: true });

  if (error) throw new Error(`Não foi possível carregar a esteira: ${error.message}`);

  const cards = await toCards(supabase, (data ?? []) as unknown as TaskDbRow[]);

  const columns = TASK_STAGES.map((stage) => ({
    stage,
    cards: cards.filter((card) => card.stage === stage),
  }));

  const avulsas = Object.fromEntries(
    TASK_SECTORS.map((sector) => [
      sector,
      cards.filter((card) => card.stage === null && card.sector === sector),
    ]),
  ) as Record<TaskSector, TaskCard[]>;

  return { columns, avulsas };
}

/** Membros ativos da org — alimenta o seletor de responsável e os avatares. */
export async function getBoardMembers(supabase: SupabaseClient): Promise<TaskBoardMember[]> {
  const { data, error } = await supabase
    .from('org_members')
    .select('user_id, sector')
    .eq('is_active', true);

  if (error) return [];

  const rows = (data ?? []) as Array<{ user_id: string; sector: string | null }>;
  const names = await resolveProfileNames(supabase, rows.map((r) => r.user_id));

  return rows
    .map((row) => ({
      userId: row.user_id,
      name: names.get(row.user_id) ?? 'Sem nome',
      sector: (row.sector as TaskSector | null) ?? null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
}

/** Tasks de um orçamento — alimenta a aba "Tarefas" do workspace de orçamento. */
export async function getTasksForBudget(
  supabase: SupabaseClient,
  budgetId: string,
): Promise<TaskCard[]> {
  const { data, error } = await supabase
    .from('tasks')
    .select(TASK_COLUMNS)
    .eq('budget_id', budgetId)
    .order('created_at', { ascending: false });

  if (error) throw new Error(`Não foi possível carregar as tarefas do orçamento: ${error.message}`);

  return toCards(supabase, (data ?? []) as unknown as TaskDbRow[]);
}

function mapAttachment(
  row: Record<string, unknown>,
  names: Map<string, string>,
): TaskAttachmentRow {
  const uploadedBy = row.uploaded_by as string;
  return {
    id: row.id as string,
    taskId: row.task_id as string,
    messageId: (row.message_id as string | null) ?? null,
    uploadedBy,
    uploadedByName: names.get(uploadedBy) ?? null,
    storagePath: row.storage_path as string,
    fileName: row.file_name as string,
    mimeType: (row.mime_type as string | null) ?? null,
    fileSize: row.file_size === null || row.file_size === undefined ? null : Number(row.file_size),
    width: (row.width as number | null) ?? null,
    height: (row.height as number | null) ?? null,
    createdAt: row.created_at as string,
  };
}

/** Card completo: linha do tempo, conversa, anexos e seguidores. */
export async function getTaskDetail(
  supabase: SupabaseClient,
  taskId: string,
): Promise<TaskDetail | null> {
  const { data: taskRow, error: taskError } = await supabase
    .from('tasks')
    .select(TASK_COLUMNS)
    .eq('id', taskId)
    .maybeSingle();

  if (taskError) throw new Error(`Não foi possível carregar a tarefa: ${taskError.message}`);
  if (!taskRow) return null;

  const [{ data: eventRows }, { data: messageRows }, { data: attachmentRows }, { data: followerRows }] =
    await Promise.all([
      supabase
        .from('task_events')
        .select('id, task_id, actor_id, kind, from_stage, to_stage, from_sector, to_sector, direction, note, created_at')
        .eq('task_id', taskId)
        .order('created_at', { ascending: true }),
      supabase
        .from('task_messages')
        .select('id, task_id, sender_id, body, client_event_id, created_at')
        .eq('task_id', taskId)
        .order('created_at', { ascending: true }),
      supabase
        .from('task_attachments')
        .select('id, task_id, message_id, uploaded_by, storage_path, file_name, mime_type, file_size, width, height, created_at')
        .eq('task_id', taskId)
        .order('created_at', { ascending: true }),
      supabase.from('task_followers').select('task_id, user_id, reason').eq('task_id', taskId),
    ]);

  const cards = await toCards(supabase, [taskRow as unknown as TaskDbRow]);
  const base = cards[0];

  const names = await resolveProfileNames(supabase, [
    ...(eventRows ?? []).map((r) => r.actor_id as string | null),
    ...(messageRows ?? []).map((r) => r.sender_id as string),
    ...(attachmentRows ?? []).map((r) => r.uploaded_by as string),
    ...(followerRows ?? []).map((r) => r.user_id as string),
  ]);

  const events: TaskEventRow[] = (eventRows ?? []).map((row) => ({
    id: row.id as string,
    taskId: row.task_id as string,
    actorId: (row.actor_id as string | null) ?? null,
    actorName: row.actor_id ? names.get(row.actor_id as string) ?? null : null,
    kind: row.kind as TaskEventKind,
    fromStage: (row.from_stage as TaskStage | null) ?? null,
    toStage: (row.to_stage as TaskStage | null) ?? null,
    fromSector: (row.from_sector as TaskSector | null) ?? null,
    toSector: (row.to_sector as TaskSector | null) ?? null,
    direction: (row.direction as TaskMoveDirection | null) ?? null,
    note: (row.note as string | null) ?? null,
    createdAt: row.created_at as string,
  }));

  const allAttachments = (attachmentRows ?? []).map((row) => mapAttachment(row, names));
  const attachmentsByMessage = new Map<string, TaskAttachmentRow[]>();
  for (const att of allAttachments) {
    if (!att.messageId) continue;
    const list = attachmentsByMessage.get(att.messageId) ?? [];
    list.push(att);
    attachmentsByMessage.set(att.messageId, list);
  }

  const messages: TaskMessageRow[] = (messageRows ?? []).map((row) => ({
    id: row.id as string,
    taskId: row.task_id as string,
    senderId: row.sender_id as string,
    senderName: names.get(row.sender_id as string) ?? null,
    body: (row.body as string | null) ?? null,
    clientEventId: (row.client_event_id as string | null) ?? null,
    createdAt: row.created_at as string,
    attachments: attachmentsByMessage.get(row.id as string) ?? [],
  }));

  const followers: TaskFollowerRow[] = (followerRows ?? []).map((row) => ({
    taskId: row.task_id as string,
    userId: row.user_id as string,
    userName: names.get(row.user_id as string) ?? null,
    reason: row.reason as TaskFollowerRow['reason'],
  }));

  return {
    ...base,
    events,
    messages,
    cardAttachments: allAttachments.filter((att) => att.messageId === null),
    followers,
  };
}

/** Orçamentos da org — seletor de vínculo no card e no formulário de criação. */
export async function getBudgetOptions(
  supabase: SupabaseClient,
): Promise<Array<{ id: string; projectName: string; clientName: string | null }>> {
  const { data, error } = await supabase
    .from('budgets')
    .select('id, project_name, client_name')
    .eq('is_template', false)
    .order('updated_at', { ascending: false })
    .limit(200);

  if (error) return [];

  return (data ?? []).map((row) => ({
    id: row.id as string,
    projectName: row.project_name as string,
    clientName: (row.client_name as string | null) ?? null,
  }));
}
