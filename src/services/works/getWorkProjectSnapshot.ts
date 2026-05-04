import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  MaterialPlanned,
  MetersPlanned,
  WorkProjectConnection,
  WorkProjectPost,
  WorkProjectSnapshot,
  WorkProjectSnapshotBundle,
} from '@/types/works';

interface SnapshotRow {
  work_id: string;
  source_budget_id: string | null;
  pdf_storage_path: string | null;
  original_pdf_path: string | null;
  render_version: number | null;
  pdf_num_pages: number | null;
  materials_planned: unknown;
  meters_planned: unknown;
  imported_at: string;
  imported_by: string;
}

interface PostRow {
  id: string;
  work_id: string;
  source_post_id: string | null;
  numbering: string | null;
  post_type: string | null;
  x_coord: number | string;
  y_coord: number | string;
  metadata: unknown;
}

interface ConnectionRow {
  id: string;
  work_id: string;
  source_connection_id: string | null;
  from_post_id: string;
  to_post_id: string;
  color: string | null;
  metadata: unknown;
}

const EMPTY_METERS: MetersPlanned = { BT: 0, MT: 0, rede: 0 };

/**
 * Retorna o snapshot do projeto importado (PDF + postes + conexões) de uma obra.
 * RLS garante que apenas membros da obra leiam.
 *
 * Retorna `null` se não houver snapshot — obras criadas "do zero" caem aqui.
 */
export async function getWorkProjectSnapshot(
  supabase: SupabaseClient,
  workId: string,
): Promise<WorkProjectSnapshotBundle | null> {
  const { data: snapshotRow, error } = await supabase
    .from('work_project_snapshot')
    .select(
      `work_id, source_budget_id, pdf_storage_path, original_pdf_path,
       render_version, pdf_num_pages, materials_planned, meters_planned,
       imported_at, imported_by`,
    )
    .eq('work_id', workId)
    .maybeSingle();

  if (error || !snapshotRow) return null;

  const row = snapshotRow as unknown as SnapshotRow;

  const [postsResult, connectionsResult] = await Promise.all([
    supabase
      .from('work_project_posts')
      .select('id, work_id, source_post_id, numbering, post_type, x_coord, y_coord, metadata')
      .eq('work_id', workId)
      .order('created_at', { ascending: true }),
    supabase
      .from('work_project_connections')
      .select('id, work_id, source_connection_id, from_post_id, to_post_id, color, metadata')
      .eq('work_id', workId),
  ]);

  const snapshot: WorkProjectSnapshot = {
    workId: row.work_id,
    sourceBudgetId: row.source_budget_id,
    pdfStoragePath: row.pdf_storage_path,
    originalPdfPath: row.original_pdf_path,
    renderVersion: row.render_version,
    pdfNumPages: row.pdf_num_pages,
    materialsPlanned: parseMaterials(row.materials_planned),
    metersPlanned: parseMeters(row.meters_planned),
    importedAt: row.imported_at,
    importedBy: row.imported_by,
  };

  const posts: WorkProjectPost[] = ((postsResult.data ?? []) as PostRow[]).map((p) => ({
    id: p.id,
    workId: p.work_id,
    sourcePostId: p.source_post_id,
    numbering: p.numbering,
    postType: p.post_type,
    xCoord: typeof p.x_coord === 'string' ? Number(p.x_coord) : p.x_coord,
    yCoord: typeof p.y_coord === 'string' ? Number(p.y_coord) : p.y_coord,
    metadata: parseObject(p.metadata),
  }));

  const connections: WorkProjectConnection[] = ((connectionsResult.data ?? []) as ConnectionRow[]).map(
    (c) => ({
      id: c.id,
      workId: c.work_id,
      sourceConnectionId: c.source_connection_id,
      fromPostId: c.from_post_id,
      toPostId: c.to_post_id,
      color: c.color === 'blue' || c.color === 'green' ? c.color : null,
      metadata: parseObject(c.metadata),
    }),
  );

  return { snapshot, posts, connections };
}

function parseMaterials(value: unknown): MaterialPlanned[] {
  if (!Array.isArray(value)) return [];
  const result: MaterialPlanned[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const obj = item as Record<string, unknown>;
    result.push({
      material_id: String(obj.material_id ?? ''),
      code: String(obj.code ?? ''),
      name: String(obj.name ?? ''),
      unit: String(obj.unit ?? ''),
      quantity: Number(obj.quantity ?? 0),
    });
  }
  return result;
}

function parseMeters(value: unknown): MetersPlanned {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { ...EMPTY_METERS };
  const obj = value as Record<string, unknown>;
  return {
    BT: Number(obj.BT ?? 0) || 0,
    MT: Number(obj.MT ?? 0) || 0,
    rede: Number(obj.rede ?? 0) || 0,
  };
}

function parseObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}
