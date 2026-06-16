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
  | 'checklist_assigned'
  | 'checklist_completed'
  | 'checklist_validated'
  | 'checklist_returned'
  | 'milestone_reported'
  | 'milestone_approved'
  | 'milestone_rejected'
  | 'alert_opened'
  | 'alert_acknowledged'
  | 'alert_resolved_in_field'
  | 'alert_closed'
  | 'alert_reopened'
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

// =============================================================================
// Instalacao de postes em campo (Fase 7)
// =============================================================================

export type PoleInstallationStatus = 'installed' | 'removed';
export type PoleInstallationMediaKind = 'image' | 'video';

export interface WorkPoleInstallationMedia {
  id: string;
  installationId: string;
  workId: string;
  kind: PoleInstallationMediaKind;
  storagePath: string;
  mimeType: string | null;
  sizeBytes: number | null;
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
  isPrimary: boolean;
  createdAt: string;
}

export interface WorkPoleInstallation {
  id: string;
  workId: string;
  createdBy: string;
  xCoord: number;
  yCoord: number;
  gpsLat: number | null;
  gpsLng: number | null;
  gpsAccuracyMeters: number | null;
  numbering: string | null;
  poleType: string | null;
  notes: string | null;
  installedAt: string;
  status: PoleInstallationStatus;
  removedAt: string | null;
  removedBy: string | null;
  clientEventId: string;
  createdAt: string;
  updatedAt: string;
  media: WorkPoleInstallationMedia[];
}

export interface RecordPoleInstallationMediaInput {
  kind: PoleInstallationMediaKind;
  storagePath: string;
  mimeType?: string;
  sizeBytes?: number;
  width?: number;
  height?: number;
  durationSeconds?: number;
  isPrimary?: boolean;
}

export interface RecordPoleInstallationInput {
  workId: string;
  /** Opcional; se ausente, e gerado server-side. APK costuma enviar este id
   *  para casar com o path de storage usado no upload offline-first. */
  installationId?: string;
  xCoord: number;
  yCoord: number;
  gpsLat?: number | null;
  gpsLng?: number | null;
  gpsAccuracyMeters?: number | null;
  numbering?: string | null;
  poleType?: string | null;
  notes?: string | null;
  /** ISO timestamp da marcacao (capturado pelo APK; preserva timeline real). */
  installedAt: string;
  media?: RecordPoleInstallationMediaInput[];
  /** OBRIGATORIO. UUID v4 gerado client-side; idempotencia forte. */
  clientEventId: string;
}

export interface RecordPoleInstallationResult {
  installationId: string;
  /** false quando a action retornou linha existente por idempotencia. */
  isNew: boolean;
}

export interface RemovePoleInstallationInput {
  installationId: string;
  reason?: string | null;
}

export interface GetUploadUrlForPoleInstallationMediaInput {
  workId: string;
  installationId: string;
  kind: PoleInstallationMediaKind;
  fileName: string;
  sizeBytes: number;
  mimeType?: string;
}

export interface PoleInstallationMediaUploadInfo {
  uploadUrl: string;
  uploadToken: string;
  storagePath: string;
}

export interface InstallationsCount {
  installed: number;
  removed: number;
}

/** Limites por tipo de midia da instalacao (bytes). */
export const POLE_INSTALLATION_MEDIA_LIMITS: Record<
  PoleInstallationMediaKind,
  { maxBytes: number; mimePrefix: string; label: string }
> = {
  image: { maxBytes: 10 * 1024 * 1024, mimePrefix: 'image/', label: 'imagem' },
  video: { maxBytes: 50 * 1024 * 1024, mimePrefix: 'video/', label: 'video' },
};

export const POLE_INSTALLATION_NUMBERING_MAX = 64;
export const POLE_INSTALLATION_POLE_TYPE_MAX = 64;
export const POLE_INSTALLATION_NOTES_MAX = 1000;
export const POLE_INSTALLATION_UPLOAD_URL_TTL_SECONDS = 60 * 15;
export const POLE_INSTALLATION_DOWNLOAD_URL_TTL_SECONDS = 60 * 30;

// =============================================================================
// Galeria unificada (Fase 7)
// =============================================================================

export type GalleryItemSource = 'chat' | 'daily_log' | 'milestone' | 'installation' | 'checklist_item' | 'alert';
export type GalleryItemKind = 'image' | 'video' | 'audio';

export interface GalleryItem {
  id: string;
  source: GalleryItemSource;
  /** id da mensagem/diario/marco/instalacao de origem. */
  sourceId: string;
  kind: GalleryItemKind;
  storagePath: string;
  signedUrl: string | null;
  createdAt: string;
  /** Rotulo curto do contexto (ex.: "Chat - 12/05", "Instalacao P-12"). */
  contextLabel: string;
  /** Rota para "ver no contexto". */
  linkPath: string;
}

/** Limite total de itens carregados na galeria nesta fase. */
export const GALLERY_ITEMS_LIMIT = 200;

// =============================================================================
// Checklists (Fase 8)
// =============================================================================

export type ChecklistStatus =
  | 'pending'
  | 'in_progress'
  | 'awaiting_validation'
  | 'validated'
  | 'returned';

export interface ChecklistTemplateItem {
  id: string;
  templateId: string;
  orderIndex: number;
  label: string;
  description: string | null;
  requiresPhoto: boolean;
  createdAt: string;
}

export interface ChecklistTemplate {
  id: string;
  engineerId: string;
  name: string;
  description: string | null;
  isDefault: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  items: ChecklistTemplateItem[];
}

export interface WorkChecklistItemMedia {
  id: string;
  itemId: string;
  workChecklistId: string;
  workId: string;
  kind: 'image' | 'video';
  storagePath: string;
  mimeType: string | null;
  sizeBytes: number | null;
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
  createdAt: string;
}

export interface WorkChecklistItem {
  id: string;
  workChecklistId: string;
  orderIndex: number;
  label: string;
  description: string | null;
  requiresPhoto: boolean;
  isCompleted: boolean;
  completedAt: string | null;
  completedBy: string | null;
  notes: string | null;
  clientEventId: string | null;
  createdAt: string;
  updatedAt: string;
  media: WorkChecklistItemMedia[];
}

export interface TemplateSnapshotItem {
  order_index: number;
  label: string;
  description: string | null;
  requires_photo: boolean;
}

export interface TemplateSnapshot {
  name: string;
  description: string | null;
  items: TemplateSnapshotItem[];
}

export interface WorkChecklist {
  id: string;
  workId: string;
  templateId: string | null;
  templateSnapshot: TemplateSnapshot;
  name: string;
  description: string | null;
  assignedBy: string;
  assignedTo: string | null;
  dueDate: string | null;
  status: ChecklistStatus;
  validatedBy: string | null;
  validatedAt: string | null;
  returnedAt: string | null;
  returnReason: string | null;
  createdAt: string;
  updatedAt: string;
  items: WorkChecklistItem[];
}

export interface CreateChecklistTemplateItemInput {
  label: string;
  description?: string | null;
  requiresPhoto?: boolean;
  orderIndex: number;
}

export interface CreateChecklistTemplateInput {
  name: string;
  description?: string | null;
  isDefault?: boolean;
  items: CreateChecklistTemplateItemInput[];
}

export interface UpdateChecklistTemplateInput {
  id: string;
  name?: string;
  description?: string | null;
  isDefault?: boolean;
  items: CreateChecklistTemplateItemInput[];
}

export interface AssignChecklistToWorkInput {
  workId: string;
  templateId?: string | null;
  name: string;
  description?: string | null;
  items?: CreateChecklistTemplateItemInput[];
  dueDate?: string | null;
  assignedTo?: string | null;
}

export interface MarkChecklistItemInput {
  itemId: string;
  isCompleted: boolean;
  notes?: string | null;
  mediaPaths?: { kind: 'image' | 'video'; storagePath: string; mimeType?: string; sizeBytes?: number; width?: number; height?: number }[];
  clientEventId?: string;
}

export interface GetUploadUrlForChecklistItemMediaInput {
  workId: string;
  checklistId: string;
  itemId: string;
  kind: 'image' | 'video';
  fileName: string;
  sizeBytes: number;
  mimeType?: string;
}

export interface ChecklistItemMediaUploadInfo {
  uploadUrl: string;
  uploadToken: string;
  storagePath: string;
}

export const CHECKLIST_MEDIA_LIMITS: Record<'image' | 'video', { maxBytes: number; mimePrefix: string; label: string }> = {
  image: { maxBytes: 10 * 1024 * 1024, mimePrefix: 'image/', label: 'imagem' },
  video: { maxBytes: 50 * 1024 * 1024, mimePrefix: 'video/', label: 'video' },
};

export const CHECKLIST_TEMPLATE_NAME_MIN = 3;
export const CHECKLIST_TEMPLATE_NAME_MAX = 200;
export const CHECKLIST_ITEM_LABEL_MAX = 500;
export const CHECKLIST_RETURN_REASON_MIN = 5;
export const CHECKLIST_RETURN_REASON_MAX = 1000;

// =============================================================================
// Alertas (Fase 8)
// =============================================================================

export type AlertSeverity = 'low' | 'medium' | 'high' | 'critical';
export type AlertCategory = 'accident' | 'material_shortage' | 'safety' | 'equipment' | 'weather' | 'other';
export type AlertStatus = 'open' | 'in_progress' | 'resolved_in_field' | 'closed';
export type AlertUpdateType = 'opened' | 'in_progress' | 'resolved_in_field' | 'reopened' | 'closed' | 'comment';

export interface WorkAlertMedia {
  id: string;
  alertId: string;
  updateId: string | null;
  workId: string;
  kind: 'image' | 'video';
  storagePath: string;
  mimeType: string | null;
  sizeBytes: number | null;
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
  createdAt: string;
}

export interface WorkAlertUpdate {
  id: string;
  alertId: string;
  workId: string;
  actorId: string;
  actorRole: WorkMemberRole;
  updateType: AlertUpdateType;
  notes: string | null;
  clientEventId: string | null;
  createdAt: string;
  media: WorkAlertMedia[];
}

export interface WorkAlert {
  id: string;
  workId: string;
  createdBy: string;
  severity: AlertSeverity;
  category: AlertCategory;
  title: string;
  description: string;
  gpsLat: number | null;
  gpsLng: number | null;
  gpsAccuracyMeters: number | null;
  status: AlertStatus;
  fieldResolutionAt: string | null;
  fieldResolutionNotes: string | null;
  closedBy: string | null;
  closedAt: string | null;
  closureNotes: string | null;
  clientEventId: string;
  createdAt: string;
  updatedAt: string;
}

export interface WorkAlertWithHistory extends WorkAlert {
  updates: WorkAlertUpdate[];
  media: WorkAlertMedia[];
}

export interface OpenAlertInput {
  workId: string;
  severity: AlertSeverity;
  category: AlertCategory;
  title: string;
  description: string;
  gpsLat?: number | null;
  gpsLng?: number | null;
  gpsAccuracyMeters?: number | null;
  mediaPaths?: { kind: 'image' | 'video'; storagePath: string; mimeType?: string; sizeBytes?: number; width?: number; height?: number }[];
  clientEventId: string;
}

export interface GetUploadUrlForAlertMediaInput {
  workId: string;
  alertId: string;
  updateId?: string | null;
  kind: 'image' | 'video';
  fileName: string;
  sizeBytes: number;
  mimeType?: string;
}

export interface AlertMediaUploadInfo {
  uploadUrl: string;
  uploadToken: string;
  storagePath: string;
}

export const ALERT_MEDIA_LIMITS: Record<'image' | 'video', { maxBytes: number; mimePrefix: string; label: string }> = {
  image: { maxBytes: 10 * 1024 * 1024, mimePrefix: 'image/', label: 'imagem' },
  video: { maxBytes: 50 * 1024 * 1024, mimePrefix: 'video/', label: 'video' },
};

export const ALERT_TITLE_MIN = 5;
export const ALERT_TITLE_MAX = 200;
export const ALERT_DESCRIPTION_MIN = 10;
export const ALERT_DESCRIPTION_MAX = 2000;
export const ALERT_CLOSURE_NOTES_MIN = 5;
export const ALERT_CLOSURE_NOTES_MAX = 1000;

export const ALERT_SEVERITY_LABELS: Record<AlertSeverity, string> = {
  low: 'Baixa',
  medium: 'Média',
  high: 'Alta',
  critical: 'Crítica',
};

export const ALERT_CATEGORY_LABELS: Record<AlertCategory, string> = {
  accident: 'Acidente',
  material_shortage: 'Falta de material',
  safety: 'Segurança',
  equipment: 'Equipamento',
  weather: 'Clima',
  other: 'Outro',
};

export const ALERT_STATUS_LABELS: Record<AlertStatus, string> = {
  open: 'Aberto',
  in_progress: 'Em tratativa',
  resolved_in_field: 'Resolvido em campo',
  closed: 'Encerrado',
};

// =============================================================================
// Equipe da Obra (Fase 8)
// =============================================================================

export interface WorkTeamMember {
  id: string;
  workId: string;
  crewMemberId: string;
  roleInWork: string | null;
  allocatedAt: string;
  deallocatedAt: string | null;
  createdAt: string;
  updatedAt: string;
  crewMemberName: string;
  crewMemberRole: string | null;
  crewMemberIsActive: boolean;
}

export interface WorkTeamAttendanceRow {
  id: string;
  workId: string;
  crewMemberId: string;
  attendanceDate: string;
  dailyLogId: string | null;
  createdAt: string;
  crewMemberName: string;
}

export interface AllocateCrewToWorkInput {
  workId: string;
  crewMemberId: string;
  roleInWork?: string | null;
}

export interface PendingChecklistInfo {
  workId: string;
  count: number;
  hasReturned: boolean;
}

export interface ActiveAlertInfo {
  workId: string;
  criticalCount: number;
  totalActiveCount: number;
  oldestOpenedHoursAgo: number;
}

export interface WorkPendingApprovalsResultExtended extends WorkPendingApprovalsResult {
  pendingChecklists: PendingChecklistInfo[];
  activeAlerts: ActiveAlertInfo[];
}

export const PENDING_ALERT_RESOLVED_RED_THRESHOLD_HOURS = 12;
