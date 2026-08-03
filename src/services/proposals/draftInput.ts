import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

import type { ProposalDraftInput } from '@/services/ai/proposal';
import { flattenRichBlock } from '@/services/ai/proposal';
import type { ProposalActivityFact } from '@/types/proposal';

import { getAiBriefing } from './aiBriefing';
import { loadBudgetSnapshot } from './budgetSnapshot';
import type { ProposalRecord } from './repository';
import { loadProposalTemplate } from './templates';

/**
 * MONTAGEM DO `ProposalDraftInput`.
 *
 * A camada de IA não fala com o Supabase; esta função é exatamente a ponte que
 * o cabeçalho dela descreve. Duas regras que valem em cada linha daqui:
 *
 *   1. Dinheiro não entra. Nenhum total, nenhum preço unitário, nenhum VS.
 *      Se nenhuma cifra é enviada, qualquer cifra no texto gerado é
 *      necessariamente inventada — e o guardrail rejeita sem precisar julgar.
 *   2. Prazo não entra. Cronograma é tabela, não parágrafo.
 *
 * O que entra de número são os quantitativos fechados do orçamento, em `facts`.
 */

export interface BuildDraftInputResult {
  input: ProposalDraftInput;
  /** Chave de segmento de cada grupo, na mesma ordem de `input.activityGroups`. */
  segmentKeys: string[];
  warnings: string[];
}

export async function buildProposalDraftInput(
  supabase: SupabaseClient,
  userId: string,
  record: ProposalRecord,
): Promise<BuildDraftInputResult> {
  const warnings: string[] = [];
  const briefing = getAiBriefing(record);

  const [snapshot, template] = await Promise.all([
    loadBudgetSnapshot(supabase, record.proposal.budgetId, userId),
    loadProposalTemplate(supabase, userId, record.proposal.templateId),
  ]);

  if (!snapshot) {
    throw new Error('O orçamento de origem da proposta não está mais acessível.');
  }

  const segments = snapshot.segments.filter((segment) => segment.facts.length > 0);
  if (segments.length === 0) {
    throw new Error(
      'O orçamento não tem quantitativo nenhum para descrever. Lance materiais no orçamento antes de gerar o rascunho.',
    );
  }

  if (briefing.technicalReferences.length === 0) {
    warnings.push(
      'Nenhuma norma citável cadastrada no briefing: o texto sai sem citação normativa (o guardrail rejeita norma não listada).',
    );
  }
  if (!briefing.workType.trim()) {
    warnings.push('Tipo de obra em branco: o texto sai genérico.');
  }

  const recommended =
    record.pricingOptions.find((option) => option.isRecommended) ?? record.pricingOptions[0];

  const commercialFacts: ProposalActivityFact[] = [];
  if (recommended && recommended.paymentTerms.length > 0) {
    commercialFacts.push({
      label: 'parcelas do serviço',
      quantity: recommended.paymentTerms.length,
      unit: 'parcelas',
      isApproximate: false,
    });
  }
  const unitsCount = recommended?.unitsCount ?? record.proposal.unitsCount;
  const unitsLabel = recommended?.unitsLabel ?? record.proposal.unitsLabel;
  if (unitsCount && unitsCount > 0) {
    commercialFacts.push({
      label: unitsLabel?.trim() || 'unidades',
      quantity: unitsCount,
      unit: 'un',
      isApproximate: false,
    });
  }

  const hasDownPayment = Boolean(
    recommended?.paymentTerms.some((term) => /entrada|assinatura/i.test(term.dueLabel)),
  );

  const templateInstitutionalText = template
    ? [
        flattenRichBlock(template.institutional.quemSomos),
        flattenRichBlock(template.institutional.identidade),
        flattenRichBlock(template.institutional.compromisso),
      ]
        .filter(Boolean)
        .join('\n\n')
    : '';

  if (!templateInstitutionalText.trim()) {
    warnings.push(
      'Template sem texto institucional: as seções "Quem Somos" e afins saem vazias — escreva-as em Configurações › Templates de proposta.',
    );
  }

  const contractorResponsibilities = record.responsibilityItems
    .filter((item) => item.responsible === 'contratada' || item.responsible === 'ambos')
    .map((item) => item.description);

  // Escopo negativo: o bloco de considerações finais cujo título diz que não
  // está incluso. A IA não pode acrescentar item a esta lista.
  const exclusions = (template?.finalConsiderations ?? record.proposal.finalConsiderations)
    .filter((block) => /não est|nao est|exclus/i.test(block.heading ?? ''))
    .flatMap((block) => block.bullets);

  const input: ProposalDraftInput = {
    project: {
      workType: briefing.workType.trim() || record.proposal.projectTitle || 'Obra de rede elétrica',
      city: record.proposal.city,
      state: briefing.state.trim(),
      developmentName: briefing.developmentName.trim() || null,
      clientName: record.proposal.clientName,
      utility: briefing.utility.trim() || snapshot.utilityCompanyName || '',
      scopeLabel: record.proposal.scopeLabel,
      environmentConstraints: briefing.environmentConstraints.trim() || null,
      authorNotes: briefing.authorNotes.trim() || null,
    },
    company: record.company,
    responsible: record.responsible,
    technicalReferences: briefing.technicalReferences,
    activityGroups: segments.map((segment, index) => ({
      order: index + 1,
      suggestedTitle: segment.label,
      segmentLabel: segment.segmentId ? segment.label : null,
      facts: segment.facts,
      mandatoryNote: briefing.activityNotes[segment.segmentId ?? '']?.trim() || null,
    })),
    materialSubgroups: snapshot.materialSubgroups,
    commercial: {
      materialsBilledDirectlyBySupplier: true,
      installmentsApplyToLaborOnly: true,
      hasDownPayment,
      unitsLabel: unitsLabel?.trim() || null,
      commercialFacts,
    },
    template: {
      institutionalText: templateInstitutionalText,
      orcaRedeText: flattenRichBlock(template?.institutional.diferencialOrcaRede ?? null),
      billingConditionsText: flattenRichBlock(
        template?.billingConditions ?? record.proposal.billingConditions,
      ),
      contractorResponsibilities,
      exclusions,
    },
  };

  return {
    input,
    segmentKeys: segments.map((segment) => segment.segmentId ?? ''),
    warnings,
  };
}
