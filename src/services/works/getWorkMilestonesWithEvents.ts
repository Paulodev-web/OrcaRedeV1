import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  MilestoneCode,
  MilestoneEventType,
  MilestoneStatus,
  WorkMemberRole,
  WorkMilestoneEvent,
  WorkMilestoneEventMedia,
  WorkMilestoneWithApproval,
} from '@/types/works';

interface RawMilestone {
  id: string;
  work_id: string;
  code: string;
  name: string;
  order_index: number;
  status: MilestoneStatus;
  reported_by: string | null;
  reported_at: string | null;
  approved_by: string | null;
  approved_at: string | null;
  rejected_at: string | null;
  rejection_reason: string | null;
  notes: string | null;
  evidence_media_ids: unknown;
}

interface RawEventMedia {
  id: string;
  event_id: string;
  milestone_id: string;
  work_id: string;
  kind: 'image' | 'video';
  storage_path: string;
  mime_type: string | null;
  size_bytes: number | null;
  width: number | null;
  height: number | null;
  created_at: string;
}

interface RawEvent {
  id: string;
  milestone_id: string;
  work_id: string;
  event_type: MilestoneEventType;
  actor_id: string;
  actor_role: WorkMemberRole;
  notes: string | null;
  client_event_id: string | null;
  created_at: string;
  work_milestone_event_media: RawEventMedia[] | null;
}

/**
 * Marcos da obra com:
 *  - colunas de aprovacao
 *  - ultimo evento (latestEvent)
 *  - contagem de eventos (eventsCount)
 *
 * Ordem: order_index ASC.
 */
export async function getWorkMilestonesWithEvents(
  supabase: SupabaseClient,
  workId: string,
): Promise<WorkMilestoneWithApproval[]> {
  const { data: msData, error: msErr } = await supabase
    .from('work_milestones')
    .select(
      `id, work_id, code, name, order_index, status,
       reported_by, reported_at, approved_by, approved_at, rejected_at,
       rejection_reason, notes, evidence_media_ids`,
    )
    .eq('work_id', workId)
    .order('order_index', { ascending: true });

  if (msErr || !msData) return [];
  const milestones = msData as unknown as RawMilestone[];

  if (milestones.length === 0) return [];

  // Buscar todos os eventos das marcos.
  const milestoneIds = milestones.map((m) => m.id);
  const { data: evData } = await supabase
    .from('work_milestone_events')
    .select(
      `id, milestone_id, work_id, event_type, actor_id, actor_role, notes,
       client_event_id, created_at,
       work_milestone_event_media (
         id, event_id, milestone_id, work_id, kind, storage_path, mime_type,
         size_bytes, width, height, created_at
       )`,
    )
    .in('milestone_id', milestoneIds)
    .order('created_at', { ascending: false });

  const events = ((evData ?? []) as unknown as RawEvent[]).map(mapRawEvent);

  // Agrupa por milestone_id.
  const eventsByMs = new Map<string, WorkMilestoneEvent[]>();
  for (const ev of events) {
    const arr = eventsByMs.get(ev.milestoneId) ?? [];
    arr.push(ev);
    eventsByMs.set(ev.milestoneId, arr);
  }

  return milestones.map((m) => {
    const all = eventsByMs.get(m.id) ?? [];
    return {
      id: m.id,
      workId: m.work_id,
      code: m.code as MilestoneCode,
      name: m.name,
      orderIndex: m.order_index,
      status: m.status,
      reportedBy: m.reported_by,
      reportedAt: m.reported_at,
      approvedBy: m.approved_by,
      approvedAt: m.approved_at,
      rejectedAt: m.rejected_at,
      rejectionReason: m.rejection_reason,
      notes: m.notes,
      evidenceMediaIds: Array.isArray(m.evidence_media_ids)
        ? (m.evidence_media_ids as string[])
        : [],
      latestEvent: all[0] ?? null,
      eventsCount: all.length,
    };
  });
}

export function mapRawEvent(row: RawEvent): WorkMilestoneEvent {
  return {
    id: row.id,
    milestoneId: row.milestone_id,
    workId: row.work_id,
    eventType: row.event_type,
    actorId: row.actor_id,
    actorRole: row.actor_role,
    notes: row.notes,
    clientEventId: row.client_event_id,
    createdAt: row.created_at,
    media: (row.work_milestone_event_media ?? []).map(mapEventMedia),
  };
}

export function mapEventMedia(row: RawEventMedia): WorkMilestoneEventMedia {
  return {
    id: row.id,
    eventId: row.event_id,
    milestoneId: row.milestone_id,
    workId: row.work_id,
    kind: row.kind,
    storagePath: row.storage_path,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    width: row.width,
    height: row.height,
    createdAt: row.created_at,
  };
}
