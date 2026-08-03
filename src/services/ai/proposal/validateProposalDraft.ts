/**
 * Validação pós-geração do rascunho completo.
 *
 * Independente do gerador de propósito: o texto é editável à mão depois de
 * gerado, e a edição manual é tão capaz de introduzir "05 (seis)" quanto a IA —
 * as duas propostas de referência são prova disso, foram escritas por pessoas.
 * Quem for publicar chama isto de novo, sobre o texto que está lá.
 *
 * Três checagens:
 *   1. estrutura — todo campo [IA] presente e não vazio
 *   2. cobertura — todo fato do orçamento citado no grupo a que pertence
 *   3. números  — as sete camadas de `numberGuard` sobre cada trecho
 */

import type { ProposalActivityGroup, ProposalRichBlock } from '@/types/proposal';
import {
  buildAllowedNumberUniverse,
  checkTextFields,
  type AllowedNumberUniverse,
} from './numberGuard';
import { flattenRichBlock } from './parseStepPayload';
import { extractNumbersFromText, formatIntegerPtBr } from './ptNumbers';
import type {
  ProposalDraftInput,
  ProposalDraftOutput,
  ProposalGuardrailViolation,
} from './types';

export interface ProposalValidationReport {
  ok: boolean;
  violations: ProposalGuardrailViolation[];
  /** Contagem por categoria, para telemetria e para a UI resumir. */
  countsByKind: Record<string, number>;
  /** Quantos trechos de texto foram inspecionados. */
  inspectedFields: number;
}

function blockFields(
  path: string,
  block: ProposalRichBlock | null
): { path: string; text: string | null }[] {
  if (!block) return [];
  const fields: { path: string; text: string | null }[] = [];
  if (block.heading) fields.push({ path: `${path}.heading`, text: block.heading });
  block.paragraphs.forEach((p, i) => fields.push({ path: `${path}.paragraphs[${i}]`, text: p }));
  block.bullets.forEach((b, i) => fields.push({ path: `${path}.bullets[${i}]`, text: b }));
  return fields;
}

// ---------------------------------------------------------------------------
// 1. Estrutura
// ---------------------------------------------------------------------------

function checkStructure(draft: ProposalDraftOutput): ProposalGuardrailViolation[] {
  const violations: ProposalGuardrailViolation[] = [];

  const missing = (path: string, message: string) =>
    violations.push({ kind: 'campo_ausente', path, message, excerpt: null });

  if (!draft.header.projectTitle.trim()) {
    missing('header.projectTitle', 'Título do empreendimento vazio.');
  }

  // `institutional` aceita null por seção desligada — só o Quem Somos é
  // obrigatório, porque é a seção que abre a peça.
  if (!draft.institutional.quemSomos) {
    missing('institutional.quemSomos', 'Bloco "Quem Somos" ausente.');
  }

  if (draft.activities.length === 0) {
    missing('activities', 'Nenhum grupo de atividades redigido.');
  }

  draft.activities.forEach((group, i) => {
    if (!group.title.trim()) missing(`activities[${i}].title`, 'Título do grupo vazio.');
    if (!group.intro.trim()) missing(`activities[${i}].intro`, 'Introdução do grupo vazia.');
    if (group.items.length === 0) {
      missing(`activities[${i}].items`, 'Grupo sem nenhuma linha de escopo.');
    }
  });

  if (draft.finalConsiderations.length === 0) {
    missing('finalConsiderations', 'Considerações finais ausentes.');
  }

  if (!draft.acceptanceClosingText.trim()) {
    missing('acceptance.closingText', 'Texto de fechamento do termo de aceite vazio.');
  }

  return violations;
}

// ---------------------------------------------------------------------------
// 2. Cobertura dos fatos
// ---------------------------------------------------------------------------

/**
 * Todo quantitativo do orçamento tem de aparecer no texto do grupo a que
 * pertence.
 *
 * O guardrail de geração impede o texto de inventar número. Esta checagem cobre
 * a falha oposta e igualmente cara: o texto que *esquece* um quantitativo, e com
 * isso deixa de descrever material que está sendo cobrado na tabela.
 */
function checkFactCoverage(
  draft: ProposalDraftOutput,
  input: ProposalDraftInput
): ProposalGuardrailViolation[] {
  const violations: ProposalGuardrailViolation[] = [];

  draft.activities.forEach((group: ProposalActivityGroup, groupIndex) => {
    const text = [group.intro, ...group.items, flattenRichBlock(group.note)].join('\n');
    const numbersInText = new Set(extractNumbersFromText(text).map((n) => n.value));

    for (const fact of group.facts) {
      if (numbersInText.has(fact.quantity)) continue;
      violations.push({
        kind: 'campo_ausente',
        path: `activities[${groupIndex}]`,
        message: `O quantitativo "${fact.label}" (${formatIntegerPtBr(fact.quantity)} ${fact.unit}) não aparece em nenhum item do grupo.`,
        excerpt: null,
      });
    }
  });

  // Grupo do orçamento que não virou texto nenhum.
  const writtenOrders = new Set(draft.activities.map((g) => g.order));
  for (const group of input.activityGroups) {
    if (writtenOrders.has(group.order)) continue;
    violations.push({
      kind: 'campo_ausente',
      path: 'activities',
      message: `O grupo "${group.suggestedTitle}" do orçamento não foi redigido.`,
      excerpt: null,
    });
  }

  return violations;
}

// ---------------------------------------------------------------------------
// 3. Números
// ---------------------------------------------------------------------------

function checkNumbers(
  draft: ProposalDraftOutput,
  input: ProposalDraftInput,
  strict: boolean
): { violations: ProposalGuardrailViolation[]; inspected: number } {
  const violations: ProposalGuardrailViolation[] = [];
  let inspected = 0;

  const baseUniverse = (facts: ProposalActivityGroup['facts']): AllowedNumberUniverse =>
    buildAllowedNumberUniverse({
      sources: [input],
      facts,
      references: input.technicalReferences,
    });

  const run = (
    fields: { path: string; text: string | null }[],
    facts: ProposalActivityGroup['facts']
  ) => {
    inspected += fields.length;
    violations.push(
      ...checkTextFields(fields, { universe: baseUniverse(facts), facts, strict })
    );
  };

  // Seções sem quantitativo: lista de fatos vazia, então qualquer número em
  // posição de quantidade é reprovado.
  run(
    [
      { path: 'header.projectTitle', text: draft.header.projectTitle },
      { path: 'header.projectSubtitle', text: draft.header.projectSubtitle },
    ],
    []
  );

  run(
    Object.entries(draft.institutional).flatMap(([key, block]) =>
      blockFields(`institutional.${key}`, block)
    ),
    []
  );

  draft.activities.forEach((group, i) => {
    run(
      [
        { path: `activities[${i}].title`, text: group.title },
        { path: `activities[${i}].intro`, text: group.intro },
        ...group.items.map((item, j) => ({ path: `activities[${i}].items[${j}]`, text: item })),
        ...blockFields(`activities[${i}].note`, group.note),
      ],
      group.facts
    );
  });

  run(blockFields('billingConditions', draft.billingConditions), input.commercial.commercialFacts);

  run(
    [
      { path: 'schedule.footnote', text: draft.scheduleFootnote },
      { path: 'acceptance.closingText', text: draft.acceptanceClosingText },
    ],
    input.commercial.commercialFacts
  );

  run(
    draft.finalConsiderations.flatMap((block, i) =>
      blockFields(`finalConsiderations[${i}]`, block)
    ),
    []
  );

  return { violations, inspected };
}

// ---------------------------------------------------------------------------
// Entrada pública
// ---------------------------------------------------------------------------

export interface ValidateDraftOptions {
  /** `false` desliga L1/L2. Só para depuração de prompt. */
  strict?: boolean;
  /** Pula a checagem de cobertura — útil ao validar um rascunho parcial. */
  skipCoverage?: boolean;
}

export function validateProposalDraft(
  draft: ProposalDraftOutput,
  input: ProposalDraftInput,
  options: ValidateDraftOptions = {}
): ProposalValidationReport {
  const strict = options.strict ?? true;

  const structure = checkStructure(draft);
  const coverage = options.skipCoverage ? [] : checkFactCoverage(draft, input);
  const numbers = checkNumbers(draft, input, strict);

  const violations = [...structure, ...coverage, ...numbers.violations];

  const countsByKind: Record<string, number> = {};
  for (const violation of violations) {
    countsByKind[violation.kind] = (countsByKind[violation.kind] ?? 0) + 1;
  }

  return {
    ok: violations.length === 0,
    violations,
    countsByKind,
    inspectedFields: numbers.inspected,
  };
}
