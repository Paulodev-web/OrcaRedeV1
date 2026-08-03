/**
 * Builder do user prompt das ações de refinamento por bloco.
 */

import { formatFactsBlock, formatReferencesBlock } from '../proposal/factsSerializer';
import type { ProposalRefineInput } from '../proposal/types';

/** Rótulo humano das seções, para o modelo saber o registro que a peça espera. */
const SECTION_LABELS: Record<string, string> = {
  capa: 'Capa',
  quem_somos: 'Quem Somos / Identidade / Compromisso',
  seu_projeto: 'Seu Projeto',
  localizacao: 'Localização da Obra',
  fotos_obra: 'Fotos Executivas',
  descricao_atividades: 'Descrição das Atividades',
  escopo_materiais: 'Escopo dos Materiais Subdivididos',
  curva_abc: 'Curva de Preços dos Materiais',
  condicoes_faturamento: 'Condições de Faturamento de Materiais',
  valores_por_segmento: 'Valores Globais por Segmento',
  valores_globais: 'Valores Globais',
  investimento_por_unidade: 'Investimento por Unidade',
  condicoes_pagamento: 'Condições de Pagamento',
  cronograma: 'Cronograma Executivo',
  matriz_responsabilidade: 'Matriz de Responsabilidade',
  consideracoes_finais: 'Considerações Finais',
  diferencial_orcarede: 'Diferencial Tecnológico OrçaRede',
  termo_aceite: 'Termo de Aceite',
  contato: 'Contato',
};

export function buildRefineUserPrompt(input: ProposalRefineInput): string {
  const p = input.project;

  const parts: string[] = [
    [
      '## CONTEXTO',
      `Seção:          ${SECTION_LABELS[input.sectionKey] ?? input.sectionKey}`,
      `Cliente:        ${p.clientName}`,
      `Cidade:         ${p.city} / ${p.state}`,
      `Tipo de obra:   ${p.workType}`,
      `Concessionária: ${p.utility}`,
    ].join('\n'),
  ];

  if (input.facts && input.facts.length > 0) {
    parts.push(
      `## DADOS FECHADOS — quantitativos que este bloco pode citar\n${formatFactsBlock(input.facts)}`
    );
  }

  if (input.technicalReferences && input.technicalReferences.length > 0) {
    parts.push(
      `## REFERÊNCIAS NORMATIVAS (lista fechada)\n${formatReferencesBlock(input.technicalReferences)}`
    );
  }

  parts.push(`## BLOCO ORIGINAL\n${JSON.stringify(input.block, null, 2)}`);
  parts.push('## TAREFA\nDevolva o bloco reescrito conforme a ação definida nas instruções.');

  return parts.join('\n\n');
}

/** Retentativa quando a preservação de números falhou. */
export function buildRefineRetryPrompt(violationsReport: string): string {
  return `A reescrita anterior foi REPROVADA: ela alterou os números do bloco.

Violações:
${violationsReport}

Refaça a reescrita. Os números do BLOCO ORIGINAL são intocáveis: mesmo
algarismo, mesmo extenso, qualificando exatamente a mesma coisa. Não introduza
número que não estivesse no original.`;
}
