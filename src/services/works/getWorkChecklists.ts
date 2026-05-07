import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { WorkChecklist, WorkChecklistItem } from '@/types/works';

export async function getWorkChecklists(
  supabase: SupabaseClient,
  workId: string,
): Promise<WorkChecklist[]> {
  const { data, error } = await supabase
    .from('work_checklists')
    .select(`
      id, work_id, template_id, template_snapshot, name, description,
      assigned_by, assigned_to, due_date, status, validated_by, validated_at,
      returned_at, return_reason, created_at, updated_at,
      work_checklist_items (
        id, work_checklist_id, order_index, label, description, requires_photo,
        is_completed, completed_at, completed_by, notes, client_event_id, created_at, updated_at
      )
    `)
    .eq('work_id', workId)
    .order('created_at', { ascending: false });

  if (error || !data) return [];

  return (data as unknown[]).map((raw: unknown) => {
    const r = raw as Record<string, unknown>;
    const items = (r.work_checklist_items as Array<Record<string, unknown>> ?? [])
      .sort((a, b) => (a.order_index as number) - (b.order_index as number))
      .map((i): WorkChecklistItem => ({
        id: i.id as string,
        workChecklistId: i.work_checklist_id as string,
        orderIndex: i.order_index as number,
        label: i.label as string,
        description: (i.description as string) || null,
        requiresPhoto: i.requires_photo as boolean,
        isCompleted: i.is_completed as boolean,
        completedAt: (i.completed_at as string) || null,
        completedBy: (i.completed_by as string) || null,
        notes: (i.notes as string) || null,
        clientEventId: (i.client_event_id as string) || null,
        createdAt: i.created_at as string,
        updatedAt: i.updated_at as string,
        media: [],
      }));

    return {
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
    } satisfies WorkChecklist;
  });
}
