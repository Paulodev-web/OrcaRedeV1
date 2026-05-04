import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ImportableBudget } from '@/types/works';

interface BudgetRow {
  id: string;
  project_name: string;
  client_name: string | null;
  city: string | null;
  status: string | null;
  plan_image_url: string | null;
  updated_at: string;
}

interface PostsCountRow {
  budget_id: string;
  count: number;
}

/**
 * Lista orçamentos finalizados do engineer logado, prontos para serem importados
 * como obras de Andamento. Retorno tipado, ordenado por finalização desc.
 *
 * - `Finalizado` (pt-BR) é o valor canônico definido pelo RPC `finalize_budget`.
 *   AppContext aceita também `finalized` / `Concluído`; aqui consideramos os três
 *   para tolerar dados legados.
 * - `finalizedAt` usa `updated_at` como proxy enquanto não houver coluna dedicada.
 * - `persistedConnectionsCount` vem do último `work_trackings` (mesmo algoritmo
 *   do import) -- pode ser 0; UI mostra aviso quando 0.
 * - `existingActiveWorksCount` ignora obras canceladas/concluídas.
 */
export async function getImportableBudgets(
  supabase: SupabaseClient,
  engineerId: string,
): Promise<ImportableBudget[]> {
  const { data: budgets, error } = await supabase
    .from('budgets')
    .select('id, project_name, client_name, city, status, plan_image_url, updated_at')
    .eq('user_id', engineerId)
    .in('status', ['Finalizado', 'finalized', 'Concluído'])
    .order('updated_at', { ascending: false });

  if (error || !budgets || budgets.length === 0) return [];

  const rows = budgets as unknown as BudgetRow[];
  const budgetIds = rows.map((b) => b.id);

  const [postsResult, trackingsResult, worksResult] = await Promise.all([
    countPostsPerBudget(supabase, budgetIds),
    fetchPrimaryTrackingsForBudgets(supabase, budgetIds),
    countActiveWorksPerBudget(supabase, budgetIds, engineerId),
  ]);

  const trackingIds = trackingsResult.map((t) => t.id);
  const connectionsByTracking = await countConnectionsPerTracking(supabase, trackingIds);

  const trackingByBudget = new Map<string, string>();
  for (const t of trackingsResult) trackingByBudget.set(t.budget_id, t.id);

  return rows.map((b) => {
    const trackingId = trackingByBudget.get(b.id) ?? null;
    const persistedConnectionsCount = trackingId
      ? connectionsByTracking.get(trackingId) ?? 0
      : 0;

    return {
      id: b.id,
      projectName: b.project_name,
      clientName: b.client_name,
      city: b.city,
      finalizedAt: b.updated_at,
      postsCount: postsResult.get(b.id) ?? 0,
      persistedConnectionsCount,
      hasPdf: Boolean(b.plan_image_url && b.plan_image_url.trim().length > 0),
      existingActiveWorksCount: worksResult.get(b.id) ?? 0,
    } satisfies ImportableBudget;
  });
}

async function countPostsPerBudget(
  supabase: SupabaseClient,
  budgetIds: string[],
): Promise<Map<string, number>> {
  if (budgetIds.length === 0) return new Map();
  const { data } = await supabase
    .from('budget_posts')
    .select('budget_id')
    .in('budget_id', budgetIds);
  const map = new Map<string, number>();
  for (const row of (data ?? []) as PostsCountRow[]) {
    map.set(row.budget_id, (map.get(row.budget_id) ?? 0) + 1);
  }
  return map;
}

async function fetchPrimaryTrackingsForBudgets(
  supabase: SupabaseClient,
  budgetIds: string[],
): Promise<Array<{ id: string; budget_id: string }>> {
  if (budgetIds.length === 0) return [];
  const { data } = await supabase
    .from('work_trackings')
    .select('id, budget_id, updated_at')
    .in('budget_id', budgetIds)
    .order('updated_at', { ascending: false });
  if (!data) return [];
  // Manter apenas o tracking mais recente por budget_id.
  const seen = new Set<string>();
  const result: Array<{ id: string; budget_id: string }> = [];
  for (const row of data as Array<{ id: string; budget_id: string; updated_at: string }>) {
    if (!row.budget_id || seen.has(row.budget_id)) continue;
    seen.add(row.budget_id);
    result.push({ id: row.id, budget_id: row.budget_id });
  }
  return result;
}

async function countConnectionsPerTracking(
  supabase: SupabaseClient,
  trackingIds: string[],
): Promise<Map<string, number>> {
  if (trackingIds.length === 0) return new Map();
  const { data } = await supabase
    .from('post_connections')
    .select('tracking_id')
    .in('tracking_id', trackingIds);
  const map = new Map<string, number>();
  for (const row of (data ?? []) as Array<{ tracking_id: string }>) {
    map.set(row.tracking_id, (map.get(row.tracking_id) ?? 0) + 1);
  }
  return map;
}

async function countActiveWorksPerBudget(
  supabase: SupabaseClient,
  budgetIds: string[],
  engineerId: string,
): Promise<Map<string, number>> {
  if (budgetIds.length === 0) return new Map();
  const { data } = await supabase
    .from('works')
    .select('budget_id, status')
    .eq('engineer_id', engineerId)
    .in('budget_id', budgetIds)
    .in('status', ['planned', 'in_progress', 'paused']);
  const map = new Map<string, number>();
  for (const row of (data ?? []) as Array<{ budget_id: string }>) {
    if (!row.budget_id) continue;
    map.set(row.budget_id, (map.get(row.budget_id) ?? 0) + 1);
  }
  return map;
}
