/**
 * Sugestão de mídia por tag.
 *
 * Dada uma seção da proposta, indica quais tags da biblioteca de mídia combinam.
 * É sugestão de TAG — nenhuma imagem é enviada ao modelo e nenhuma afirmação é
 * feita sobre o conteúdo de foto alguma. O sistema é quem filtra a biblioteca
 * pelas tags devolvidas.
 *
 * Roda no modelo leve: classificar contra vocabulário fechado não justifica o
 * pro, e a ação é interativa (o usuário está esperando na tela).
 */

import { PROPOSAL_MEDIA_TAGS_SYSTEM, buildMediaTagsUserPrompt } from '../prompts';
import { getProposalAiLightModel } from './config';
import { generateJson } from './geminiClient';
import { parseMediaTagsPayload } from './parseStepPayload';
import { buildMediaTagsSchema } from './schemas';
import type {
  ProposalMediaTagResult,
  ProposalMediaTagSuggestionInput,
} from './types';

export interface SuggestMediaTagsOptions {
  model?: string;
  onProgress?: (message: string) => void;
}

export async function suggestProposalMediaTags(
  input: ProposalMediaTagSuggestionInput,
  options: SuggestMediaTagsOptions = {}
): Promise<ProposalMediaTagResult> {
  const tags = Array.from(new Set(input.availableTags.map((t) => t.trim()).filter(Boolean)));

  if (tags.length === 0) {
    return {
      success: false,
      error: 'Biblioteca de mídia sem tags cadastradas: não há vocabulário para sugerir.',
    };
  }

  const model = options.model ?? getProposalAiLightModel();
  const maxTags = input.maxTags ?? 6;

  const result = await generateJson({
    model,
    systemInstruction: PROPOSAL_MEDIA_TAGS_SYSTEM,
    turns: [{ role: 'user', text: buildMediaTagsUserPrompt({ ...input, availableTags: tags }) }],
    schema: buildMediaTagsSchema(tags),
    // Classificação quer determinismo, não variedade.
    temperature: 0.1,
    maxOutputTokens: 2048,
  });

  if (!result.success) {
    return { success: false, error: result.error };
  }

  // Terceira barreira contra tag inventada, depois do prompt e do enum do
  // schema — mesmo cinto e suspensório de `validateSuggestions` no match
  // semântico, que também revalida IDs que o schema já deveria ter garantido.
  const suggestions = parseMediaTagsPayload(result.data, tags)
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, maxTags);

  options.onProgress?.(
    `[mediaTags] ${input.sectionKey}: ${suggestions.length} tag(s) sugerida(s) de ${tags.length} disponíveis`
  );

  return { success: true, suggestions, usage: result.usage };
}
