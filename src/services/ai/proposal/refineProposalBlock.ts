/**
 * Ações de refinamento sobre um `ProposalRichBlock` já existente.
 *
 * Cinco ações: mais formal, mais direto, encurtar, expandir, corrigir português.
 * Todas com a mesma invariante — os números do bloco original são preservados.
 *
 * Refinar é a operação mais perigosa da camada. Gerar do zero tem os DADOS
 * FECHADOS como âncora; reescrever tem só o texto anterior, e um modelo pedindo
 * "mais formal" facilmente troca "61 postes" por "mais de 60 postes". Por isso a
 * verificação aqui não é a mesma do rascunho: é uma comparação direta entre o
 * multiconjunto de números antes e depois.
 */

import type { ProposalRichBlock } from '@/types/proposal';
import { buildRefineRetryPrompt, buildRefineUserPrompt, getRefineSystemPrompt } from '../prompts';
import { getProposalAiModel, getProposalGuardrailRetry } from './config';
import { emptyUsage, generateJson, mergeUsage } from './geminiClient';
import {
  buildAllowedNumberUniverse,
  checkNumbersPreserved,
  checkTextFields,
  formatViolationsForPrompt,
} from './numberGuard';
import { flattenRichBlock, parseRichBlock } from './parseStepPayload';
import { REFINE_BLOCK_SCHEMA } from './schemas';
import type {
  ProposalGuardrailViolation,
  ProposalRefineAction,
  ProposalRefineInput,
  ProposalRefineResult,
} from './types';

/**
 * Ações que podem legitimamente perder um número.
 *
 * Encurtar elimina frases, e uma frase eliminada leva embora o quantitativo que
 * estava nela — isso é aceitável. Introduzir número novo ou trocar um número por
 * outro não é aceitável em ação nenhuma, e essa metade da regra vale sempre.
 */
const ACTIONS_ALLOWING_NUMBER_DROP: ReadonlySet<ProposalRefineAction> = new Set([
  'encurtar',
]);

function blockTextFields(
  block: ProposalRichBlock
): { path: string; text: string | null }[] {
  const fields: { path: string; text: string | null }[] = [];
  if (block.heading) fields.push({ path: 'block.heading', text: block.heading });
  block.paragraphs.forEach((p, i) => fields.push({ path: `block.paragraphs[${i}]`, text: p }));
  block.bullets.forEach((b, i) => fields.push({ path: `block.bullets[${i}]`, text: b }));
  return fields;
}

export interface RefineOptions {
  model?: string;
  guardrailRetry?: number;
  onProgress?: (message: string) => void;
}

export async function refineProposalBlock(
  input: ProposalRefineInput,
  options: RefineOptions = {}
): Promise<ProposalRefineResult> {
  const originalText = flattenRichBlock(input.block);
  if (!originalText.trim()) {
    return {
      success: false,
      error: 'Bloco vazio: não há texto para refinar.',
      violations: [],
    };
  }

  const model = options.model ?? getProposalAiModel();
  const maxRetries = options.guardrailRetry ?? getProposalGuardrailRetry();
  const allowDrop = ACTIONS_ALLOWING_NUMBER_DROP.has(input.action);

  // O universo de números do refinamento é o próprio bloco original mais os
  // fatos e normas do contexto — nada além disso pode aparecer no resultado.
  const universe = buildAllowedNumberUniverse({
    sources: [input.block, input.facts ?? [], input.technicalReferences ?? []],
    facts: input.facts ?? [],
    references: input.technicalReferences ?? [],
  });

  const turns: { role: 'user' | 'model'; text: string }[] = [
    { role: 'user', text: buildRefineUserPrompt(input) },
  ];

  let usage = emptyUsage(model);
  let lastBlock: ProposalRichBlock | null = null;
  let lastViolations: ProposalGuardrailViolation[] = [];

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const result = await generateJson({
      model,
      systemInstruction: getRefineSystemPrompt(input.action),
      turns,
      schema: REFINE_BLOCK_SCHEMA,
    });

    usage = mergeUsage(usage, result.usage);

    if (!result.success) {
      return { success: false, error: result.error, violations: lastViolations };
    }

    const refined = parseRichBlock(result.data);

    if (!refined) {
      lastViolations = [
        {
          kind: 'campo_ausente',
          path: 'block',
          message: 'A IA devolveu um bloco vazio.',
          excerpt: null,
        },
      ];
    } else {
      lastBlock = refined;
      const refinedText = flattenRichBlock(refined);

      lastViolations = [
        ...checkNumbersPreserved(originalText, refinedText, {
          path: 'block',
          allowDrop,
        }),
        ...checkTextFields(blockTextFields(refined), {
          universe,
          facts: input.facts ?? [],
          // L1 e L2 precisam de um universo de fatos para julgar quantitativo.
          // No refinamento quem faz esse papel é `checkNumbersPreserved`, que é
          // mais estrito: compara número a número contra o bloco original.
          // Ligar L2 sem fatos informados acusaria como inventado todo
          // quantitativo que já estava legitimamente no texto. As demais
          // camadas — extenso, dinheiro, norma e placeholder — rodam sempre,
          // porque não dependem do universo.
          strict: (input.facts?.length ?? 0) > 0,
        }),
      ];
    }

    if (lastViolations.length === 0 && lastBlock) {
      options.onProgress?.(
        `[refineBlock] ${input.action}: ok em ${attempt + 1} tentativa(s)`
      );
      return { success: true, block: lastBlock, usage, violations: [] };
    }

    if (attempt < maxRetries) {
      options.onProgress?.(
        `[refineBlock] ${input.action}: ${lastViolations.length} violação(ões), reenviando`
      );
      turns.push({ role: 'model', text: result.raw });
      turns.push({
        role: 'user',
        text: buildRefineRetryPrompt(formatViolationsForPrompt(lastViolations)),
      });
    }
  }

  // Refinamento é opcional e reversível: se não deu para preservar os números,
  // devolver o texto alterado seria pior que não refinar. O bloco original fica.
  return {
    success: false,
    error:
      'O refinamento não preservou os números do bloco original após as retentativas. O bloco foi mantido como estava.',
    violations: lastViolations,
  };
}

/** Rótulos das ações, para a UI de outra frente não redigir os seus próprios. */
export const PROPOSAL_REFINE_ACTION_LABELS: Record<ProposalRefineAction, string> = {
  formal: 'Reescrever mais formal',
  direto: 'Reescrever mais direto',
  encurtar: 'Encurtar',
  expandir: 'Expandir',
  corrigir_portugues: 'Corrigir português',
};
