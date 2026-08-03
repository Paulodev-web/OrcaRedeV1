import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Segmentos de obra (Escopo §7.3).
 *
 * O segmento é marcado **no orçamento**, não na proposta, e resolvido em
 * cascata:
 *
 *     grupo de item (override)  →  poste  →  "não segmentado"
 *
 * O catálogo (`work_segments`) é por usuário e será gerenciado em
 * `/configuracoes/segmentos`. Aqui só se lê o catálogo e se escreve a marcação
 * em `budget_posts.segment_id` / `post_item_groups.segment_id`.
 *
 * As leituras acontecem no servidor (layout da rota do orçamento) e as
 * escritas no cliente, seguindo o que a ARCHITECTURE.md §5.2 já documenta para
 * a manipulação interna do orçamento.
 */

export interface WorkSegment {
  id: string;
  name: string;
  order_index: number;
  is_default: boolean;
}

/** `segment_id` corrente por id de poste e por id de grupo de itens. */
export interface BudgetSegmentAssignments {
  posts: Record<string, string | null>;
  groups: Record<string, string | null>;
}

export const EMPTY_SEGMENT_ASSIGNMENTS: BudgetSegmentAssignments = {
  posts: {},
  groups: {},
};

/** Catálogo do usuário, na ordem em que aparece nas tabelas da proposta. */
export async function listWorkSegments(
  supabase: SupabaseClient,
  userId: string
): Promise<WorkSegment[]> {
  const { data, error } = await supabase
    .from('work_segments')
    .select('id, name, order_index, is_default')
    .eq('user_id', userId)
    .order('order_index', { ascending: true })
    .order('name', { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as WorkSegment[];
}

interface GroupSegmentRow {
  id: string;
  segment_id: string | null;
}

/**
 * Marcações do orçamento inteiro em duas consultas.
 *
 * Os grupos são filtrados pelo orçamento com embed `!inner` em `budget_posts`
 * (mesmo padrão de `findBudgetIdsContainingMaterial`), em vez de um `.in()` com
 * centenas de ids de poste na URL.
 */
export async function listBudgetSegmentAssignments(
  supabase: SupabaseClient,
  budgetId: string
): Promise<BudgetSegmentAssignments> {
  const [postsResult, groupsResult] = await Promise.all([
    supabase.from('budget_posts').select('id, segment_id').eq('budget_id', budgetId).limit(2000),
    supabase
      .from('post_item_groups')
      .select('id, segment_id, budget_posts!inner ( budget_id )')
      .eq('budget_posts.budget_id', budgetId)
      .limit(5000),
  ]);

  if (postsResult.error) {
    throw new Error(postsResult.error.message);
  }
  if (groupsResult.error) {
    throw new Error(groupsResult.error.message);
  }

  const posts: Record<string, string | null> = {};
  for (const row of (postsResult.data ?? []) as GroupSegmentRow[]) {
    posts[row.id] = row.segment_id ?? null;
  }

  const groups: Record<string, string | null> = {};
  for (const row of (groupsResult.data ?? []) as GroupSegmentRow[]) {
    groups[row.id] = row.segment_id ?? null;
  }

  return { posts, groups };
}

/**
 * `UPDATE` barrado por RLS volta como sucesso com zero linhas, sem erro. O
 * `.select()` transforma esse silêncio em falha explícita — a marcação é
 * otimista na tela e não pode "salvar" o que o banco recusou.
 */
async function updateSegmentColumn(
  supabase: SupabaseClient,
  table: 'budget_posts' | 'post_item_groups',
  id: string,
  segmentId: string | null,
  notFoundMessage: string
): Promise<void> {
  const { data, error } = await supabase
    .from(table)
    .update({ segment_id: segmentId })
    .eq('id', id)
    .select('id');

  if (error) {
    throw new Error(error.message);
  }
  if (!data || data.length === 0) {
    throw new Error(notFoundMessage);
  }
}

/** Marca (ou desmarca, com `null`) o segmento do poste. */
export async function setPostSegment(
  supabase: SupabaseClient,
  postId: string,
  segmentId: string | null
): Promise<void> {
  await updateSegmentColumn(
    supabase,
    'budget_posts',
    postId,
    segmentId,
    'Poste não encontrado ou fora do seu acesso.'
  );
}

/** Override do segmento no grupo de itens. `null` volta a herdar do poste. */
export async function setPostItemGroupSegment(
  supabase: SupabaseClient,
  postItemGroupId: string,
  segmentId: string | null
): Promise<void> {
  await updateSegmentColumn(
    supabase,
    'post_item_groups',
    postItemGroupId,
    segmentId,
    'Grupo de itens não encontrado ou fora do seu acesso.'
  );
}

/**
 * A cascata da §7.3 em uma função — o override do grupo vence o poste, e sem
 * nenhum dos dois o item fica "não segmentado".
 */
export function resolveSegmentId(
  assignments: BudgetSegmentAssignments,
  postId: string,
  postItemGroupId?: string
): string | null {
  if (postItemGroupId) {
    const override = assignments.groups[postItemGroupId];
    if (override) return override;
  }
  return assignments.posts[postId] ?? null;
}
