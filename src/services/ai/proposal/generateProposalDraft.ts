/**
 * Gerador do rascunho estruturado da proposta comercial.
 *
 * Duas formas de uso, mesmo motor:
 *
 *   generateProposalDraft(input)              tudo de uma vez — script, worker
 *   planProposalDraftSteps + runProposalDraftStep   uma etapa por invocação
 *
 * A segunda existe por causa do teto de 60s por invocação do Vercel Hobby. É o
 * mesmo desenho de `buildSemanticMatchPipelineContext` +
 * `runSingleSemanticMatchBatch` no pipeline de suprimentos: o plano é montado
 * antes de qualquer chamada, e cada etapa é independente e retomável. Uma
 * proposta com três grupos de atividades são sete etapas — nenhuma delas perto
 * do limite.
 *
 * Nenhuma etapa consulta o Supabase. A entrada chega pronta.
 */

import type { ResponseSchema } from '@google/generative-ai';
import type { ProposalActivityGroup, ProposalRichBlock } from '@/types/proposal';
import {
  PROPOSAL_DRAFT_ACTIVITIES_SYSTEM,
  PROPOSAL_DRAFT_COMMERCIAL_SYSTEM,
  PROPOSAL_DRAFT_CONSIDERATIONS_SYSTEM,
  PROPOSAL_DRAFT_COVER_SYSTEM,
  PROPOSAL_DRAFT_INSTITUTIONAL_SYSTEM,
  buildActivityGroupUserPrompt,
  buildCommercialUserPrompt,
  buildConsiderationsUserPrompt,
  buildCoverUserPrompt,
  buildGuardrailRetryPrompt,
  buildInstitutionalUserPrompt,
} from '../prompts';
import { getProposalAiModel, getProposalGuardrailRetry, isProposalNumberGuardStrict } from './config';
import { emptyUsage, generateJson, mergeUsage } from './geminiClient';
import {
  buildAllowedNumberUniverse,
  checkTextFields,
  formatViolationsForPrompt,
  type AllowedNumberUniverse,
} from './numberGuard';
import {
  flattenRichBlock,
  parseActivityGroupPayload,
  parseCommercialPayload,
  parseConsiderationsPayload,
  parseCoverPayload,
  parseInstitutionalPayload,
} from './parseStepPayload';
import {
  ACTIVITY_GROUP_SCHEMA,
  COMMERCIAL_SCHEMA,
  CONSIDERATIONS_SCHEMA,
  COVER_SCHEMA,
  INSTITUTIONAL_SCHEMA,
} from './schemas';
import type {
  ProposalActivityFact,
  ProposalAiUsage,
  ProposalDraftInput,
  ProposalDraftOutput,
  ProposalDraftPartial,
  ProposalDraftResult,
  ProposalDraftStep,
  ProposalGuardrailViolation,
  ProposalStepResult,
} from './types';

// ---------------------------------------------------------------------------
// Plano de etapas
// ---------------------------------------------------------------------------

/**
 * Monta o plano antes de qualquer chamada à IA. Determinístico: o mesmo input
 * dá sempre o mesmo plano, então quem chama pode persistir o índice e retomar.
 */
export function planProposalDraftSteps(input: ProposalDraftInput): ProposalDraftStep[] {
  const steps: ProposalDraftStep[] = [];
  let index = 0;

  steps.push({ index: index++, key: 'capa', label: 'Capa', activityGroupIndex: null });
  steps.push({
    index: index++,
    key: 'institucional',
    label: 'Institucional',
    activityGroupIndex: null,
  });

  const total = input.activityGroups.length;
  input.activityGroups.forEach((group, groupIndex) => {
    steps.push({
      index: index++,
      key: 'atividade',
      label: `Atividades ${groupIndex + 1}/${total} — ${group.suggestedTitle}`,
      activityGroupIndex: groupIndex,
    });
  });

  steps.push({
    index: index++,
    key: 'comercial',
    label: 'Condições comerciais',
    activityGroupIndex: null,
  });
  steps.push({
    index: index++,
    key: 'consideracoes',
    label: 'Considerações finais',
    activityGroupIndex: null,
  });

  return steps;
}

// ---------------------------------------------------------------------------
// Universo de números por etapa
// ---------------------------------------------------------------------------

/**
 * Quais fatos valem como quantitativo legítimo em cada etapa.
 *
 * Capa, institucional e considerações finais não recebem quantitativo nenhum no
 * prompt — e por isso também não podem citar nenhum. Com a lista vazia, qualquer
 * número em posição de quantidade nessas etapas é reprovado, que é exatamente o
 * comportamento desejado: essas seções falam de escopo e de norma, não de
 * quantidade.
 */
function factsForStep(
  input: ProposalDraftInput,
  step: ProposalDraftStep
): ProposalActivityFact[] {
  if (step.key === 'atividade' && step.activityGroupIndex !== null) {
    return input.activityGroups[step.activityGroupIndex].facts;
  }
  if (step.key === 'comercial') {
    return input.commercial.commercialFacts;
  }
  return [];
}

function universeForStep(
  input: ProposalDraftInput,
  step: ProposalDraftStep
): AllowedNumberUniverse {
  return buildAllowedNumberUniverse({
    // A entrada inteira: rótulo de fato, nome de material, texto de template e
    // código de norma também carregam números legítimos ("13,8 kV", "NT.00004",
    // "3 x 1 x 70 mm²"). Colher só de `facts` reprovaria texto correto.
    sources: [input],
    facts: factsForStep(input, step),
    references: input.technicalReferences,
  });
}

// ---------------------------------------------------------------------------
// Extração dos campos de texto de cada etapa, para o guardrail
// ---------------------------------------------------------------------------

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

function fieldsForPartial(
  partial: ProposalDraftPartial,
  step: ProposalDraftStep
): { path: string; text: string | null }[] {
  const fields: { path: string; text: string | null }[] = [];

  if (partial.header) {
    fields.push({ path: 'header.projectTitle', text: partial.header.projectTitle });
    fields.push({ path: 'header.projectSubtitle', text: partial.header.projectSubtitle });
  }

  if (partial.institutional) {
    for (const [key, block] of Object.entries(partial.institutional)) {
      fields.push(...blockFields(`institutional.${key}`, block));
    }
  }

  if (partial.activities) {
    const groupIndex = step.activityGroupIndex ?? 0;
    for (const group of partial.activities) {
      const base = `activities[${groupIndex}]`;
      fields.push({ path: `${base}.title`, text: group.title });
      fields.push({ path: `${base}.intro`, text: group.intro });
      group.items.forEach((item, i) =>
        fields.push({ path: `${base}.items[${i}]`, text: item })
      );
      fields.push(...blockFields(`${base}.note`, group.note));
    }
  }

  if (partial.billingConditions !== undefined) {
    fields.push(...blockFields('billingConditions', partial.billingConditions ?? null));
  }

  if (partial.scheduleFootnote !== undefined) {
    fields.push({ path: 'schedule.footnote', text: partial.scheduleFootnote ?? null });
  }

  if (partial.acceptanceClosingText !== undefined) {
    fields.push({
      path: 'acceptance.closingText',
      text: partial.acceptanceClosingText ?? null,
    });
  }

  if (partial.finalConsiderations) {
    partial.finalConsiderations.forEach((block, i) =>
      fields.push(...blockFields(`finalConsiderations[${i}]`, block))
    );
  }

  return fields;
}

// ---------------------------------------------------------------------------
// Montagem do prompt e parse por etapa
// ---------------------------------------------------------------------------

interface StepSpec {
  systemInstruction: string;
  userPrompt: string;
  schema: ResponseSchema;
  parse: (data: unknown) => ProposalDraftPartial | null;
}

function specForStep(input: ProposalDraftInput, step: ProposalDraftStep): StepSpec {
  switch (step.key) {
    case 'capa':
      return {
        systemInstruction: PROPOSAL_DRAFT_COVER_SYSTEM,
        userPrompt: buildCoverUserPrompt(input),
        schema: COVER_SCHEMA,
        parse: (data) => {
          const payload = parseCoverPayload(data);
          return payload ? { header: payload } : null;
        },
      };

    case 'institucional':
      return {
        systemInstruction: PROPOSAL_DRAFT_INSTITUTIONAL_SYSTEM,
        userPrompt: buildInstitutionalUserPrompt(input),
        schema: INSTITUTIONAL_SCHEMA,
        parse: (data) => {
          const payload = parseInstitutionalPayload(data);
          return payload ? { institutional: payload } : null;
        },
      };

    case 'atividade': {
      const groupIndex = step.activityGroupIndex ?? 0;
      const group = input.activityGroups[groupIndex];
      return {
        systemInstruction: PROPOSAL_DRAFT_ACTIVITIES_SYSTEM,
        userPrompt: buildActivityGroupUserPrompt(input, group),
        schema: ACTIVITY_GROUP_SCHEMA,
        parse: (data) => {
          const payload = parseActivityGroupPayload(data);
          if (!payload) return null;
          const activity: ProposalActivityGroup = {
            order: group.order,
            title: payload.title,
            intro: payload.intro,
            items: payload.items,
            note: payload.note,
            // Fatos são do sistema. Recopiados da entrada, nunca da resposta.
            facts: group.facts,
          };
          return { activities: [activity] };
        },
      };
    }

    case 'comercial':
      return {
        systemInstruction: PROPOSAL_DRAFT_COMMERCIAL_SYSTEM,
        userPrompt: buildCommercialUserPrompt(input),
        schema: COMMERCIAL_SCHEMA,
        parse: (data) => {
          const payload = parseCommercialPayload(data);
          if (!payload) return null;
          return {
            billingConditions: payload.billingConditions,
            scheduleFootnote: payload.scheduleFootnote,
            acceptanceClosingText: payload.acceptanceClosingText,
          };
        },
      };

    case 'consideracoes':
      return {
        systemInstruction: PROPOSAL_DRAFT_CONSIDERATIONS_SYSTEM,
        userPrompt: buildConsiderationsUserPrompt(input),
        schema: CONSIDERATIONS_SCHEMA,
        parse: (data) => {
          const blocks = parseConsiderationsPayload(data);
          return blocks ? { finalConsiderations: blocks } : null;
        },
      };
  }
}

// ---------------------------------------------------------------------------
// Execução de uma etapa
// ---------------------------------------------------------------------------

export interface RunStepOptions {
  /** Sobrescreve o modelo da etapa. Default: `getProposalAiModel()`. */
  model?: string;
  /** Sobrescreve o número de retentativas do guardrail. */
  guardrailRetry?: number;
  /** Log por etapa. Default: silencioso. */
  onProgress?: (message: string) => void;
}

/**
 * Roda UMA etapa, com o laço de retentativa informada pelo guardrail.
 *
 * O laço é multi-turno de propósito: em vez de recomeçar do zero, a resposta
 * reprovada volta ao modelo junto com a lista exata de violações. Corrigir um
 * texto sabendo o que está errado custa menos token e acerta mais do que
 * regenerar às cegas.
 *
 * Se as retentativas acabarem e ainda houver violação, a etapa devolve mesmo
 * assim — com `violations` preenchido. Um rascunho marcado para revisão é mais
 * útil que uma tela de erro; quem publica é que não pode ignorar a marca.
 */
export async function runProposalDraftStep(
  input: ProposalDraftInput,
  step: ProposalDraftStep,
  options: RunStepOptions = {}
): Promise<ProposalStepResult> {
  const model = options.model ?? getProposalAiModel();
  const maxRetries = options.guardrailRetry ?? getProposalGuardrailRetry();
  const strict = isProposalNumberGuardStrict();
  const universe = universeForStep(input, step);
  const facts = factsForStep(input, step);

  const spec = specForStep(input, step);
  const turns: { role: 'user' | 'model'; text: string }[] = [
    { role: 'user', text: spec.userPrompt },
  ];

  let usage = emptyUsage(model);
  let lastPartial: ProposalDraftPartial = {};
  let lastViolations: ProposalGuardrailViolation[] = [];

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const result = await generateJson({
      model,
      systemInstruction: spec.systemInstruction,
      turns,
      schema: spec.schema,
    });

    usage = mergeUsage(usage, result.usage);

    if (!result.success) {
      return {
        step,
        partial: lastPartial,
        usage,
        violations: [
          ...lastViolations,
          {
            kind: 'campo_ausente',
            path: step.key,
            message: result.error,
            excerpt: null,
          },
        ],
      };
    }

    const partial = spec.parse(result.data);

    if (!partial) {
      lastViolations = [
        {
          kind: 'campo_ausente',
          path: step.key,
          message: 'A resposta não trouxe todos os campos obrigatórios da etapa.',
          excerpt: null,
        },
      ];
    } else {
      lastPartial = partial;
      lastViolations = checkTextFields(fieldsForPartial(partial, step), {
        universe,
        facts,
        strict,
      });
    }

    if (lastViolations.length === 0) {
      options.onProgress?.(
        `[proposalDraft] ${step.label}: ok em ${attempt + 1} tentativa(s), ${usage.outputTokens} tokens de saída`
      );
      return { step, partial: lastPartial, usage, violations: [] };
    }

    if (attempt < maxRetries) {
      options.onProgress?.(
        `[proposalDraft] ${step.label}: ${lastViolations.length} violação(ões), reenviando para correção`
      );
      turns.push({ role: 'model', text: result.raw });
      turns.push({
        role: 'user',
        text: buildGuardrailRetryPrompt(formatViolationsForPrompt(lastViolations)),
      });
    }
  }

  options.onProgress?.(
    `[proposalDraft] ${step.label}: ${lastViolations.length} violação(ões) residuais — rascunho marcado para revisão`
  );

  return { step, partial: lastPartial, usage, violations: lastViolations };
}

// ---------------------------------------------------------------------------
// Merge e execução completa
// ---------------------------------------------------------------------------

function emptyDraft(): ProposalDraftOutput {
  return {
    header: { projectTitle: '', projectSubtitle: null },
    institutional: {
      quemSomos: null,
      identidade: null,
      compromisso: null,
      diferencialOrcaRede: null,
    },
    activities: [],
    billingConditions: null,
    scheduleFootnote: null,
    finalConsiderations: [],
    acceptanceClosingText: '',
  };
}

/**
 * Aplica resultados parciais sobre um rascunho. Aceita etapas fora de ordem —
 * quem chama por API route pode reexecutar uma etapa isolada e remontar.
 */
export function mergeStepResults(results: ProposalStepResult[]): ProposalDraftOutput {
  const draft = emptyDraft();

  for (const { partial } of results) {
    if (partial.header) draft.header = partial.header;
    if (partial.institutional) draft.institutional = partial.institutional;
    if (partial.activities) draft.activities.push(...partial.activities);
    if (partial.billingConditions !== undefined) {
      draft.billingConditions = partial.billingConditions ?? null;
    }
    if (partial.scheduleFootnote !== undefined) {
      draft.scheduleFootnote = partial.scheduleFootnote ?? null;
    }
    if (partial.acceptanceClosingText !== undefined) {
      draft.acceptanceClosingText = partial.acceptanceClosingText ?? '';
    }
    if (partial.finalConsiderations) {
      draft.finalConsiderations = partial.finalConsiderations;
    }
  }

  draft.activities.sort((a, b) => a.order - b.order);
  return draft;
}

export interface GenerateDraftOptions extends RunStepOptions {
  /** Pausa entre etapas, para folgar o limite de requisições por minuto. */
  stepDelayMs?: number;
}

/**
 * Roda o plano inteiro em sequência. Serve para script, worker e ambientes sem
 * o teto de 60s. Em API route no Hobby, use `planProposalDraftSteps` +
 * `runProposalDraftStep`, uma etapa por invocação.
 */
export async function generateProposalDraft(
  input: ProposalDraftInput,
  options: GenerateDraftOptions = {}
): Promise<ProposalDraftResult> {
  if (input.activityGroups.length === 0) {
    return {
      success: false,
      error: 'Orçamento sem grupos de atividade: não há escopo técnico para redigir.',
      steps: [],
    };
  }

  const steps = planProposalDraftSteps(input);
  const results: ProposalStepResult[] = [];
  let usage: ProposalAiUsage = emptyUsage(options.model ?? getProposalAiModel());

  for (const step of steps) {
    options.onProgress?.(`[proposalDraft] etapa ${step.index + 1}/${steps.length}: ${step.label}`);

    const result = await runProposalDraftStep(input, step, options);
    results.push(result);
    usage = mergeUsage(usage, result.usage);

    // Etapa que não produziu nada é falha dura: seguir adiante só entregaria um
    // rascunho com buraco silencioso.
    if (Object.keys(result.partial).length === 0) {
      const reason =
        result.violations[0]?.message ?? 'a etapa não devolveu conteúdo utilizável.';
      return {
        success: false,
        error: `Falha na etapa "${step.label}": ${reason}`,
        steps: results,
      };
    }

    if (options.stepDelayMs && step.index < steps.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, options.stepDelayMs));
    }
  }

  return {
    success: true,
    draft: mergeStepResults(results),
    usage,
    steps: results,
    violations: results.flatMap((r) => r.violations),
  };
}

/** Reexportado para quem só precisa achatar um bloco (log, diff, busca). */
export { flattenRichBlock };
