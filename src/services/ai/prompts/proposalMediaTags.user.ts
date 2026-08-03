/**
 * Builder do user prompt da sugestão de mídia por tag.
 */

import type { ProposalMediaTagSuggestionInput } from '../proposal/types';

export function buildMediaTagsUserPrompt(
  input: ProposalMediaTagSuggestionInput
): string {
  const maxTags = input.maxTags ?? 6;

  return [
    [
      '## SEÇÃO',
      `Chave:   ${input.sectionKey}`,
      `Título:  ${input.sectionTitle}`,
      `Resumo:  ${input.sectionSummary.trim()}`,
    ].join('\n'),
    [
      '## OBRA',
      `Tipo:           ${input.project.workType}`,
      `Concessionária: ${input.project.utility}`,
    ].join('\n'),
    `## VOCABULÁRIO DE TAGS DA BIBLIOTECA (lista fechada)\n${input.availableTags
      .map((tag) => `- ${tag}`)
      .join('\n')}`,
    `## TAREFA\nIndique até ${maxTags} tags desta lista que combinam com a seção, ordenadas da mais adequada para a menos adequada.`,
  ].join('\n\n');
}
