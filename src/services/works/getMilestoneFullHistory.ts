import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  MilestoneCode,
  MilestoneFullHistory,
  MilestoneStatus,
  WorkMilestoneEvent,
  WorkMilestoneWithApproval,
} from '@/types/works';
import { mapRawEvent } from './getWorkMilestonesWithEvents';

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

/**
 * Carrega marco + todos os eventos com midia, ordenados por created_at DESC.
 */
export async function getMilestoneFullHistory(
  supabase: SupabaseClient,
  milestoneId: string,
): Promise<MilestoneFullHistory | null> {
  const { data: msRow, error: msErr } = await supabase
    .from('work_milestones')
    .select(
      `id, work_id, code, name, order_index, status,
       reported_by, reported_at, approved_by, approved_at, rejected_at,
       rejection_reason, notes, evidence_media_ids`,
    )
    .eq('id', milestoneId)
    .maybeSingle();

  if (msErr || !msRow) return null;
  const m = msRow as unknown as RawMilestone;

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
    .eq('milestone_id', milestoneId)
    .order('created_at', { ascending: false });

  const events: WorkMilestoneEvent[] = ((evData ?? []) as unknown[])
    .map((row) => mapRawEvent(row as Parameters<typeof mapRawEvent>[0]));

  const milestone: WorkMilestoneWithApproval = {
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
    latestEvent: events[0] ?? null,
    eventsCount: events.length,
  };

  return { milestone, events };
}
