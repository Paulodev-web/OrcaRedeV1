import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { WorkAlert } from '@/types/works';

const ALERTS_PAGE_SIZE = 20;

interface GetWorkAlertsResult {
  items: WorkAlert[];
  hasMore: boolean;
}

export async function getWorkAlerts(
  supabase: SupabaseClient,
  workId: string,
  filters?: { status?: string; severity?: string },
): Promise<GetWorkAlertsResult> {
  const fetchLimit = ALERTS_PAGE_SIZE + 1;
  let query = supabase
    .from('work_alerts')
    .select('*')
    .eq('work_id', workId)
    .order('created_at', { ascending: false })
    .limit(fetchLimit);

  if (filters?.status) {
    query = query.eq('status', filters.status);
  }
  if (filters?.severity) {
    query = query.eq('severity', filters.severity);
  }

  const { data, error } = await query;
  if (error || !data) return { items: [], hasMore: false };

  const rows = data as Array<Record<string, unknown>>;
  const hasMore = rows.length > ALERTS_PAGE_SIZE;
  const sliced = hasMore ? rows.slice(0, ALERTS_PAGE_SIZE) : rows;

  const items = sliced.map((r): WorkAlert => ({
    id: r.id as string,
    workId: r.work_id as string,
    createdBy: r.created_by as string,
    severity: r.severity as WorkAlert['severity'],
    category: r.category as WorkAlert['category'],
    title: r.title as string,
    description: r.description as string,
    gpsLat: (r.gps_lat as number) ?? null,
    gpsLng: (r.gps_lng as number) ?? null,
    gpsAccuracyMeters: (r.gps_accuracy_meters as number) ?? null,
    status: r.status as WorkAlert['status'],
    fieldResolutionAt: (r.field_resolution_at as string) || null,
    fieldResolutionNotes: (r.field_resolution_notes as string) || null,
    closedBy: (r.closed_by as string) || null,
    closedAt: (r.closed_at as string) || null,
    closureNotes: (r.closure_notes as string) || null,
    clientEventId: r.client_event_id as string,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  }));

  return { items, hasMore };
}
