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
  | 'daily_log_approved'
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

// =============================================================================
// Chat 1:1 (Fase 5)
// =============================================================================

export type WorkMessageSenderRole = 'engineer' | 'manager';
export type WorkMessageAttachmentKind = 'image' | 'video' | 'audio';

export interface WorkMessageAttachment {
  id: string;
  messageId: string;
  workId: string;
  kind: WorkMessageAttachmentKind;
  storagePath: string;
  mimeType: string | null;
  sizeBytes: number | null;
  durationSeconds: number | null;
  width: number | null;
  height: number | null;
  thumbnailPath: string | null;
  createdAt: string;
}

export interface WorkMessage {
  id: string;
  workId: string;
  senderId: string;
  senderRole: WorkMessageSenderRole;
  body: string | null;
  clientEventId: string | null;
  readByEngineerAt: string | null;
  readByManagerAt: string | null;
  createdAt: string;
  attachments: WorkMessageAttachment[];
}

export interface SendWorkMessageAttachmentInput {
  kind: WorkMessageAttachmentKind;
  storagePath: string;
  mimeType?: string;
  sizeBytes?: number;
  durationSeconds?: number;
  width?: number;
  height?: number;
}

export interface SendWorkMessageInput {
  workId: string;
  messageId?: string;
  body?: string | null;
  attachments?: SendWorkMessageAttachmentInput[];
  clientEventId?: string;
}

export interface GetUploadUrlForChatAttachmentInput {
  workId: string;
  kind: WorkMessageAttachmentKind;
  fileName: string;
  sizeBytes: number;
  mimeType?: string;
  messageId?: string;
}

export interface ChatAttachmentUploadInfo {
  uploadUrl: string;
  uploadToken: string;
  storagePath: string;
  messageId: string;
}

export interface GetWorkMessagesResult {
  items: WorkMessage[];
  hasMore: boolean;
}

/** Limites por tipo de anexo (bytes). Validados client + server. */
export const CHAT_ATTACHMENT_LIMITS: Record<WorkMessageAttachmentKind, { maxBytes: number; mimePrefix: string; label: string }> = {
  image: { maxBytes: 10 * 1024 * 1024, mimePrefix: 'image/', label: 'imagem' },
  video: { maxBytes: 100 * 1024 * 1024, mimePrefix: 'video/', label: 'vídeo' },
  audio: { maxBytes: 25 * 1024 * 1024, mimePrefix: 'audio/', label: 'áudio' },
};

/** Limite de caracteres do body de uma mensagem. */
export const CHAT_MESSAGE_BODY_MAX = 4000;
/** Limite de anexos por mensagem. */
export const CHAT_MESSAGE_MAX_ATTACHMENTS = 10;
/** Pagina padrao de mensagens carregadas por vez. */
export const CHAT_MESSAGES_PAGE_SIZE = 50;
/** TTL de URL assinada de upload (segundos). */
export const CHAT_UPLOAD_URL_TTL_SECONDS = 60 * 15;
/** TTL de URL assinada de download/preview (segundos). */
export const CHAT_DOWNLOAD_URL_TTL_SECONDS = 60 * 30;

// =============================================================================
// Diario de Obra (Fase 6)
// =============================================================================

export type DailyLogStatus = 'pending_approval' | 'approved' | 'rejected';
export type DailyLogMediaKind = 'image' | 'video';
export type WorkMemberRole = 'engineer' | 'manager';

export interface MaterialConsumed {
  materialId?: string | null;
  name: string;
  unit: string;
  quantity: number;
}

export interface WorkDailyLogMedia {
  id: string;
  revisionId: string;
  dailyLogId: string;
  workId: string;
  kind: DailyLogMediaKind;
  storagePath: string;
  mimeType: string | null;
  sizeBytes: number | null;
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
  createdAt: string;
}

export interface WorkDailyLogRevision {
  id: string;
  dailyLogId: string;
  revisionNumber: number;
  crewPresent: string[];
  activities: string;
  postsInstalledCount: number | null;
  metersInstalled: MetersPlanned;
  materialsConsumed: MaterialConsumed[];
  incidents: string | null;
  rejectionReason: string | null;
  clientEventId: string | null;
  createdAt: string;
  media: WorkDailyLogMedia[];
}

export interface WorkDailyLog {
  id: string;
  workId: string;
  logDate: string;
  publishedBy: string;
  currentRevisionId: string | null;
  status: DailyLogStatus;
  approvedBy: string | null;
  approvedAt: string | null;
  rejectedAt: string | null;
  createdAt: string;
  updatedAt: string;
  currentRevision: WorkDailyLogRevision | null;
}

export interface WorkDailyLogWithHistory extends WorkDailyLog {
  revisions: WorkDailyLogRevision[];
}

export interface PublishDailyLogMediaInput {
  kind: DailyLogMediaKind;
  storagePath: string;
  mimeType?: string;
  sizeBytes?: number;
  width?: number;
  height?: number;
  durationSeconds?: number;
}

export interface PublishDailyLogInput {
  workId: string;
  logDate: string;
  activities: string;
  crewPresent?: string[];
  postsInstalledCount?: number | null;
  metersInstalled?: Partial<MetersPlanned>;
  materialsConsumed?: MaterialConsumed[];
  incidents?: string | null;
  media?: PublishDailyLogMediaInput[];
  clientEventId?: string;
}

export interface PublishDailyLogResult {
  dailyLogId: string;
  revisionId: string;
  revisionNumber: number;
}

export interface GetUploadUrlForDailyLogMediaInput {
  workId: string;
  dailyLogId: string;
  revisionId: string;
  kind: DailyLogMediaKind;
  fileName: string;
  sizeBytes: number;
  mimeType?: string;
}

export interface DailyLogMediaUploadInfo {
  uploadUrl: string;
  uploadToken: string;
  storagePath: string;
}

export interface GetWorkDailyLogsResult {
  items: WorkDailyLog[];
  hasMore: boolean;
}

/** Limites por tipo de midia do diario (bytes). */
export const DAILY_LOG_MEDIA_LIMITS: Record<DailyLogMediaKind, { maxBytes: number; mimePrefix: string; label: string }> = {
  image: { maxBytes: 10 * 1024 * 1024, mimePrefix: 'image/', label: 'imagem' },
  video: { maxBytes: 100 * 1024 * 1024, mimePrefix: 'video/', label: 'video' },
};

export const DAILY_LOG_ACTIVITIES_MIN = 10;
export const DAILY_LOG_ACTIVITIES_MAX = 4000;
export const DAILY_LOG_REJECTION_REASON_MIN = 5;
export const DAILY_LOG_REJECTION_REASON_MAX = 1000;
export const DAILY_LOG_PAGE_SIZE = 20;
export const DAILY_LOG_DOWNLOAD_URL_TTL_SECONDS = 60 * 30;

// =============================================================================
// Marcos da Obra com fluxo de aprovacao (Fase 6 - estende Fase 2)
// =============================================================================

export type MilestoneEventType = 'reported' | 'approved' | 'rejected' | 'reset';

export interface WorkMilestoneEventMedia {
  id: string;
  eventId: string;
  milestoneId: string;
  workId: string;
  kind: DailyLogMediaKind;
  storagePath: string;
  mimeType: string | null;
  sizeBytes: number | null;
  width: number | null;
  height: number | null;
  createdAt: string;
}

export interface WorkMilestoneEvent {
  id: string;
  milestoneId: string;
  workId: string;
  eventType: MilestoneEventType;
  actorId: string;
  actorRole: WorkMemberRole;
  notes: string | null;
  clientEventId: string | null;
  createdAt: string;
  media: WorkMilestoneEventMedia[];
}

export interface WorkMilestoneWithApproval extends WorkMilestone {
  reportedBy: string | null;
  reportedAt: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
  rejectedAt: string | null;
  rejectionReason: string | null;
  notes: string | null;
  evidenceMediaIds: string[];
  latestEvent: WorkMilestoneEvent | null;
  eventsCount: number;
}

export interface ReportMilestoneMediaInput {
  eventId: string;
  kind: DailyLogMediaKind;
  storagePath: string;
  mimeType?: string;
  sizeBytes?: number;
  width?: number;
  height?: number;
}

export interface ReportMilestoneInput {
  milestoneId: string;
  notes?: string | null;
  media?: ReportMilestoneMediaInput[];
  clientEventId?: string;
}

export interface GetUploadUrlForMilestoneEvidenceInput {
  workId: string;
  milestoneId: string;
  eventId: string;
  kind: DailyLogMediaKind;
  fileName: string;
  sizeBytes: number;
  mimeType?: string;
}

export interface MilestoneEvidenceUploadInfo {
  uploadUrl: string;
  uploadToken: string;
  storagePath: string;
  eventId: string;
}

export interface MilestoneFullHistory {
  milestone: WorkMilestoneWithApproval;
  events: WorkMilestoneEvent[];
}

export const MILESTONE_NOTES_MAX = 1000;
export const MILESTONE_REJECTION_REASON_MIN = 5;
export const MILESTONE_REJECTION_REASON_MAX = 1000;
export const MILESTONE_EVIDENCE_DOWNLOAD_URL_TTL_SECONDS = 60 * 30;

// =============================================================================
// Progresso da obra (Fase 6)
// =============================================================================

export interface SCurveDataPoint {
  date: string;
  plannedCumulative: number;
  realizedCumulative: number;
}

export interface MetersByCategory {
  planned: MetersPlanned;
  realized: MetersPlanned;
}

export interface WorkProgressData {
  postsPlanned: number;
  /** 0 ate Bloco 7 (work_pole_installations). */
  postsInstalled: number;
  metersByCategory: MetersByCategory;
  milestonesCounts: Record<MilestoneStatus, number>;
  sCurveData: SCurveDataPoint[];
  startedAt: string | null;
  expectedEndAt: string | null;
  totalMetersPlanned: number;
  totalMetersRealized: number;
}

export interface PendingDailyLogInfo {
  workId: string;
  dailyLogId: string;
  hoursWaiting: number;
}

export interface PendingMilestoneInfo {
  workId: string;
  milestoneId: string;
}

export interface WorkPendingApprovalsResult {
  pendingDailyLogs: PendingDailyLogInfo[];
  pendingMilestones: PendingMilestoneInfo[];
}

/** Limiar (em horas) acima do qual diario pendente vai para vermelho na home. */
export const PENDING_DAILY_LOG_RED_THRESHOLD_HOURS = 24;
