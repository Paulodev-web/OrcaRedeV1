import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { WorkAlert, WorkAlertUpdate, WorkAlertMedia, WorkAlertWithHistory } from '@/types/works';
import { getDailyLogSignedUrls } from './getDailyLogSignedUrls';

export async function getAlertWithHistory(
  supabase: SupabaseClient,
  alertId: string,
): Promise<{ alert: WorkAlertWithHistory; signedUrls: Record<string, string> } | null> {
  const [alertRes, updatesRes, mediaRes] = await Promise.all([
    supabase
      .from('work_alerts')
      .select('*')
      .eq('id', alertId)
      .maybeSingle(),
    supabase
      .from('work_alert_updates')
      .select('*')
      .eq('alert_id', alertId)
      .order('created_at', { ascending: true }),
    supabase
      .from('work_alert_media')
      .select('*')
      .eq('alert_id', alertId)
      .order('created_at', { ascending: true }),
  ]);

  if (alertRes.error || !alertRes.data) return null;

  const r = alertRes.data as Record<string, unknown>;
  const alertData: WorkAlert = {
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
  };

  const allMedia = ((mediaRes.data ?? []) as Array<Record<string, unknown>>).map((m): WorkAlertMedia => ({
    id: m.id as string,
    alertId: m.alert_id as string,
    updateId: (m.update_id as string) || null,
    workId: m.work_id as string,
    kind: m.kind as 'image' | 'video',
    storagePath: m.storage_path as string,
    mimeType: (m.mime_type as string) || null,
    sizeBytes: (m.size_bytes as number) ?? null,
    width: (m.width as number) ?? null,
    height: (m.height as number) ?? null,
    durationSeconds: (m.duration_seconds as number) ?? null,
    createdAt: m.created_at as string,
  }));

  const updates: WorkAlertUpdate[] = ((updatesRes.data ?? []) as Array<Record<string, unknown>>).map((u): WorkAlertUpdate => ({
    id: u.id as string,
    alertId: u.alert_id as string,
    workId: u.work_id as string,
    actorId: u.actor_id as string,
    actorRole: u.actor_role as WorkAlertUpdate['actorRole'],
    updateType: u.update_type as WorkAlertUpdate['updateType'],
    notes: (u.notes as string) || null,
    clientEventId: (u.client_event_id as string) || null,
    createdAt: u.created_at as string,
    media: allMedia.filter((m) => m.updateId === (u.id as string)),
  }));

  const paths = allMedia.map((m) => m.storagePath);
  const signedUrls = paths.length > 0 ? await getDailyLogSignedUrls(paths) : {};

  return {
    alert: {
      ...alertData,
      updates,
      media: allMedia.filter((m) => m.updateId === null),
    },
    signedUrls,
  };
}
