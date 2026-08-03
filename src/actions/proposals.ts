'use server';

import { revalidatePath } from 'next/cache';
import type { SupabaseClient } from '@supabase/supabase-js';

import { createSupabaseServerClient, requireAuthUserId } from '@/lib/supabaseServer';
import {
  mergeStepResults,
  planProposalDraftSteps,
  refineProposalBlock,
  runProposalDraftStep,
  type ProposalDraftStep,
  type ProposalGuardrailViolation,
  type ProposalRefineAction,
} from '@/services/ai/proposal';
import { PROPOSAL_DRAFT_PROMPT_VERSION } from '@/services/ai/prompts';
import { validateProposalData, type ProposalValidationIssue } from '@/services/pdf/proposal';
import {
  createProposalFromBudget,
  type CreateProposalInput,
} from '@/services/proposals/createFromBudget';
import { buildProposalDraftInput } from '@/services/proposals/draftInput';
import {
  buildAbcFromMaterials,
  buildSegmentTotals,
  generatePaymentTerms,
  normalizeAbcRows,
  normalizeSegmentTotals,
  repricePaymentTerms,
  round2,
  type PaymentPlanInput,
} from '@/services/proposals/derive';
import { loadBudgetSnapshot } from '@/services/proposals/budgetSnapshot';
import { getPricingScenarios } from '@/services/proposals/pricingScenarios';
import {
  loadProposalRecord,
  toProposalData,
  type ProposalRecord,
} from '@/services/proposals/repository';
import { parseAiBriefing, type ProposalAiBriefing } from '@/services/proposals/aiBriefing';
import type {
  ProposalRichBlock,
  ProposalScheduleColumn,
  ProposalSectionKey,
} from '@/types/proposal';

/**
 * SERVER ACTIONS DA PROPOSTA COMERCIAL.
 *
 * Divisão de trabalho: a aritmética mora em `@/services/proposals/derive`, a
 * leitura em `repository`, a redação em `@/services/ai/proposal` e o desenho em
 * `@/services/pdf/proposal`. Aqui só há autorização, escrita e invalidação de
 * cache.
 *
 * Toda action reconfere a posse da proposta antes de escrever. O RLS já faria
 * isso; a checagem explícita existe para devolver uma mensagem em português em
 * vez de um erro de policy cru.
 */

export type ActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string };

function fail(error: unknown, fallback: string): { success: false; error: string } {
  const message = error instanceof Error ? error.message : fallback;
  return { success: false, error: message };
}

function revalidateProposal(proposalId?: string) {
  revalidatePath('/propostas');
  if (proposalId) revalidatePath(`/propostas/${proposalId}`);
}

interface AuthorizedContext {
  supabase: SupabaseClient;
  userId: string;
}

async function authorize(): Promise<AuthorizedContext> {
  const supabase = await createSupabaseServerClient();
  const userId = await requireAuthUserId(supabase);
  return { supabase, userId };
}

/** Garante que a proposta é do usuário e devolve o registro completo. */
async function requireProposal(proposalId: string): Promise<AuthorizedContext & { record: ProposalRecord }> {
  const { supabase, userId } = await authorize();
  const record = await loadProposalRecord(supabase, userId, proposalId);
  if (!record) throw new Error('Proposta não encontrada.');
  return { supabase, userId, record };
}

/** Bloqueia edição de proposta publicada: a peça já está com o cliente. */
function assertEditable(record: ProposalRecord): void {
  if (record.proposal.status === 'published') {
    throw new Error(
      'Esta proposta está publicada. Despublique antes de editar — o link já está com o cliente.',
    );
  }
}

// ---------------------------------------------------------------------------
// Criação e exclusão
// ---------------------------------------------------------------------------

export async function createProposalAction(
  input: CreateProposalInput,
): Promise<ActionResult<{ proposalId: string; warnings: string[] }>> {
  try {
    const { supabase, userId } = await authorize();
    const result = await createProposalFromBudget(supabase, userId, input);
    revalidateProposal(result.proposalId);
    return { success: true, data: { proposalId: result.proposalId, warnings: result.warnings } };
  } catch (error) {
    return fail(error, 'Erro inesperado ao criar a proposta.');
  }
}

export async function deleteProposalAction(proposalId: string): Promise<ActionResult> {
  try {
    const { supabase, userId } = await authorize();
    const { error } = await supabase
      .from('proposals')
      .delete()
      .eq('id', proposalId)
      .eq('user_id', userId);

    if (error) return { success: false, error: error.message };
    revalidateProposal(proposalId);
    return { success: true, data: undefined };
  } catch (error) {
    return fail(error, 'Erro inesperado ao excluir a proposta.');
  }
}

// ---------------------------------------------------------------------------
// Identificação e capa
// ---------------------------------------------------------------------------

export interface ProposalHeaderPatch {
  scopeLabel?: string;
  projectTitle?: string;
  projectSubtitle?: string | null;
  clientName?: string;
  city?: string;
  issuedAt?: string;
  validityDate?: string | null;
  technicalResponsibleId?: string | null;
  unitsCount?: number | null;
  unitsLabel?: string | null;
}

export async function updateProposalHeaderAction(
  proposalId: string,
  patch: ProposalHeaderPatch,
): Promise<ActionResult> {
  try {
    const { supabase, userId, record } = await requireProposal(proposalId);
    assertEditable(record);

    const update: Record<string, unknown> = {};
    if (patch.scopeLabel !== undefined) update.scope_label = patch.scopeLabel.trim() || 'TIPO DE ESCOPO';
    if (patch.projectTitle !== undefined) update.project_title = patch.projectTitle;
    if (patch.projectSubtitle !== undefined) update.project_subtitle = patch.projectSubtitle || null;
    if (patch.clientName !== undefined) update.client_name = patch.clientName;
    if (patch.city !== undefined) update.city = patch.city;
    if (patch.issuedAt !== undefined) update.issued_at = patch.issuedAt;
    if (patch.validityDate !== undefined) update.validity_date = patch.validityDate || null;
    if (patch.technicalResponsibleId !== undefined) {
      update.technical_responsible_id = patch.technicalResponsibleId || null;
    }
    if (patch.unitsCount !== undefined) {
      update.units_count = patch.unitsCount && patch.unitsCount > 0 ? Math.floor(patch.unitsCount) : null;
    }
    if (patch.unitsLabel !== undefined) update.units_label = patch.unitsLabel?.trim() || null;

    if (Object.keys(update).length === 0) return { success: true, data: undefined };

    const { error } = await supabase
      .from('proposals')
      .update(update)
      .eq('id', proposalId)
      .eq('user_id', userId);

    if (error) return { success: false, error: error.message };

    // Mudou a contagem de unidades: o investimento por unidade de cada opção
    // precisa acompanhar, senão a validação reprova em `unit/amount-mismatch`.
    if (patch.unitsCount !== undefined || patch.unitsLabel !== undefined) {
      await syncUnitInvestment(supabase, proposalId, record);
    }

    revalidateProposal(proposalId);
    return { success: true, data: undefined };
  } catch (error) {
    return fail(error, 'Erro inesperado ao salvar a identificação.');
  }
}

async function syncUnitInvestment(
  supabase: SupabaseClient,
  proposalId: string,
  record: ProposalRecord,
): Promise<void> {
  const { data } = await supabase
    .from('proposals')
    .select('units_count, units_label')
    .eq('id', proposalId)
    .maybeSingle();

  const row = (data ?? {}) as { units_count?: number | null; units_label?: string | null };
  const unitsCount = row.units_count ?? null;
  const unitsLabel = row.units_label ?? null;

  await Promise.all(
    record.pricingOptions.map((option) =>
      supabase
        .from('proposal_pricing_options')
        .update({
          units_count: unitsCount,
          units_label: unitsLabel,
          amount_per_unit: unitsCount && unitsCount > 0 ? round2(option.grandTotal / unitsCount) : null,
        })
        .eq('id', option.id)
        .eq('proposal_id', proposalId),
    ),
  );
}

// ---------------------------------------------------------------------------
// Seções: liga/desliga, título, ordem
// ---------------------------------------------------------------------------

export async function updateSectionAction(
  proposalId: string,
  sectionId: string,
  patch: { title?: string; enabled?: boolean },
): Promise<ActionResult> {
  try {
    const { supabase, record } = await requireProposal(proposalId);
    assertEditable(record);

    const update: Record<string, unknown> = {};
    if (patch.title !== undefined) update.title = patch.title.trim() || 'Sem título';
    if (patch.enabled !== undefined) update.enabled = patch.enabled;
    if (Object.keys(update).length === 0) return { success: true, data: undefined };

    const { error } = await supabase
      .from('proposal_sections')
      .update(update)
      .eq('id', sectionId)
      .eq('proposal_id', proposalId);

    if (error) return { success: false, error: error.message };
    revalidateProposal(proposalId);
    return { success: true, data: undefined };
  } catch (error) {
    return fail(error, 'Erro inesperado ao salvar a seção.');
  }
}

/** Reordena as seções: a posição no array vira `order_index`. */
export async function reorderSectionsAction(
  proposalId: string,
  orderedSectionIds: string[],
): Promise<ActionResult> {
  try {
    const { supabase, record } = await requireProposal(proposalId);
    assertEditable(record);

    const known = new Set(record.sections.map((section) => section.id));
    if (orderedSectionIds.some((id) => !known.has(id))) {
      return { success: false, error: 'A lista de seções não corresponde a esta proposta.' };
    }

    for (const [index, sectionId] of orderedSectionIds.entries()) {
      const { error } = await supabase
        .from('proposal_sections')
        .update({ order_index: index + 1 })
        .eq('id', sectionId)
        .eq('proposal_id', proposalId);
      if (error) return { success: false, error: error.message };
    }

    revalidateProposal(proposalId);
    return { success: true, data: undefined };
  } catch (error) {
    return fail(error, 'Erro inesperado ao reordenar as seções.');
  }
}

// ---------------------------------------------------------------------------
// Blocos de texto
// ---------------------------------------------------------------------------

export interface ProposalTextPatch {
  institutional?: {
    quemSomos: ProposalRichBlock | null;
    identidade: ProposalRichBlock | null;
    compromisso: ProposalRichBlock | null;
    diferencialOrcaRede: ProposalRichBlock | null;
  };
  billingConditions?: ProposalRichBlock | null;
  finalConsiderations?: ProposalRichBlock[];
  acceptanceClosingText?: string | null;
  scheduleFootnote?: string | null;
  activities?: Array<{
    order: number;
    title: string;
    intro: string;
    items: string[];
    note: ProposalRichBlock | null;
  }>;
}

export async function updateProposalTextAction(
  proposalId: string,
  patch: ProposalTextPatch,
): Promise<ActionResult> {
  try {
    const { supabase, userId, record } = await requireProposal(proposalId);
    assertEditable(record);

    const update: Record<string, unknown> = {};
    if (patch.institutional !== undefined) update.institutional = patch.institutional;
    if (patch.billingConditions !== undefined) update.billing_conditions = patch.billingConditions;
    if (patch.finalConsiderations !== undefined) {
      update.final_considerations = patch.finalConsiderations;
    }
    if (patch.acceptanceClosingText !== undefined) {
      update.acceptance_closing_text = patch.acceptanceClosingText || null;
    }
    if (patch.scheduleFootnote !== undefined) {
      update.schedule_footnote = patch.scheduleFootnote || null;
    }

    if (patch.activities !== undefined) {
      // `facts` é do sistema: recopiado do que já estava salvo, nunca aceito da
      // UI. Editar a prosa não pode alterar quantitativo.
      const factsByOrder = new Map(record.proposal.activities.map((group) => [group.order, group.facts]));
      update.activities = patch.activities.map((group, index) => ({
        order: group.order || index + 1,
        title: group.title,
        intro: group.intro,
        items: group.items,
        note: group.note,
        facts: factsByOrder.get(group.order) ?? [],
      }));
    }

    if (Object.keys(update).length === 0) return { success: true, data: undefined };

    const { error } = await supabase
      .from('proposals')
      .update(update)
      .eq('id', proposalId)
      .eq('user_id', userId);

    if (error) return { success: false, error: error.message };
    revalidateProposal(proposalId);
    return { success: true, data: undefined };
  } catch (error) {
    return fail(error, 'Erro inesperado ao salvar o texto.');
  }
}

// ---------------------------------------------------------------------------
// Curva ABC
// ---------------------------------------------------------------------------

export interface AbcRowInput {
  id?: string;
  curve: 'A' | 'B' | 'C';
  label: string;
  amount: number;
  order: number;
}

/**
 * Salva a curva ABC. Percentuais e totais por curva são SEMPRE recalculados a
 * partir dos valores — nunca aceitos da UI. É o que garante que a Curva C não
 * volte a receber o valor da Curva B (§8.4).
 */
export async function saveAbcRowsAction(
  proposalId: string,
  rows: AbcRowInput[],
): Promise<ActionResult> {
  try {
    const { supabase, userId, record } = await requireProposal(proposalId);
    assertEditable(record);

    const normalized = normalizeAbcRows(
      rows.map((row, index) => ({
        curve: row.curve,
        label: row.label.trim() || 'Sem rótulo',
        amount: Math.max(round2(row.amount), 0),
        percent: 0,
        order: row.order || index + 1,
      })),
    );

    const { error: deleteError } = await supabase
      .from('proposal_abc_rows')
      .delete()
      .eq('proposal_id', proposalId);
    if (deleteError) return { success: false, error: deleteError.message };

    if (normalized.rows.length > 0) {
      const { error } = await supabase.from('proposal_abc_rows').insert(
        normalized.rows.map((row) => ({
          proposal_id: proposalId,
          curve: row.curve,
          label: row.label,
          amount: row.amount,
          percent: row.percent,
          order_index: row.order,
        })),
      );
      if (error) return { success: false, error: error.message };
    }

    const { error: totalError } = await supabase
      .from('proposals')
      .update({ abc_grand_total: normalized.grandTotal })
      .eq('id', proposalId)
      .eq('user_id', userId);
    if (totalError) return { success: false, error: totalError.message };

    revalidateProposal(proposalId);
    return { success: true, data: undefined };
  } catch (error) {
    return fail(error, 'Erro inesperado ao salvar a curva ABC.');
  }
}

/** Refaz a curva a partir do consolidado congelado, com o corte informado. */
export async function regenerateAbcAction(
  proposalId: string,
  cuts: { cutA: number; cutB: number },
): Promise<ActionResult> {
  try {
    const { record } = await requireProposal(proposalId);
    assertEditable(record);

    const cutA = Math.min(Math.max(cuts.cutA, 1), 99);
    const cutB = Math.min(Math.max(cuts.cutB, cutA + 1), 100);
    const abc = buildAbcFromMaterials(record.proposal.materialsSnapshot, { cutA, cutB });

    return await saveAbcRowsAction(
      proposalId,
      abc.rows.map((row) => ({
        curve: row.curve,
        label: row.label,
        amount: row.amount,
        order: row.order,
      })),
    );
  } catch (error) {
    return fail(error, 'Erro inesperado ao recalcular a curva ABC.');
  }
}

/**
 * Recongela o consolidado de material a partir do orçamento e refaz a curva.
 * É a única forma de a proposta absorver mudança de preço — de propósito: uma
 * peça enviada ao cliente não muda porque alguém editou o catálogo.
 */
export async function refreshMaterialsAction(proposalId: string): Promise<ActionResult<{ materialTotal: number }>> {
  try {
    const { supabase, userId, record } = await requireProposal(proposalId);
    assertEditable(record);

    const snapshot = await loadBudgetSnapshot(supabase, record.proposal.budgetId, userId);
    if (!snapshot) return { success: false, error: 'Orçamento de origem não encontrado.' };

    const { error } = await supabase
      .from('proposals')
      .update({ materials_snapshot: snapshot.materials })
      .eq('id', proposalId)
      .eq('user_id', userId);
    if (error) return { success: false, error: error.message };

    const abc = buildAbcFromMaterials(snapshot.materials);
    const abcResult = await saveAbcRowsAction(
      proposalId,
      abc.rows.map((row) => ({
        curve: row.curve,
        label: row.label,
        amount: row.amount,
        order: row.order,
      })),
    );
    if (!abcResult.success) return abcResult;

    revalidateProposal(proposalId);
    return { success: true, data: { materialTotal: snapshot.materialTotal } };
  } catch (error) {
    return fail(error, 'Erro inesperado ao atualizar os materiais.');
  }
}

// ---------------------------------------------------------------------------
// Opções de preço
// ---------------------------------------------------------------------------

export async function addPricingOptionAction(
  proposalId: string,
  scenarioId: string,
): Promise<ActionResult> {
  try {
    const { supabase, userId, record } = await requireProposal(proposalId);
    assertEditable(record);

    const [scenario] = await getPricingScenarios(supabase, userId, [scenarioId]);
    if (!scenario) return { success: false, error: 'Cenário de precificação não encontrado.' };

    if (record.pricingOptions.some((option) => option.savedPricingBudgetId === scenarioId)) {
      return { success: false, error: 'Este cenário já está na proposta.' };
    }

    const label = uniqueLabel(
      scenario.scenarioName || 'Opção',
      record.pricingOptions.map((option) => option.label),
    );
    const unitsCount = record.proposal.unitsCount;

    const { data: optionRow, error } = await supabase
      .from('proposal_pricing_options')
      .insert({
        proposal_id: proposalId,
        saved_pricing_budget_id: scenario.id,
        label,
        is_recommended: record.pricingOptions.length === 0,
        order_index: record.pricingOptions.length + 1,
        material_total: scenario.materialTotal,
        labor_total: scenario.laborTotal,
        grand_total: scenario.grandTotal,
        units_count: unitsCount,
        units_label: record.proposal.unitsLabel,
        amount_per_unit:
          unitsCount && unitsCount > 0 ? round2(scenario.grandTotal / unitsCount) : null,
      })
      .select('id')
      .single();

    if (error || !optionRow) {
      return { success: false, error: error?.message ?? 'Falha ao adicionar a opção de preço.' };
    }

    await rebuildSegmentsForOption(
      supabase,
      userId,
      proposalId,
      record.proposal.budgetId,
      String((optionRow as { id: string }).id),
      scenario.materialTotal,
      scenario.laborTotal,
    );

    revalidateProposal(proposalId);
    return { success: true, data: undefined };
  } catch (error) {
    return fail(error, 'Erro inesperado ao adicionar a opção de preço.');
  }
}

function uniqueLabel(base: string, existing: string[]): string {
  if (!existing.includes(base)) return base;
  let counter = 2;
  while (existing.includes(`${base} (${counter})`)) counter += 1;
  return `${base} (${counter})`;
}

async function rebuildSegmentsForOption(
  supabase: SupabaseClient,
  userId: string,
  proposalId: string,
  budgetId: string,
  optionId: string,
  materialTotal: number,
  laborTotal: number,
): Promise<void> {
  const snapshot = await loadBudgetSnapshot(supabase, budgetId, userId);
  if (!snapshot) return;

  const segments = buildSegmentTotals(
    snapshot.segments.map((segment) => ({
      segmentId: segment.segmentId,
      label: segment.label,
      materialWeight: segment.materialWeight,
    })),
    materialTotal,
    laborTotal,
  );

  await supabase.from('proposal_segment_totals').delete().eq('pricing_option_id', optionId);

  if (segments.length > 0) {
    await supabase.from('proposal_segment_totals').insert(
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
  }
}

export async function updatePricingOptionAction(
  proposalId: string,
  optionId: string,
  patch: { label?: string; isRecommended?: boolean },
): Promise<ActionResult> {
  try {
    const { supabase, record } = await requireProposal(proposalId);
    assertEditable(record);

    if (patch.isRecommended) {
      // Índice único parcial: só uma recomendada por proposta. Zerar antes
      // evita o 23505 que a UI não teria como explicar.
      const { error } = await supabase
        .from('proposal_pricing_options')
        .update({ is_recommended: false })
        .eq('proposal_id', proposalId)
        .neq('id', optionId);
      if (error) return { success: false, error: error.message };
    }

    const update: Record<string, unknown> = {};
    if (patch.label !== undefined) update.label = patch.label.trim() || 'Opção';
    if (patch.isRecommended !== undefined) update.is_recommended = patch.isRecommended;

    const { error } = await supabase
      .from('proposal_pricing_options')
      .update(update)
      .eq('id', optionId)
      .eq('proposal_id', proposalId);

    if (error) return { success: false, error: error.message };
    revalidateProposal(proposalId);
    return { success: true, data: undefined };
  } catch (error) {
    return fail(error, 'Erro inesperado ao salvar a opção de preço.');
  }
}

/** Recarrega os totais da opção a partir do cenário de precificação de origem. */
export async function syncPricingOptionAction(
  proposalId: string,
  optionId: string,
): Promise<ActionResult> {
  try {
    const { supabase, userId, record } = await requireProposal(proposalId);
    assertEditable(record);

    const option = record.pricingOptions.find((item) => item.id === optionId);
    if (!option) return { success: false, error: 'Opção de preço não encontrada.' };
    if (!option.savedPricingBudgetId) {
      return {
        success: false,
        error: 'Esta opção não aponta mais para uma precificação salva — edite os valores à mão.',
      };
    }

    const [scenario] = await getPricingScenarios(supabase, userId, [option.savedPricingBudgetId]);
    if (!scenario) {
      return { success: false, error: 'A precificação de origem foi excluída.' };
    }

    const unitsCount = option.unitsCount ?? record.proposal.unitsCount;

    const { error } = await supabase
      .from('proposal_pricing_options')
      .update({
        material_total: scenario.materialTotal,
        labor_total: scenario.laborTotal,
        grand_total: scenario.grandTotal,
        amount_per_unit:
          unitsCount && unitsCount > 0 ? round2(scenario.grandTotal / unitsCount) : null,
      })
      .eq('id', optionId)
      .eq('proposal_id', proposalId);

    if (error) return { success: false, error: error.message };

    await rebuildSegmentsForOption(
      supabase,
      userId,
      proposalId,
      record.proposal.budgetId,
      optionId,
      scenario.materialTotal,
      scenario.laborTotal,
    );

    // O parcelamento incide sobre o VS: mudou o VS, os valores das parcelas
    // mudam junto, senão a soma das parcelas deixa de fechar com a mão de obra.
    if (option.paymentTerms.length > 0) {
      const repriced = repricePaymentTerms(
        option.paymentTerms.map((term) => ({
          order: term.orderIndex,
          percent: term.percent,
          amount: term.amount,
          dueLabel: term.dueLabel,
        })),
        scenario.laborTotal,
      );

      for (const [index, term] of repriced.entries()) {
        await supabase
          .from('proposal_payment_terms')
          .update({ amount: term.amount })
          .eq('id', option.paymentTerms[index].id);
      }
    }

    revalidateProposal(proposalId);
    return { success: true, data: undefined };
  } catch (error) {
    return fail(error, 'Erro inesperado ao sincronizar a precificação.');
  }
}

export async function removePricingOptionAction(
  proposalId: string,
  optionId: string,
): Promise<ActionResult> {
  try {
    const { supabase, record } = await requireProposal(proposalId);
    assertEditable(record);

    const { error } = await supabase
      .from('proposal_pricing_options')
      .delete()
      .eq('id', optionId)
      .eq('proposal_id', proposalId);

    if (error) return { success: false, error: error.message };
    revalidateProposal(proposalId);
    return { success: true, data: undefined };
  } catch (error) {
    return fail(error, 'Erro inesperado ao remover a opção de preço.');
  }
}

// ---------------------------------------------------------------------------
// Valores por segmento
// ---------------------------------------------------------------------------

export interface SegmentTotalInput {
  id?: string;
  segmentId: string | null;
  label: string;
  materialAmount: number;
  laborAmount: number;
  order: number;
}

export async function saveSegmentTotalsAction(
  proposalId: string,
  optionId: string,
  rows: SegmentTotalInput[],
): Promise<ActionResult> {
  try {
    const { supabase, record } = await requireProposal(proposalId);
    assertEditable(record);

    const option = record.pricingOptions.find((item) => item.id === optionId);
    if (!option) return { success: false, error: 'Opção de preço não encontrada.' };

    const normalized = normalizeSegmentTotals(
      rows.map((row, index) => ({
        label: row.label.trim() || 'Sem rótulo',
        materialAmount: Math.max(round2(row.materialAmount), 0),
        laborAmount: Math.max(round2(row.laborAmount), 0),
        totalAmount: 0,
        percent: 0,
        order: row.order || index + 1,
        segmentId: row.segmentId,
      })),
      option.grandTotal,
    );

    const { error: deleteError } = await supabase
      .from('proposal_segment_totals')
      .delete()
      .eq('pricing_option_id', optionId)
      .eq('proposal_id', proposalId);
    if (deleteError) return { success: false, error: deleteError.message };

    if (normalized.length > 0) {
      const { error } = await supabase.from('proposal_segment_totals').insert(
        normalized.map((segment) => ({
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
      if (error) return { success: false, error: error.message };
    }

    revalidateProposal(proposalId);
    return { success: true, data: undefined };
  } catch (error) {
    return fail(error, 'Erro inesperado ao salvar os valores por segmento.');
  }
}

// ---------------------------------------------------------------------------
// Condições de pagamento (§8.5)
// ---------------------------------------------------------------------------

export interface PaymentTermInput {
  order: number;
  percent: number;
  dueLabel: string;
  dueDate?: string | null;
}

export async function generatePaymentTermsAction(
  proposalId: string,
  optionId: string,
  plan: Omit<PaymentPlanInput, 'laborTotal'>,
): Promise<ActionResult> {
  try {
    const { record } = await requireProposal(proposalId);
    const option = record.pricingOptions.find((item) => item.id === optionId);
    if (!option) return { success: false, error: 'Opção de preço não encontrada.' };

    const terms = generatePaymentTerms({ ...plan, laborTotal: option.laborTotal });

    return await savePaymentTermsAction(
      proposalId,
      optionId,
      terms.map((term) => ({
        order: term.order,
        percent: term.percent,
        dueLabel: term.dueLabel,
        dueDate: term.dueDate,
      })),
    );
  } catch (error) {
    return fail(error, 'Erro inesperado ao gerar o parcelamento.');
  }
}

export async function savePaymentTermsAction(
  proposalId: string,
  optionId: string,
  rows: PaymentTermInput[],
): Promise<ActionResult> {
  try {
    const { supabase, record } = await requireProposal(proposalId);
    assertEditable(record);

    const option = record.pricingOptions.find((item) => item.id === optionId);
    if (!option) return { success: false, error: 'Opção de preço não encontrada.' };

    // O valor de cada parcela é derivado do SEU percentual sobre a mão de obra.
    // Nunca digitado: é a identidade que a validação do PDF cobra linha a linha,
    // e o parcelamento nunca incide sobre material (§8.2).
    const terms = rows
      .slice()
      .sort((a, b) => a.order - b.order)
      .map((row, index) => ({
        proposal_id: proposalId,
        pricing_option_id: optionId,
        order_index: index + 1,
        percent: round2(Math.min(Math.max(row.percent, 0), 100)),
        amount: round2((round2(Math.min(Math.max(row.percent, 0), 100)) / 100) * option.laborTotal),
        due_label: row.dueLabel.trim() || `Parcela ${index + 1}`,
        due_date: row.dueDate || null,
      }));

    const { error: deleteError } = await supabase
      .from('proposal_payment_terms')
      .delete()
      .eq('pricing_option_id', optionId)
      .eq('proposal_id', proposalId);
    if (deleteError) return { success: false, error: deleteError.message };

    if (terms.length > 0) {
      const { error } = await supabase.from('proposal_payment_terms').insert(terms);
      if (error) return { success: false, error: error.message };
    }

    revalidateProposal(proposalId);
    return { success: true, data: undefined };
  } catch (error) {
    return fail(error, 'Erro inesperado ao salvar as condições de pagamento.');
  }
}

// ---------------------------------------------------------------------------
// Matriz de responsabilidade
// ---------------------------------------------------------------------------

export interface ResponsibilityItemInput {
  order: number;
  description: string;
  responsible: 'contratada' | 'contratante' | 'ambos';
}

export async function saveResponsibilityItemsAction(
  proposalId: string,
  items: ResponsibilityItemInput[],
): Promise<ActionResult> {
  try {
    const { supabase, record } = await requireProposal(proposalId);
    assertEditable(record);

    const rows = items
      .filter((item) => item.description.trim().length > 0)
      .sort((a, b) => a.order - b.order)
      .map((item, index) => ({
        proposal_id: proposalId,
        order_index: index + 1,
        description: item.description.trim(),
        responsible: item.responsible,
      }));

    const { error: deleteError } = await supabase
      .from('proposal_responsibility_items')
      .delete()
      .eq('proposal_id', proposalId);
    if (deleteError) return { success: false, error: deleteError.message };

    if (rows.length > 0) {
      const { error } = await supabase.from('proposal_responsibility_items').insert(rows);
      if (error) return { success: false, error: error.message };
    }

    revalidateProposal(proposalId);
    return { success: true, data: undefined };
  } catch (error) {
    return fail(error, 'Erro inesperado ao salvar a matriz de responsabilidade.');
  }
}

// ---------------------------------------------------------------------------
// Cronograma
// ---------------------------------------------------------------------------

export interface ScheduleRowInput {
  order: number;
  stage: string;
  marks: Record<string, boolean | string>;
}

export async function saveScheduleAction(
  proposalId: string,
  columns: ProposalScheduleColumn[],
  rows: ScheduleRowInput[],
): Promise<ActionResult> {
  try {
    const { supabase, userId, record } = await requireProposal(proposalId);
    assertEditable(record);

    const cleanColumns = columns
      .filter((column) => column.key.trim() && column.label.trim())
      .map((column) => ({ key: column.key.trim(), label: column.label.trim() }));

    const validKeys = new Set(cleanColumns.map((column) => column.key));

    const { error: columnsError } = await supabase
      .from('proposals')
      .update({ schedule_columns: cleanColumns })
      .eq('id', proposalId)
      .eq('user_id', userId);
    if (columnsError) return { success: false, error: columnsError.message };

    const { error: deleteError } = await supabase
      .from('proposal_schedule_rows')
      .delete()
      .eq('proposal_id', proposalId);
    if (deleteError) return { success: false, error: deleteError.message };

    const cleanRows = rows
      .filter((row) => row.stage.trim().length > 0)
      .sort((a, b) => a.order - b.order)
      .map((row, index) => ({
        proposal_id: proposalId,
        order_index: index + 1,
        stage: row.stage.trim(),
        // Marca de coluna que não existe mais vira lixo silencioso no PDF.
        marks: Object.fromEntries(
          Object.entries(row.marks).filter(([key, value]) => validKeys.has(key) && value !== false),
        ),
      }));

    if (cleanRows.length > 0) {
      const { error } = await supabase.from('proposal_schedule_rows').insert(cleanRows);
      if (error) return { success: false, error: error.message };
    }

    revalidateProposal(proposalId);
    return { success: true, data: undefined };
  } catch (error) {
    return fail(error, 'Erro inesperado ao salvar o cronograma.');
  }
}

// ---------------------------------------------------------------------------
// Mídia
// ---------------------------------------------------------------------------

export interface ProposalMediaInput {
  id?: string;
  mediaId?: string | null;
  url: string;
  caption: string | null;
  groupLabel: string | null;
  order: number;
}

export async function saveSectionMediaAction(
  proposalId: string,
  sectionKey: ProposalSectionKey,
  items: ProposalMediaInput[],
): Promise<ActionResult> {
  try {
    const { supabase, record } = await requireProposal(proposalId);
    assertEditable(record);

    const rows = items
      .filter((item) => item.url.trim().length > 0)
      .sort((a, b) => a.order - b.order)
      .map((item, index) => ({
        proposal_id: proposalId,
        section_key: sectionKey,
        media_id: item.mediaId || null,
        url: item.url.trim(),
        caption: item.caption?.trim() || null,
        group_label: item.groupLabel?.trim() || null,
        order_index: index + 1,
      }));

    const { error: deleteError } = await supabase
      .from('proposal_media')
      .delete()
      .eq('proposal_id', proposalId)
      .eq('section_key', sectionKey);
    if (deleteError) return { success: false, error: deleteError.message };

    if (rows.length > 0) {
      const { error } = await supabase.from('proposal_media').insert(rows);
      if (error) return { success: false, error: error.message };
    }

    revalidateProposal(proposalId);
    return { success: true, data: undefined };
  } catch (error) {
    return fail(error, 'Erro inesperado ao salvar as imagens.');
  }
}

// ---------------------------------------------------------------------------
// Briefing e assistência de IA
// ---------------------------------------------------------------------------

export async function saveAiBriefingAction(
  proposalId: string,
  briefing: ProposalAiBriefing,
): Promise<ActionResult> {
  try {
    const { supabase, record } = await requireProposal(proposalId);
    assertEditable(record);

    const section = record.sections.find((item) => item.sectionKey === 'descricao_atividades');
    if (!section) return { success: false, error: 'Seção de atividades não encontrada na proposta.' };

    const content = { ...(section.content ?? {}), aiBriefing: parseAiBriefing(briefing) };

    const { error } = await supabase
      .from('proposal_sections')
      .update({ content })
      .eq('id', section.id)
      .eq('proposal_id', proposalId);

    if (error) return { success: false, error: error.message };
    revalidateProposal(proposalId);
    return { success: true, data: undefined };
  } catch (error) {
    return fail(error, 'Erro inesperado ao salvar o briefing.');
  }
}

export interface DraftPlanStep {
  index: number;
  key: ProposalDraftStep['key'];
  label: string;
}

/**
 * Monta o plano de etapas do rascunho. Rodar etapa a etapa é o que mantém cada
 * invocação longe do teto de 60s do plano Hobby — o mesmo desenho do pipeline
 * de suprimentos.
 */
export async function planProposalDraftAction(
  proposalId: string,
): Promise<ActionResult<{ steps: DraftPlanStep[]; warnings: string[] }>> {
  try {
    const { supabase, userId, record } = await requireProposal(proposalId);
    assertEditable(record);

    const { input, warnings } = await buildProposalDraftInput(supabase, userId, record);
    const steps = planProposalDraftSteps(input);

    return {
      success: true,
      data: {
        steps: steps.map((step) => ({ index: step.index, key: step.key, label: step.label })),
        warnings,
      },
    };
  } catch (error) {
    return fail(error, 'Erro inesperado ao planejar o rascunho.');
  }
}

export interface DraftStepOutcome {
  label: string;
  violations: ProposalGuardrailViolation[];
  isLast: boolean;
}

/**
 * Roda UMA etapa do rascunho e grava o resultado na hora.
 *
 * Gravar por etapa em vez de acumular em memória tem uma consequência boa: se a
 * quinta etapa falhar, as quatro primeiras já estão salvas e o usuário retoma
 * dali, em vez de perder tudo.
 */
export async function runProposalDraftStepAction(
  proposalId: string,
  stepIndex: number,
): Promise<ActionResult<DraftStepOutcome>> {
  try {
    const { supabase, userId, record } = await requireProposal(proposalId);
    assertEditable(record);

    const { input } = await buildProposalDraftInput(supabase, userId, record);
    const steps = planProposalDraftSteps(input);
    const step = steps.find((item) => item.index === stepIndex);
    if (!step) return { success: false, error: 'Etapa inexistente no plano de geração.' };

    const result = await runProposalDraftStep(input, step);
    if (Object.keys(result.partial).length === 0) {
      const reason = result.violations[0]?.message ?? 'a etapa não devolveu conteúdo utilizável.';
      return { success: false, error: `Falha na etapa "${step.label}": ${reason}` };
    }

    const draft = mergeStepResults([result]);
    const update: Record<string, unknown> = { ai_prompt_version: PROPOSAL_DRAFT_PROMPT_VERSION };

    if (result.partial.header) {
      update.project_title = draft.header.projectTitle;
      update.project_subtitle = draft.header.projectSubtitle;
    }
    if (result.partial.institutional) {
      update.institutional = draft.institutional;
    }
    if (result.partial.billingConditions !== undefined) {
      update.billing_conditions = draft.billingConditions;
    }
    if (result.partial.scheduleFootnote !== undefined) {
      update.schedule_footnote = draft.scheduleFootnote;
    }
    if (result.partial.acceptanceClosingText !== undefined) {
      update.acceptance_closing_text = draft.acceptanceClosingText || null;
    }
    if (result.partial.finalConsiderations) {
      update.final_considerations = draft.finalConsiderations;
    }

    if (result.partial.activities && result.partial.activities.length > 0) {
      const firstActivityIndex = steps.find((item) => item.key === 'atividade')?.index ?? -1;
      const existing = stepIndex === firstActivityIndex ? [] : record.proposal.activities;
      const incoming = draft.activities;
      const incomingOrders = new Set(incoming.map((group) => group.order));

      update.activities = [
        ...existing.filter((group) => !incomingOrders.has(group.order)),
        ...incoming,
      ].sort((a, b) => a.order - b.order);
    }

    const { error } = await supabase
      .from('proposals')
      .update(update)
      .eq('id', proposalId)
      .eq('user_id', userId);

    if (error) return { success: false, error: error.message };

    revalidateProposal(proposalId);
    return {
      success: true,
      data: {
        label: step.label,
        violations: result.violations,
        isLast: stepIndex >= steps[steps.length - 1].index,
      },
    };
  } catch (error) {
    return fail(error, 'Erro inesperado ao gerar o rascunho.');
  }
}

export interface RefineBlockInput {
  sectionKey: ProposalSectionKey;
  action: ProposalRefineAction;
  block: ProposalRichBlock;
}

/** Refina um bloco e devolve o texto — quem grava é a tela, depois da revisão. */
export async function refineProposalBlockAction(
  proposalId: string,
  input: RefineBlockInput,
): Promise<ActionResult<{ block: ProposalRichBlock; violations: ProposalGuardrailViolation[] }>> {
  try {
    const { supabase, userId, record } = await requireProposal(proposalId);
    assertEditable(record);

    const { input: draftInput } = await buildProposalDraftInput(supabase, userId, record);

    const result = await refineProposalBlock({
      block: input.block,
      action: input.action,
      sectionKey: input.sectionKey,
      project: {
        workType: draftInput.project.workType,
        city: draftInput.project.city,
        state: draftInput.project.state,
        utility: draftInput.project.utility,
        clientName: draftInput.project.clientName,
      },
      technicalReferences: draftInput.technicalReferences,
    });

    if (!result.success) return { success: false, error: result.error };
    return { success: true, data: { block: result.block, violations: result.violations } };
  } catch (error) {
    return fail(error, 'Erro inesperado ao refinar o texto.');
  }
}

// ---------------------------------------------------------------------------
// Validação e publicação
// ---------------------------------------------------------------------------

export interface ProposalReadiness {
  issues: ProposalValidationIssue[];
  /** Impedimentos que não são de coerência numérica (cadastro incompleto). */
  blockers: string[];
}

/**
 * Checagem completa de "esta proposta pode ir para o cliente".
 *
 * Duas famílias: coerência numérica (do motor de PDF) e cadastro mínimo (desta
 * camada — o schema aceita empresa pela metade de propósito, a regra de
 * publicável é da aplicação).
 */
function assessReadiness(record: ProposalRecord): ProposalReadiness {
  const data = toProposalData(record);
  const issues = validateProposalData(data);
  const blockers: string[] = [];

  const enabled = new Set(
    record.sections.filter((section) => section.enabled).map((section) => section.sectionKey),
  );

  if (!record.company.legalName.trim()) {
    blockers.push('Razão social da empresa em branco (Configurações › Empresa).');
  }
  if (!record.company.whatsappNumber.trim()) {
    blockers.push(
      'WhatsApp da empresa em branco: a página pública da proposta não teria botão de contato.',
    );
  }
  if (enabled.has('termo_aceite') && !record.responsible) {
    blockers.push('Termo de aceite ligado sem responsável técnico selecionado.');
  }
  if (enabled.has('descricao_atividades') && record.proposal.activities.length === 0) {
    blockers.push('Descrição das atividades ligada e vazia — gere o rascunho ou desligue a seção.');
  }
  if (enabled.has('condicoes_pagamento')) {
    const missing = record.pricingOptions.filter((option) => option.paymentTerms.length === 0);
    if (missing.length > 0) {
      blockers.push(
        `Condições de pagamento ligadas, mas ${missing.length === 1 ? 'a opção' : 'as opções'} ${missing
          .map((option) => `"${option.label}"`)
          .join(', ')} ainda não ${missing.length === 1 ? 'tem' : 'têm'} parcelamento gerado.`,
      );
    }
  }
  if (!record.proposal.projectTitle.trim()) {
    blockers.push('Título do empreendimento em branco — é o que aparece na capa.');
  }

  return { issues, blockers };
}

export async function checkProposalReadinessAction(
  proposalId: string,
): Promise<ActionResult<ProposalReadiness>> {
  try {
    const { record } = await requireProposal(proposalId);
    return { success: true, data: assessReadiness(record) };
  } catch (error) {
    return fail(error, 'Erro inesperado ao validar a proposta.');
  }
}

export async function publishProposalAction(
  proposalId: string,
): Promise<ActionResult<{ shareToken: string }>> {
  try {
    const { supabase, userId, record } = await requireProposal(proposalId);

    const readiness = assessReadiness(record);
    if (readiness.issues.length > 0 || readiness.blockers.length > 0) {
      const lines = [
        ...readiness.blockers,
        ...readiness.issues.map((issue) => `${issue.path}: ${issue.message}`),
      ];
      return {
        success: false,
        error: `A proposta não passou na validação:\n${lines.map((line) => `• ${line}`).join('\n')}`,
      };
    }

    const { data, error } = await supabase
      .from('proposals')
      .update({ status: 'published', revoked_at: null })
      .eq('id', proposalId)
      .eq('user_id', userId)
      .select('share_token')
      .single();

    if (error || !data) {
      return { success: false, error: error?.message ?? 'Falha ao publicar a proposta.' };
    }

    revalidateProposal(proposalId);
    return { success: true, data: { shareToken: String((data as { share_token: string }).share_token) } };
  } catch (error) {
    return fail(error, 'Erro inesperado ao publicar a proposta.');
  }
}

export async function unpublishProposalAction(proposalId: string): Promise<ActionResult> {
  try {
    const { supabase, userId } = await authorize();
    const { error } = await supabase
      .from('proposals')
      .update({ status: 'draft' })
      .eq('id', proposalId)
      .eq('user_id', userId);

    if (error) return { success: false, error: error.message };
    revalidateProposal(proposalId);
    return { success: true, data: undefined };
  } catch (error) {
    return fail(error, 'Erro inesperado ao despublicar a proposta.');
  }
}

/**
 * Revoga o link público. Republicar depois disso gera um token NOVO — a trigger
 * `proposals_handle_publication` cuida disso, e é o que impede um link guardado
 * de voltar a funcionar.
 */
export async function revokeProposalLinkAction(proposalId: string): Promise<ActionResult> {
  try {
    const { supabase, userId } = await authorize();
    const { error } = await supabase
      .from('proposals')
      .update({ revoked_at: new Date().toISOString() })
      .eq('id', proposalId)
      .eq('user_id', userId);

    if (error) return { success: false, error: error.message };
    revalidateProposal(proposalId);
    return { success: true, data: undefined };
  } catch (error) {
    return fail(error, 'Erro inesperado ao revogar o link.');
  }
}
