/**
 * Modelo do Quadro de Trabalho (mapeamentooperacional.md §5.1).
 *
 * `TaskSector` reaproveita os mesmos 4 valores de `OrgSector`
 * (`src/types/organization.ts`) — é o mesmo enum, com outro nome de domínio
 * porque aqui representa "a fila responsável pela task", não "onde a pessoa
 * trabalha". Reexportado em vez de duplicado.
 */
import type { OrgSector } from './organization';

export { ORG_SECTORS as TASK_SECTORS, ORG_SECTOR_LABELS as TASK_SECTOR_LABELS } from './organization';
export type TaskSector = OrgSector;

export const TASK_STATUSES = ['fila', 'andamento', 'concluida'] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  fila: 'Fila',
  andamento: 'Em andamento',
  concluida: 'Concluída',
};

export interface TaskRow {
  id: string;
  orgId: string;
  budgetId: string;
  title: string;
  description: string | null;
  sector: TaskSector;
  status: TaskStatus;
  assignedTo: string | null;
  dueDate: string | null;
  createdBy: string;
  lastActivityAt: string;
  createdAt: string;
  updatedAt: string;
}

/** Task com dados denormalizados só de leitura — para as listagens do board. */
export interface TaskListItem extends TaskRow {
  budgetProjectName: string | null;
  assignedToName: string | null;
}

export interface TaskTransitionRow {
  id: string;
  taskId: string;
  actorId: string;
  actorName: string | null;
  fromSector: TaskSector | null;
  toSector: TaskSector | null;
  fromStatus: TaskStatus | null;
  toStatus: TaskStatus | null;
  note: string | null;
  createdAt: string;
}

export interface TaskMemberRow {
  taskId: string;
  userId: string;
  userName: string | null;
  addedBy: string;
  createdAt: string;
}

export interface TaskMessageRow {
  id: string;
  taskId: string;
  senderId: string;
  senderName: string | null;
  body: string;
  clientEventId: string | null;
  createdAt: string;
}

export interface TaskDetail extends TaskListItem {
  transitions: TaskTransitionRow[];
  messages: TaskMessageRow[];
  members: TaskMemberRow[];
}

/** Board agrupado por status — as 3 colunas de um setor. */
export interface TaskBoardColumns {
  fila: TaskListItem[];
  andamento: TaskListItem[];
  concluida: TaskListItem[];
}

export interface CreateTaskInput {
  budgetId: string;
  title: string;
  description?: string | null;
  sector: TaskSector;
  dueDate?: string | null;
}

export interface MoveTaskInput {
  taskId: string;
  sector?: TaskSector;
  status?: TaskStatus;
  note?: string | null;
}
