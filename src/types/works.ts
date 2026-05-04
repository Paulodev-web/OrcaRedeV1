export type WorkStatus =
  | 'planned'
  | 'in_progress'
  | 'paused'
  | 'completed'
  | 'cancelled';

export type MilestoneStatus =
  | 'pending'
  | 'in_progress'
  | 'awaiting_approval'
  | 'approved'
  | 'rejected';

export type MilestoneCode =
  | 'survey'
  | 'poles'
  | 'cabling_lv'
  | 'cabling_mv'
  | 'energization'
  | 'commissioning';

export type NotificationKind =
  | 'work_created'
  | 'message_received'
  | 'daily_log_published'
  | 'daily_log_rejected'
  | 'checklist_completed'
  | 'checklist_returned'
  | 'milestone_reported'
  | 'milestone_approved'
  | 'milestone_rejected'
  | 'alert_opened'
  | 'alert_resolved_in_field'
  | 'alert_closed'
  | 'pole_installed';

export interface WorkRow {
  id: string;
  engineerId: string;
  managerId: string | null;
  budgetId: string | null;
  name: string;
  clientName: string | null;
  utilityCompany: string | null;
  address: string | null;
  status: WorkStatus;
  startedAt: string | null;
  expectedEndAt: string | null;
  completedAt: string | null;
  lastActivityAt: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WorkWithManager extends WorkRow {
  managerName: string | null;
}

export interface WorkMilestone {
  id: string;
  workId: string;
  code: MilestoneCode;
  name: string;
  orderIndex: number;
  status: MilestoneStatus;
}

export interface NotificationRow {
  id: string;
  userId: string;
  workId: string | null;
  kind: NotificationKind;
  title: string;
  body: string | null;
  linkPath: string | null;
  isRead: boolean;
  createdAt: string;
}

export interface NotificationsResult {
  items: NotificationRow[];
  unreadCount: number;
}

export interface WorksGrouped {
  red: WorkWithManager[];
  yellow: WorkWithManager[];
  green: WorkWithManager[];
  gray: WorkWithManager[];
}

export interface CategorizeWorksOptions {
  workIdsWithAlerts?: ReadonlyArray<string>;
  workIdsWithPending?: ReadonlyArray<string>;
}

export interface CreateWorkInput {
  name: string;
  clientName?: string | null;
  utilityCompany?: string | null;
  address?: string | null;
  managerId?: string | null;
  startedAt?: string | null;
  expectedEndAt?: string | null;
  notes?: string | null;
}

export interface UpdateWorkInput {
  id: string;
  name?: string;
  clientName?: string | null;
  utilityCompany?: string | null;
  address?: string | null;
  managerId?: string | null;
  startedAt?: string | null;
  expectedEndAt?: string | null;
  notes?: string | null;
  status?: WorkStatus;
}

export type ActionResult<T = undefined> =
  | { success: true; data?: T }
  | { success: false; error: string };

export const STATUS_LABELS: Record<WorkStatus, string> = {
  planned: 'Planejada',
  in_progress: 'Em andamento',
  paused: 'Pausada',
  completed: 'Concluída',
  cancelled: 'Cancelada',
};

export const MILESTONE_LABELS: Record<MilestoneCode, string> = {
  survey: 'Locação',
  poles: 'Postes instalados',
  cabling_lv: 'Cabeamento BT',
  cabling_mv: 'Cabeamento MT',
  energization: 'Energização',
  commissioning: 'Comissionamento',
};

// =============================================================================
// Importação de orçamento (Fase 3)
// =============================================================================

/** Item da listagem de orçamentos importáveis em `BudgetPickerStep`. */
export interface ImportableBudget {
  id: string;
  projectName: string;
  clientName: string | null;
  city: string | null;
  finalizedAt: string;
  postsCount: number;
  /** Conexões persistidas via último `work_trackings` legado (pode ser 0). */
  persistedConnectionsCount: number;
  hasPdf: boolean;
  /** Quantas obras "ativas" (não canceladas) já existem com este budget_id para o engineer. */
  existingActiveWorksCount: number;
}

/** Material consolidado armazenado em `work_project_snapshot.materials_planned`. */
export interface MaterialPlanned {
  material_id: string;
  code: string;
  name: string;
  unit: string;
  quantity: number;
}

/**
 * Metragem planejada armazenada em `work_project_snapshot.meters_planned`.
 * Convenção: chaves sempre presentes com 0 quando o orçamento não tinha tracking
 * legado (única fonte hoje). Documentado no plano da Fase 3.
 */
export interface MetersPlanned {
  BT: number;
  MT: number;
  rede: number;
}

export interface WorkProjectSnapshot {
  workId: string;
  sourceBudgetId: string | null;
  pdfStoragePath: string | null;
  originalPdfPath: string | null;
  renderVersion: number | null;
  pdfNumPages: number | null;
  materialsPlanned: MaterialPlanned[];
  metersPlanned: MetersPlanned;
  importedAt: string;
  importedBy: string;
}

export interface WorkProjectPost {
  id: string;
  workId: string;
  sourcePostId: string | null;
  numbering: string | null;
  postType: string | null;
  xCoord: number;
  yCoord: number;
  metadata: Record<string, unknown>;
}

export interface WorkProjectConnection {
  id: string;
  workId: string;
  sourceConnectionId: string | null;
  fromPostId: string;
  toPostId: string;
  color: 'blue' | 'green' | null;
  metadata: Record<string, unknown>;
}

export interface WorkProjectSnapshotBundle {
  snapshot: WorkProjectSnapshot;
  posts: WorkProjectPost[];
  connections: WorkProjectConnection[];
}

export interface CreateWorkFromBudgetInput {
  budgetId: string;
  name?: string | null;
  clientName?: string | null;
  utilityCompany?: string | null;
  address?: string | null;
  managerId?: string | null;
  startedAt?: string | null;
  expectedEndAt?: string | null;
  notes?: string | null;
}
