import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

import type { ProposalActivityFact, ProposalMaterialRow } from '@/types/proposal';

import { round2, type SegmentShare } from './derive';

/**
 * SNAPSHOT DO ORÇAMENTO PARA A PROPOSTA.
 *
 * Consolida material, segmento e quantitativo numa passada só, para que as três
 * coisas nunca divirjam: a curva ABC, os valores por segmento e os `facts` que a
 * IA recebe saem todos do MESMO consolidado.
 *
 * Paridade deliberada com `consolidateMaterialsFromBudgetDetails`
 * (src/services/budgetMaterialAggregation.ts): mesmo critério de preço
 * (`price_at_addition` com fallback no preço do catálogo) e mesmo rótulo de
 * subgrupo ausente. A query é própria porque precisa também de `segment_id` em
 * `budget_posts` e `post_item_groups`, que aquela não seleciona.
 */

const SEM_SUBGRUPO = 'Não classificado';
export const SEM_SEGMENTO = 'Não segmentado';

/** Unidades contínuas: o quantitativo é estimativa, e o texto diz "aproximadamente". */
const APPROXIMATE_UNITS = new Set(['m', 'm2', 'm²', 'm3', 'm³', 'km', 'kg', 'l', 'ml', 'mm']);

interface MaterialJoin {
  id?: string | null;
  code?: string | null;
  name?: string | null;
  unit?: string | null;
  price?: number | string | null;
  material_subgroups?: { name?: string | null } | { name?: string | null }[] | null;
}

interface MaterialLinkRow {
  material_id: string;
  quantity: number | string | null;
  price_at_addition: number | string | null;
  materials: MaterialJoin | MaterialJoin[] | null;
}

interface ItemGroupRow {
  id: string;
  name: string | null;
  segment_id: string | null;
  post_item_group_materials: MaterialLinkRow[] | null;
}

interface BudgetPostRow {
  id: string;
  name: string | null;
  custom_name: string | null;
  counter: number | null;
  segment_id: string | null;
  post_types: { name?: string | null } | { name?: string | null }[] | null;
  post_item_groups: ItemGroupRow[] | null;
  post_materials: MaterialLinkRow[] | null;
}

export interface BudgetSegmentSnapshot extends SegmentShare {
  /** Postes cujo segmento resolvido é este. */
  postCount: number;
  /** Quantitativos fechados do segmento, prontos para o prompt da IA. */
  facts: ProposalActivityFact[];
}

export interface BudgetSnapshot {
  budgetId: string;
  projectName: string;
  clientName: string | null;
  city: string | null;
  utilityCompanyId: string | null;
  utilityCompanyName: string | null;
  status: string | null;
  postCount: number;
  materials: ProposalMaterialRow[];
  materialTotal: number;
  segments: BudgetSegmentSnapshot[];
  /** `true` quando ao menos um poste ou grupo tem segmento marcado. */
  hasSegmentation: boolean;
  /** Subgrupos presentes, com quantos itens distintos cada um tem. */
  materialSubgroups: Array<{ subgroup: string; itemCount: number }>;
}

function num(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** PostgREST devolve o embed como objeto ou array conforme a cardinalidade. */
function firstOf<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function subgroupName(material: MaterialJoin | null): string {
  const subgroup = firstOf(material?.material_subgroups ?? null);
  return subgroup?.name?.trim() || SEM_SUBGRUPO;
}

interface Accumulator {
  material: ProposalMaterialRow;
  bySegment: Map<string, number>;
}

/**
 * Carrega o orçamento e devolve tudo que a proposta precisa dele.
 * `null` quando o orçamento não existe.
 */
export async function loadBudgetSnapshot(
  supabase: SupabaseClient,
  budgetId: string,
  _userId: string,
): Promise<BudgetSnapshot | null> {
  const { data: budgetRow, error: budgetError } = await supabase
    .from('budgets')
    .select('id, project_name, client_name, city, company_id, status, user_id')
    .eq('id', budgetId)
    .maybeSingle();

  if (budgetError || !budgetRow) return null;

  const budget = budgetRow as unknown as {
    id: string;
    project_name: string;
    client_name: string | null;
    city: string | null;
    company_id: string | null;
    status: string | null;
  };

  const [postsResult, utilityResult, segmentsResult] = await Promise.all([
    supabase
      .from('budget_posts')
      .select(
        `id, name, custom_name, counter, segment_id,
         post_types ( name ),
         post_item_groups (
           id, name, segment_id,
           post_item_group_materials (
             material_id, quantity, price_at_addition,
             materials ( id, code, name, unit, price, material_subgroups ( name ) )
           )
         ),
         post_materials (
           material_id, quantity, price_at_addition,
           materials ( id, code, name, unit, price, material_subgroups ( name ) )
         )`,
      )
      .eq('budget_id', budgetId)
      .order('counter', { ascending: true })
      .limit(2000),
    budget.company_id
      ? supabase.from('utility_companies').select('id, name').eq('id', budget.company_id).maybeSingle()
      : Promise.resolve({ data: null } as { data: null }),
    supabase
      .from('work_segments')
      .select('id, name, order_index')
      .order('order_index', { ascending: true }),
  ]);

  const posts = (postsResult.data ?? []) as unknown as BudgetPostRow[];

  const segmentNames = new Map<string, string>();
  const segmentOrder = new Map<string, number>();
  for (const row of (segmentsResult.data ?? []) as Array<{
    id: string;
    name: string;
    order_index: number | null;
  }>) {
    segmentNames.set(row.id, row.name);
    segmentOrder.set(row.id, num(row.order_index));
  }

  const accumulators = new Map<string, Accumulator>();
  const postCountBySegment = new Map<string, number>();
  let hasSegmentation = false;

  const addMaterial = (link: MaterialLinkRow, segmentKey: string) => {
    const material = firstOf(link.materials);
    if (!material) return;

    const quantity = num(link.quantity);
    const unitPrice = num(link.price_at_addition) || num(material.price);
    const existing = accumulators.get(link.material_id);

    if (existing) {
      existing.material.quantity = round2(existing.material.quantity + quantity);
      existing.material.subtotal = round2(existing.material.quantity * existing.material.unitPrice);
    } else {
      accumulators.set(link.material_id, {
        material: {
          code: material.code?.trim() || null,
          name: material.name?.trim() || 'Material sem nome',
          subgroup: subgroupName(material),
          unit: material.unit?.trim() || 'un',
          quantity: round2(quantity),
          unitPrice,
          subtotal: round2(quantity * unitPrice),
        },
        bySegment: new Map(),
      });
    }

    const acc = accumulators.get(link.material_id)!;
    const price = acc.material.unitPrice;
    acc.bySegment.set(segmentKey, round2((acc.bySegment.get(segmentKey) ?? 0) + quantity * price));
  };

  for (const post of posts) {
    const postSegment = post.segment_id ?? null;
    if (postSegment) hasSegmentation = true;

    const postKey = postSegment ?? '';
    postCountBySegment.set(postKey, (postCountBySegment.get(postKey) ?? 0) + 1);

    for (const group of post.post_item_groups ?? []) {
      if (group.segment_id) hasSegmentation = true;
      const groupSegment = group.segment_id ?? postSegment ?? '';
      for (const link of group.post_item_group_materials ?? []) {
        addMaterial(link, groupSegment);
      }
    }

    for (const link of post.post_materials ?? []) {
      addMaterial(link, postKey);
    }
  }

  const materials = [...accumulators.values()]
    .map((acc) => acc.material)
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));

  const materialTotal = round2(materials.reduce((total, row) => total + row.subtotal, 0));

  // --- Segmentos -----------------------------------------------------------
  const segmentKeys = new Set<string>();
  for (const acc of accumulators.values()) {
    for (const key of acc.bySegment.keys()) segmentKeys.add(key);
  }
  for (const key of postCountBySegment.keys()) segmentKeys.add(key);
  if (segmentKeys.size === 0) segmentKeys.add('');

  const segments: BudgetSegmentSnapshot[] = [...segmentKeys]
    .map((key) => {
      const materialWeight = round2(
        [...accumulators.values()].reduce((total, acc) => total + (acc.bySegment.get(key) ?? 0), 0),
      );

      return {
        segmentId: key || null,
        label: key ? (segmentNames.get(key) ?? SEM_SEGMENTO) : SEM_SEGMENTO,
        materialWeight,
        postCount: postCountBySegment.get(key) ?? 0,
        facts: buildSegmentFacts(accumulators, key, postCountBySegment.get(key) ?? 0),
      };
    })
    .sort((a, b) => {
      const orderA = a.segmentId ? (segmentOrder.get(a.segmentId) ?? 999) : 999;
      const orderB = b.segmentId ? (segmentOrder.get(b.segmentId) ?? 999) : 999;
      return orderA - orderB || b.materialWeight - a.materialWeight;
    });

  const subgroupCounts = new Map<string, number>();
  for (const row of materials) {
    const key = row.subgroup ?? SEM_SUBGRUPO;
    subgroupCounts.set(key, (subgroupCounts.get(key) ?? 0) + 1);
  }

  const utilityRow = utilityResult.data as { name?: string | null } | null;

  return {
    budgetId: budget.id,
    projectName: budget.project_name,
    clientName: budget.client_name,
    city: budget.city,
    utilityCompanyId: budget.company_id,
    utilityCompanyName: utilityRow?.name ?? null,
    status: budget.status,
    postCount: posts.length,
    materials,
    materialTotal,
    segments,
    hasSegmentation,
    materialSubgroups: [...subgroupCounts.entries()]
      .map(([subgroup, itemCount]) => ({ subgroup, itemCount }))
      .sort((a, b) => a.subgroup.localeCompare(b.subgroup, 'pt-BR')),
  };
}

/** Quantidade de itens citáveis por grupo de atividade no prompt da IA. */
const FACTS_PER_SEGMENT = 8;

function buildSegmentFacts(
  accumulators: Map<string, Accumulator>,
  segmentKey: string,
  postCount: number,
): ProposalActivityFact[] {
  const facts: ProposalActivityFact[] = [];

  if (postCount > 0) {
    facts.push({
      label: 'postes previstos no segmento',
      quantity: postCount,
      unit: 'un',
      isApproximate: false,
    });
  }

  const relevant = [...accumulators.values()]
    .filter((acc) => (acc.bySegment.get(segmentKey) ?? 0) > 0)
    .sort((a, b) => (b.bySegment.get(segmentKey) ?? 0) - (a.bySegment.get(segmentKey) ?? 0))
    .slice(0, FACTS_PER_SEGMENT);

  for (const acc of relevant) {
    const amount = acc.bySegment.get(segmentKey) ?? 0;
    const quantity = acc.material.unitPrice > 0 ? amount / acc.material.unitPrice : 0;
    if (quantity <= 0) continue;

    const unit = acc.material.unit;
    facts.push({
      label: acc.material.name,
      // Quantidade fracionária só faz sentido em unidade contínua.
      quantity: isApproximateUnit(unit) ? round2(quantity) : Math.round(quantity),
      unit,
      isApproximate: isApproximateUnit(unit),
    });
  }

  return facts;
}

function isApproximateUnit(unit: string): boolean {
  return APPROXIMATE_UNITS.has(unit.trim().toLowerCase());
}
