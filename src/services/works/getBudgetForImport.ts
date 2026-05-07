import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { BudgetDetails, BudgetPostDetail } from '@/types';
import type { MaterialPlanned, MetersPlanned } from '@/types/works';
import { consolidateMaterialsFromBudgetDetails } from '@/services/budgetMaterialAggregation';

/**
 * Snapshot tipado de uma conexão "do orçamento", após remapeamento dos IDs
 * de `tracked_posts` -> `budget_posts` via `original_post_id`.
 */
export interface BudgetConnectionForImport {
  /** id em `post_connections` (tracking legado) — útil como `source_connection_id`. */
  sourceConnectionId: string | null;
  /** id em `budget_posts` (já remapeado a partir de `tracked_posts.original_post_id`). */
  fromBudgetPostId: string;
  /** id em `budget_posts`. */
  toBudgetPostId: string;
  color: 'blue' | 'green' | null;
}

export interface BudgetForImport {
  budgetId: string;
  projectName: string;
  clientName: string | null;
  city: string | null;
  utilityCompanyId: string | null;
  utilityCompanyName: string | null;
  status: string | null;
  planImageUrl: string | null;
  renderVersion: number | null;
  posts: BudgetPostDetail[];
  /** Lista pronta para `materials_planned` (formato JSONB). */
  materialsPlanned: MaterialPlanned[];
  /** Sempre presente; zeros quando não há tracking legado (decisão da Fase 3). */
  metersPlanned: MetersPlanned;
  /** Conexões já com IDs de `budget_posts` (vazio se não houver tracking legado). */
  connections: BudgetConnectionForImport[];
}

interface BudgetRow {
  id: string;
  project_name: string;
  client_name: string | null;
  city: string | null;
  company_id: string | null;
  status: string | null;
  plan_image_url: string | null;
  render_version: number | null;
  user_id: string;
}

/**
 * Centraliza tudo que precisa ser copiado de um orçamento finalizado para uma
 * nova obra de Andamento. Não escreve nada — apenas leitura.
 *
 * Retorna `null` se o orçamento não existe ou não pertence ao engineer.
 *
 * Conexões e metragem vêm do `work_trackings` mais recente (legado).
 * Vazio quando não houver — UI já avisa explicitamente.
 */
export async function getBudgetForImport(
  supabase: SupabaseClient,
  budgetId: string,
  engineerId: string,
): Promise<BudgetForImport | null> {
  const { data: budgetRow, error: budgetError } = await supabase
    .from('budgets')
    .select(
      'id, project_name, client_name, city, company_id, status, plan_image_url, render_version, user_id',
    )
    .eq('id', budgetId)
    .maybeSingle();

  if (budgetError || !budgetRow) return null;
  const budget = budgetRow as unknown as BudgetRow;
  if (budget.user_id !== engineerId) return null;

  const [postsResult, utilityResult] = await Promise.all([
    supabase
      .from('budget_posts')
      .select(
        `id, name, custom_name, counter, x_coord, y_coord,
         post_types ( id, name, code, description, shape, height_m, price ),
         post_item_groups (
           id, name, template_id,
           post_item_group_materials (
             material_id, quantity, price_at_addition,
             materials ( id, code, name, description, unit, price )
           )
         ),
         post_materials (
           id, post_id, material_id, quantity, price_at_addition,
           materials ( id, code, name, description, unit, price )
         )`,
      )
      .eq('budget_id', budgetId)
      .order('counter', { ascending: true })
      .limit(2000),
    budget.company_id
      ? supabase
          .from('utility_companies')
          .select('id, name')
          .eq('id', budget.company_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null } as { data: null; error: null }),
  ]);

  const posts = (postsResult.data ?? []) as unknown as BudgetPostDetail[];

  const utilityCompanyName =
    utilityResult.data && typeof utilityResult.data === 'object'
      ? ((utilityResult.data as { name?: string | null }).name ?? null)
      : null;

  const budgetDetails: BudgetDetails = {
    id: budget.id,
    name: budget.project_name,
    company_id: budget.company_id ?? undefined,
    client_name: budget.client_name ?? undefined,
    city: budget.city ?? undefined,
    status: (budget.status === 'Finalizado' ? 'Finalizado' : 'Em Andamento'),
    plan_image_url: budget.plan_image_url ?? undefined,
    posts,
    render_version: budget.render_version ?? undefined,
  };

  const consolidated = consolidateMaterialsFromBudgetDetails(budgetDetails);
  const materialsPlanned: MaterialPlanned[] = consolidated.map((row) => ({
    material_id: row.materialId,
    code: row.codigo,
    name: row.nome,
    unit: row.unidade,
    quantity: row.quantidade,
  }));

  const tracking = await fetchPrimaryTracking(supabase, budgetId);
  const metersPlanned: MetersPlanned = {
    BT: numberOrZero(tracking?.planned_bt_meters),
    MT: numberOrZero(tracking?.planned_mt_meters),
    rede: numberOrZero(tracking?.planned_network_meters),
  };

  const connections = tracking
    ? await fetchAndRemapConnections(supabase, tracking.id, posts)
    : [];

  return {
    budgetId: budget.id,
    projectName: budget.project_name,
    clientName: budget.client_name,
    city: budget.city,
    utilityCompanyId: budget.company_id,
    utilityCompanyName,
    status: budget.status,
    planImageUrl: budget.plan_image_url,
    renderVersion: budget.render_version,
    posts,
    materialsPlanned,
    metersPlanned,
    connections,
  };
}

interface TrackingRow {
  id: string;
  planned_bt_meters: number | null;
  planned_mt_meters: number | null;
  planned_network_meters: number | null;
}

async function fetchPrimaryTracking(
  supabase: SupabaseClient,
  budgetId: string,
): Promise<TrackingRow | null> {
  const { data } = await supabase
    .from('work_trackings')
    .select('id, planned_bt_meters, planned_mt_meters, planned_network_meters, updated_at')
    .eq('budget_id', budgetId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  return data as unknown as TrackingRow;
}

interface ConnectionRow {
  id: string;
  from_post_id: string;
  to_post_id: string;
  connection_type: string | null;
  client_id: string | null;
}

interface TrackedPostRow {
  id: string;
  original_post_id: string | null;
}

async function fetchAndRemapConnections(
  supabase: SupabaseClient,
  trackingId: string,
  budgetPosts: BudgetPostDetail[],
): Promise<BudgetConnectionForImport[]> {
  const [{ data: connectionsData }, { data: trackedPostsData }] = await Promise.all([
    supabase
      .from('post_connections')
      .select('id, from_post_id, to_post_id, connection_type, client_id')
      .eq('tracking_id', trackingId),
    supabase
      .from('tracked_posts')
      .select('id, original_post_id')
      .eq('tracking_id', trackingId),
  ]);

  const connections = (connectionsData ?? []) as ConnectionRow[];
  const trackedPosts = (trackedPostsData ?? []) as TrackedPostRow[];
  if (connections.length === 0) return [];

  // Map: tracked_post.id -> budget_post.id (original_post_id).
  // Defensivo: se original_post_id for nulo, tenta usar o próprio id quando ele
  // bater com algum budget_post.id (cenário improvável mas observado em legado).
  const budgetPostIds = new Set(budgetPosts.map((p) => p.id));
  const trackedToBudget = new Map<string, string>();
  for (const tp of trackedPosts) {
    if (tp.original_post_id && budgetPostIds.has(tp.original_post_id)) {
      trackedToBudget.set(tp.id, tp.original_post_id);
    } else if (budgetPostIds.has(tp.id)) {
      trackedToBudget.set(tp.id, tp.id);
    }
  }

  const result: BudgetConnectionForImport[] = [];
  for (const c of connections) {
    const from = trackedToBudget.get(c.from_post_id);
    const to = trackedToBudget.get(c.to_post_id);
    if (!from || !to) continue;
    result.push({
      sourceConnectionId: c.id,
      fromBudgetPostId: from,
      toBudgetPostId: to,
      color: parseColor(c.connection_type, c.client_id),
    });
  }
  return result;
}

function parseColor(
  explicit: string | null | undefined,
  clientId: string | null | undefined,
): 'blue' | 'green' | null {
  if (explicit === 'blue' || explicit === 'green') return explicit;
  if (typeof clientId === 'string') {
    if (clientId.startsWith('green:')) return 'green';
    if (clientId.startsWith('blue:')) return 'blue';
  }
  return null;
}

function numberOrZero(value: number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}
