import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { WorkChecklist, WorkChecklistItem, WorkChecklistItemMedia } from '@/types/works';
import { getDailyLogSignedUrls } from './getDailyLogSignedUrls';

export async function getWorkChecklistDetails(
  supabase: SupabaseClient,
  checklistId: string,
): Promise<{ checklist: WorkChecklist; signedUrls: Record<string, string> } | null> {
  const { data: clData, error } = await supabase
    .from('work_checklists')
    .select(`
      id, work_id, template_id, template_snapshot, name, description,
      assigned_by, assigned_to, due_date, status, validated_by, validated_at,
      returned_at, return_reason, created_at, updated_at,
      work_checklist_items (
        id, work_checklist_id, order_index, label, description, requires_photo,
        is_completed, completed_at, completed_by, notes, client_event_id, created_at, updated_at,
        work_checklist_item_media (
          id, item_id, work_checklist_id, work_id, kind, storage_path,
          mime_type, size_bytes, width, height, duration_seconds, created_at
        )
      )
    `)
    .eq('id', checklistId)
    .maybeSingle();

  if (error || !clData) return null;

  const r = clData as unknown as Record<string, unknown>;
  const rawItems = r.work_checklist_items as Array<Record<string, unknown>> ?? [];

  const allPaths: string[] = [];
  for (const item of rawItems) {
    const media = (item.work_checklist_item_media as Array<Record<string, unknown>>) ?? [];
    for (const m of media) {
      allPaths.push(m.storage_path as string);
    }
  }

  const signedUrls = allPaths.length > 0 ? await getDailyLogSignedUrls(allPaths) : {};

  const items: WorkChecklistItem[] = rawItems
    .sort((a, b) => (a.order_index as number) - (b.order_index as number))
    .map((item) => {
      const media = ((item.work_checklist_item_media as Array<Record<string, unknown>>) ?? []).map(
        (m): WorkChecklistItemMedia => ({
          id: m.id as string,
          itemId: m.item_id as string,
          workChecklistId: m.work_checklist_id as string,
          workId: m.work_id as string,
          kind: m.kind as 'image' | 'video',
          storagePath: m.storage_path as string,
          mimeType: (m.mime_type as string) || null,
          sizeBytes: (m.size_bytes as number) ?? null,
          width: (m.width as number) ?? null,
          height: (m.height as number) ?? null,
          durationSeconds: (m.duration_seconds as number) ?? null,
          createdAt: m.created_at as string,
        }),
      );

      return {
        id: item.id as string,
        workChecklistId: item.work_checklist_id as string,
        orderIndex: item.order_index as number,
        label: item.label as string,
        description: (item.description as string) || null,
        requiresPhoto: item.requires_photo as boolean,
        isCompleted: item.is_completed as boolean,
        completedAt: (item.completed_at as string) || null,
        completedBy: (item.completed_by as string) || null,
        notes: (item.notes as string) || null,
        clientEventId: (item.client_event_id as string) || null,
        createdAt: item.created_at as string,
        updatedAt: item.updated_at as string,
        media,
      } satisfies WorkChecklistItem;
    });

  const checklist: WorkChecklist = {
    id: r.id as string,
    workId: r.work_id as string,
    templateId: (r.template_id as string) || null,
    templateSnapshot: r.template_snapshot as WorkChecklist['templateSnapshot'],
    name: r.name as string,
    description: (r.description as string) || null,
    assignedBy: r.assigned_by as string,
    assignedTo: (r.assigned_to as string) || null,
    dueDate: (r.due_date as string) || null,
    status: r.status as WorkChecklist['status'],
    validatedBy: (r.validated_by as string) || null,
    validatedAt: (r.validated_at as string) || null,
    returnedAt: (r.returned_at as string) || null,
    returnReason: (r.return_reason as string) || null,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
    items,
  };

  return { checklist, signedUrls };
}
