import type { SupabaseClient } from '@supabase/supabase-js';
import type { Orcamento } from '@/types';
import {
  listBudgetSegmentAssignments,
  listWorkSegments,
  type BudgetSegmentAssignments,
  type WorkSegment,
} from '@/services/segments/workSegments';
// Instrumentação temporária — ver src/lib/perf/serverTiming.ts (PERF=1 npm run dev).
import { timeServer } from '@/lib/perf/serverTiming';

/**
 * Carga de abertura da esteira do orçamento (`/orcamentos/[budgetId]/*`).
 *
 * Roda no servidor para o deep link já chegar com nome, cliente e cidade na
 * tela — o resto (postes, materiais, grupos) continua vindo pelo `AppContext`
 * no cliente, como sempre foi.
 */

export interface BudgetWorkspaceData {
  budget: Orcamento;
  segments: WorkSegment[];
  segmentAssignments: BudgetSegmentAssignments;
}

const BUDGET_COLUMNS =
  'id, project_name, company_id, client_name, city, status, updated_at, plan_image_url, folder_id, is_template, template_source_id, render_version';

/** Mesma normalização de `AppContext.fetchBudgets`. */
function normalizeStatus(status: string | null): Orcamento['status'] {
  if (status === 'Finalizado' || status === 'finalized' || status === 'Concluído') {
    return 'Finalizado';
  }
  return 'Em Andamento';
}

/**
 * Orçamento do usuário no formato que o OrçaRede consome, ou `null` quando não
 * existe ou o RLS não o entrega.
 */
export async function getBudgetForWorkspace(
  supabase: SupabaseClient,
  _userId: string,
  budgetId: string
): Promise<Orcamento | null> {
  const { data, error } = await supabase
    .from('budgets')
    .select(BUDGET_COLUMNS)
    .eq('id', budgetId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }
  if (!data) {
    return null;
  }

  return {
    id: data.id,
    nome: data.project_name || '',
    concessionariaId: data.company_id || '',
    company_id: data.company_id ?? undefined,
    dataModificacao: data.updated_at ? new Date(data.updated_at).toISOString().split('T')[0] : '',
    status: normalizeStatus(data.status),
    // Lista legada em memória: os postes reais vêm de `budgetDetails`.
    postes: [],
    folderId: data.folder_id || null,
    isTemplate: data.is_template || false,
    templateSourceId: data.template_source_id || null,
    render_version: data.render_version ?? undefined,
    ...(data.client_name && { clientName: data.client_name }),
    ...(data.city && { city: data.city }),
    ...(data.plan_image_url && { imagemPlanta: data.plan_image_url }),
  };
}

/** Orçamento + catálogo de segmentos + marcação corrente, em paralelo. */
export async function getBudgetWorkspaceData(
  supabase: SupabaseClient,
  userId: string,
  budgetId: string
): Promise<BudgetWorkspaceData | null> {
  // As TRÊS leituras saem juntas.
  //
  // Antes o orçamento era aguardado sozinho e só depois os segmentos partiam —
  // duas idas ao Supabase em série no caminho do primeiro byte, com o navegador
  // sem nada na tela durante as duas. Nenhuma das outras duas precisa do
  // resultado do orçamento: as duas se viram só com `budgetId` e `userId`, que
  // já estão em mãos. Em série isso custava um round-trip inteiro de rede por
  // abertura, e round-trip é justamente o que não dá para otimizar depois.
  //
  // Quando o orçamento não existe (ou o RLS não o entrega), os segmentos foram
  // buscados à toa — mas esse é o caminho raro, e ele já termina em tela de
  // erro. Pagar o desperdício no caso raro para economizar rede no caso normal
  // é a troca certa aqui.
  const [budget, segments, segmentAssignments] = await Promise.all([
    timeServer('  ├─ query do orçamento (1 linha)', () =>
      getBudgetForWorkspace(supabase, userId, budgetId)
    ),
    timeServer('  ├─ catálogo de segmentos', () => listWorkSegments(supabase, userId)),
    timeServer('  └─ marcações (280 postes + 1175 grupos)', () =>
      listBudgetSegmentAssignments(supabase, budgetId)
    ),
  ]);

  if (!budget) {
    return null;
  }

  return { budget, segments, segmentAssignments };
}
