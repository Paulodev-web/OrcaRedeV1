import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

import { buildAbcFromMaterials, buildSegmentTotals, round2, DEFAULT_ABC_CUT_A, DEFAULT_ABC_CUT_B } from './derive';
import { DEFAULT_SECTIONS } from './defaults';
import { loadBudgetSnapshot } from './budgetSnapshot';
import { getPricingScenarios } from './pricingScenarios';
import { loadProposalTemplate } from './templates';

/**
 * CRIAÇÃO DA PROPOSTA A PARTIR DO ORÇAMENTO — etapa 4 da esteira.
 *
 * Tudo que é número nasce aqui, congelado: consolidado de material, curva ABC,
 * totais por segmento e globais de cada opção de preço. A prosa nasce vazia (ou
 * copiada do template) e é preenchida depois, à mão ou pela IA.
 *
 * O parcelamento NÃO é gerado na criação de propósito: número de parcelas e
 * intervalo são decisão comercial, e uma tabela default de uma parcela só
 * mentiria na peça enquanto ninguém a revisasse.
 */

export interface CreateProposalInput {
  budgetId: string;
  templateId?: string | null;
  technicalResponsibleId?: string | null;
  /** ids de `saved_pricing_budgets` a apresentar como opções de preço. */
  scenarioIds: string[];
  /** Número da proposta. Sem valor, segue a numeração do usuário. */
  proposalNumber?: number | null;
  unitsCount?: number | null;
  unitsLabel?: string | null;
  validityDate?: string | null;
  scopeLabel?: string | null;
}

export interface CreateProposalResult {
  proposalId: string;
  proposalNumber: number;
  version: number;
  warnings: string[];
}

/**
 * Numeração: uma nova proposta para um orçamento que já tem proposta é uma nova
 * VERSÃO do mesmo número (o "287.1" das peças atuais). Para um orçamento novo, é
 * o próximo número do usuário.
 */
async function resolveNumbering(
  supabase: SupabaseClient,
  userId: string,
  budgetId: string,
  requestedNumber: number | null | undefined,
): Promise<{ proposalNumber: number; version: number }> {
  const { data: siblings } = await supabase
    .from('proposals')
    .select('proposal_number, version')
    .eq('user_id', userId)
    .eq('budget_id', budgetId)
    .order('version', { ascending: false })
    .limit(1);

  const latest = (siblings ?? [])[0] as { proposal_number?: number; version?: number } | undefined;

  if (latest?.proposal_number && !requestedNumber) {
    return { proposalNumber: latest.proposal_number, version: (latest.version ?? 0) + 1 };
  }

  if (requestedNumber && requestedNumber > 0) {
    const { data: sameNumber } = await supabase
      .from('proposals')
      .select('version')
      .eq('user_id', userId)
      .eq('proposal_number', requestedNumber)
      .order('version', { ascending: false })
      .limit(1);

    const highest = (sameNumber ?? [])[0] as { version?: number } | undefined;
    return { proposalNumber: requestedNumber, version: (highest?.version ?? 0) + 1 };
  }

  const { data: highestNumber } = await supabase
    .from('proposals')
    .select('proposal_number')
    .eq('user_id', userId)
    .order('proposal_number', { ascending: false })
    .limit(1);

  const top = (highestNumber ?? [])[0] as { proposal_number?: number } | undefined;
  return { proposalNumber: (top?.proposal_number ?? 0) + 1, version: 1 };
}

export async function createProposalFromBudget(
  supabase: SupabaseClient,
  userId: string,
  input: CreateProposalInput,
): Promise<CreateProposalResult> {
  const warnings: string[] = [];

  const snapshot = await loadBudgetSnapshot(supabase, input.budgetId, userId);
  if (!snapshot) {
    throw new Error('Orçamento não encontrado para este usuário.');
  }
  if (snapshot.materials.length === 0) {
    warnings.push('O orçamento não tem material lançado: escopo, curva ABC e segmentos saem vazios.');
  }

  const [template, scenarios] = await Promise.all([
    loadProposalTemplate(supabase, userId, input.templateId),
    getPricingScenarios(supabase, userId, input.scenarioIds),
  ]);

  if (!template) {
    warnings.push(
      'Nenhum template de proposta encontrado: o texto institucional nasce vazio e precisa ser escrito.',
    );
  }
  if (scenarios.length === 0) {
    warnings.push(
      'Proposta criada sem opção de preço. Salve uma precificação para este orçamento e adicione a opção antes de publicar.',
    );
  }
  if (!snapshot.hasSegmentation && scenarios.length > 0) {
    warnings.push(
      'Nenhum poste do orçamento tem segmento marcado: os valores por segmento saem em uma linha só ("Não segmentado").',
    );
  }

  const { proposalNumber, version } = await resolveNumbering(
    supabase,
    userId,
    input.budgetId,
    input.proposalNumber,
  );

  const abc = buildAbcFromMaterials(snapshot.materials, {
    cutA: DEFAULT_ABC_CUT_A,
    cutB: DEFAULT_ABC_CUT_B,
  });

  const sections = template?.sections ?? DEFAULT_SECTIONS;

  const { data: inserted, error: insertError } = await supabase
    .from('proposals')
    .insert({
      user_id: userId,
      budget_id: input.budgetId,
      template_id: template?.id ?? null,
      technical_responsible_id: input.technicalResponsibleId || null,
      proposal_number: proposalNumber,
      version,
      scope_label: input.scopeLabel?.trim() || template?.scopeLabel || 'TIPO DE ESCOPO',
      project_title: snapshot.projectName ?? '',
      client_name: snapshot.clientName ?? '',
      city: snapshot.city ?? '',
      validity_date: input.validityDate || null,
      status: 'draft',
      units_count: input.unitsCount && input.unitsCount > 0 ? Math.floor(input.unitsCount) : null,
      units_label: input.unitsLabel?.trim() || null,
      institutional: template?.institutional ?? {},
      activities: [],
      materials_snapshot: snapshot.materials,
      billing_conditions: template?.billingConditions ?? null,
      final_considerations: template?.finalConsiderations ?? [],
      acceptance_closing_text: template?.acceptanceClosingText ?? null,
      schedule_columns: [],
      abc_grand_total: abc.grandTotal,
    })
    .select('id')
    .single();

  if (insertError || !inserted) {
    throw new Error(insertError?.message ?? 'Não foi possível criar a proposta.');
  }

  const proposalId = String((inserted as { id: string }).id);

  // A partir daqui qualquer falha deixaria uma proposta pela metade. Sem
  // transação no PostgREST, o caminho honesto é apagar a raiz — o CASCADE das
  // filhas limpa o resto — e devolver o erro em vez de abrir um editor quebrado.
  try {
    await insertChildren(supabase, proposalId, {
      sections,
      abcRows: abc.rows,
      template,
      scenarios,
      snapshot,
      unitsCount: input.unitsCount ?? null,
      unitsLabel: input.unitsLabel ?? null,
    });
  } catch (error) {
    await supabase.from('proposals').delete().eq('id', proposalId).eq('user_id', userId);
    throw error;
  }

  return { proposalId, proposalNumber, version, warnings };
}

type Snapshot = Awaited<ReturnType<typeof loadBudgetSnapshot>>;
type Template = Awaited<ReturnType<typeof loadProposalTemplate>>;
type Scenarios = Awaited<ReturnType<typeof getPricingScenarios>>;

async function insertChildren(
  supabase: SupabaseClient,
  proposalId: string,
  args: {
    sections: Array<{ key: string; title: string; order: number; enabled: boolean }>;
    abcRows: Array<{ curve: string; label: string; amount: number; percent: number; order: number }>;
    template: Template;
    scenarios: Scenarios;
    snapshot: NonNullable<Snapshot>;
    unitsCount: number | null;
    unitsLabel: string | null;
  },
): Promise<void> {
  const { sections, abcRows, template, scenarios, snapshot, unitsCount, unitsLabel } = args;

  const sectionRows = sections.map((section, index) => ({
    proposal_id: proposalId,
    section_key: section.key,
    title: section.title,
    order_index: section.order || index + 1,
    enabled: section.enabled,
  }));

  const { error: sectionsError } = await supabase.from('proposal_sections').insert(sectionRows);
  if (sectionsError) throw new Error(`Seções: ${sectionsError.message}`);

  if (abcRows.length > 0) {
    const { error } = await supabase.from('proposal_abc_rows').insert(
      abcRows.map((row) => ({
        proposal_id: proposalId,
        curve: row.curve,
        label: row.label,
        amount: row.amount,
        percent: row.percent,
        order_index: row.order,
      })),
    );
    if (error) throw new Error(`Curva ABC: ${error.message}`);
  }

  if (template && template.responsibilityItems.length > 0) {
    const { error } = await supabase.from('proposal_responsibility_items').insert(
      template.responsibilityItems.map((item, index) => ({
        proposal_id: proposalId,
        order_index: item.orderIndex || index + 1,
        description: item.description,
        responsible: item.responsible,
      })),
    );
    if (error) throw new Error(`Matriz de responsabilidade: ${error.message}`);
  }

  for (const [index, scenario] of scenarios.entries()) {
    const { data: optionRow, error: optionError } = await supabase
      .from('proposal_pricing_options')
      .insert({
        proposal_id: proposalId,
        saved_pricing_budget_id: scenario.id,
        label: scenario.scenarioName || `Opção ${index + 1}`,
        is_recommended: index === 0,
        order_index: index + 1,
        material_total: scenario.materialTotal,
        labor_total: scenario.laborTotal,
        grand_total: scenario.grandTotal,
        units_count: unitsCount && unitsCount > 0 ? Math.floor(unitsCount) : null,
        units_label: unitsLabel?.trim() || null,
        amount_per_unit:
          unitsCount && unitsCount > 0 ? round2(scenario.grandTotal / Math.floor(unitsCount)) : null,
      })
      .select('id')
      .single();

    if (optionError || !optionRow) {
      throw new Error(`Opção de preço "${scenario.scenarioName}": ${optionError?.message ?? 'falha ao inserir'}`);
    }

    const optionId = String((optionRow as { id: string }).id);

    const segments = buildSegmentTotals(
      snapshot.segments.map((segment) => ({
        segmentId: segment.segmentId,
        label: segment.label,
        materialWeight: segment.materialWeight,
      })),
      scenario.materialTotal,
      scenario.laborTotal,
    );

    if (segments.length > 0) {
      const { error } = await supabase.from('proposal_segment_totals').insert(
        segments.map((segment) => ({
          proposal_id: proposalId,
          pricing_option_id: optionId,
          segment_id: segment.segmentId,
          label: segment.label,
          material_amount: segment.materialAmount,
          labor_amount: segment.laborAmount,
          total_amount: segment.totalAmount,
          percent: segment.percent,
          order_index: segment.order,
        })),
      );
      if (error) throw new Error(`Valores por segmento: ${error.message}`);
    }
  }
}
