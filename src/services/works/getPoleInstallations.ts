import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  PoleInstallationMediaKind,
  PoleInstallationStatus,
  WorkPoleInstallation,
  WorkPoleInstallationMedia,
} from '@/types/works';

interface RawMedia {
  id: string;
  installation_id: string;
  work_id: string;
  kind: PoleInstallationMediaKind;
  storage_path: string;
  mime_type: string | null;
  size_bytes: number | null;
  width: number | null;
  height: number | null;
  duration_seconds: number | null;
  is_primary: boolean;
  created_at: string;
}

interface RawInstallation {
  id: string;
  work_id: string;
  created_by: string;
  x_coord: number | string;
  y_coord: number | string;
  gps_lat: number | string | null;
  gps_lng: number | string | null;
  gps_accuracy_meters: number | string | null;
  numbering: string | null;
  pole_type: string | null;
  notes: string | null;
  installed_at: string;
  status: PoleInstallationStatus;
  removed_at: string | null;
  removed_by: string | null;
  client_event_id: string;
  created_at: string;
  updated_at: string;
  work_pole_installation_media: RawMedia[] | null;
}

interface GetPoleInstallationsOptions {
  /** Default false: somente instalacoes ativas (status='installed'). */
  includeRemoved?: boolean;
}

/**
 * Carrega instalacoes de uma obra com suas midias. RLS de
 * work_pole_installations / work_pole_installation_media restringe a membros.
 *
 * Ordenacao: installed_at DESC (mais recentes primeiro). O caller pode
 * inverter o array se precisar pintar pins do mais antigo ao mais novo.
 */
export async function getPoleInstallations(
  supabase: SupabaseClient,
  workId: string,
  options: GetPoleInstallationsOptions = {},
): Promise<WorkPoleInstallation[]> {
  let query = supabase
    .from('work_pole_installations')
    .select(
      `id, work_id, created_by, x_coord, y_coord, gps_lat, gps_lng,
       gps_accuracy_meters, numbering, pole_type, notes, installed_at,
       status, removed_at, removed_by, client_event_id, created_at, updated_at,
       work_pole_installation_media (
         id, installation_id, work_id, kind, storage_path, mime_type,
         size_bytes, width, height, duration_seconds, is_primary, created_at
       )`,
    )
    .eq('work_id', workId)
    .order('installed_at', { ascending: false });

  if (!options.includeRemoved) {
    query = query.eq('status', 'installed');
  }

  const { data, error } = await query;
  if (error || !data) return [];

  const rows = data as unknown as RawInstallation[];
  return rows.map(mapRawInstallation);
}

export function mapRawInstallation(row: RawInstallation): WorkPoleInstallation {
  return {
    id: row.id,
    workId: row.work_id,
    createdBy: row.created_by,
    xCoord: Number(row.x_coord),
    yCoord: Number(row.y_coord),
    gpsLat: row.gps_lat === null ? null : Number(row.gps_lat),
    gpsLng: row.gps_lng === null ? null : Number(row.gps_lng),
    gpsAccuracyMeters:
      row.gps_accuracy_meters === null ? null : Number(row.gps_accuracy_meters),
    numbering: row.numbering,
    poleType: row.pole_type,
    notes: row.notes,
    installedAt: row.installed_at,
    status: row.status,
    removedAt: row.removed_at,
    removedBy: row.removed_by,
    clientEventId: row.client_event_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    media: (row.work_pole_installation_media ?? []).map(mapRawMedia),
  };
}

export function mapRawMedia(row: RawMedia): WorkPoleInstallationMedia {
  return {
    id: row.id,
    installationId: row.installation_id,
    workId: row.work_id,
    kind: row.kind,
    storagePath: row.storage_path,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    width: row.width,
    height: row.height,
    durationSeconds: row.duration_seconds,
    isPrimary: row.is_primary,
    createdAt: row.created_at,
  };
}
