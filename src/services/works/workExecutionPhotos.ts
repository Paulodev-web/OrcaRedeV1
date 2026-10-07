import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

export type ExecutionPhotoKind = 'pole' | 'equipment';
export interface ExecutionPhoto {
  id: string;
  createdAt: string;
  previewUrl: string;
}

const SOURCES = {
  pole: { table: 'work_pole_installation_media', parent: 'work_pole_installations' },
  equipment: { table: 'work_pole_equipment_media', parent: 'work_pole_equipment' },
} as const;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

export function parseExecutionPhotoId(id: string) {
  const match = /^campo-(pole|equipment)-(.+)$/.exec(id);
  if (!match || !UUID.test(match[2])) return null;
  return { kind: match[1] as ExecutionPhotoKind, mediaId: match[2] };
}

function photoQuery(db: SupabaseClient, workId: string, kind: ExecutionPhotoKind) {
  const source = SOURCES[kind];
  let query = db.from(source.table)
    .select(`id,storage_path,created_at,${source.parent}!inner(work_id)`)
    .eq('work_id', workId).eq(`${source.parent}.work_id`, workId).eq('kind', 'image');
  if (kind === 'pole') query = query.eq(`${source.parent}.status`, 'installed');
  return query;
}

function safePath(workId: string, value: unknown): value is string {
  return typeof value === 'string' && value.startsWith(`${workId}/`)
    && !value.includes('..') && !value.includes('\\');
}

/** Usa cliente autorizado. Nunca aceita URL ou caminho enviados pelo navegador. */
export async function executionPhotoPath(db: SupabaseClient, workId: string, id: string) {
  const source = parseExecutionPhotoId(id);
  if (!source) return null;
  const { data, error } = await photoQuery(db, workId, source.kind)
    .eq('id', source.mediaId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data || !safePath(workId, data.storage_path)) return null;
  return data.storage_path;
}

export async function listExecutionPhotos(
  db: SupabaseClient, workId: string, kind: ExecutionPhotoKind, page: number,
): Promise<{ photos: ExecutionPhoto[]; hasMore: boolean }> {
  if (!(kind === 'pole' || kind === 'equipment') || !Number.isSafeInteger(page) || page < 0 || page > 10000) {
    throw new Error('Filtro de fotos inválido.');
  }
  const size = 24;
  const { data, error } = await photoQuery(db, workId, kind)
    .order('created_at', { ascending: false }).order('id', { ascending: false })
    .range(page * size, page * size + size);
  if (error) throw new Error(error.message);
  const photos: ExecutionPhoto[] = [];
  for (const row of (data ?? []).slice(0, size)) {
    if (!safePath(workId, row.storage_path)) continue;
    const signed = await db.storage.from('andamento-obra').createSignedUrl(row.storage_path, 600);
    if (signed.error) throw new Error('Não foi possível abrir as fotos. Tente novamente.');
    photos.push({ id: `campo-${kind}-${row.id}`, createdAt: String(row.created_at), previewUrl: signed.data.signedUrl });
  }
  return { photos, hasMore: (data?.length ?? 0) > size };
}

/** Única porta anônima: publicação explícita + portal habilitado + obra ativa. */
export async function publicExecutionPhotoPath(db: SupabaseClient, publicId: string, imageId: string) {
  if (!parseExecutionPhotoId(imageId) || publicId.length > 200) return null;
  const { data: portal, error } = await db.from('work_trackings')
    .select('work_id,work_images').eq('public_id', publicId).eq('public_enabled', true).maybeSingle();
  if (error) throw new Error(error.message);
  if (!portal?.work_id || !Array.isArray(portal.work_images)
    || !portal.work_images.some((image) => image && typeof image === 'object' && image.id === imageId)) return null;
  const work = await db.from('works').select('id').eq('id', portal.work_id).neq('status', 'cancelled').maybeSingle();
  if (work.error) throw new Error(work.error.message);
  if (!work.data) return null;
  return executionPhotoPath(db, portal.work_id, imageId);
}
