/**
 * Builders do user prompt do rascunho estruturado.
 *
 * Separados do system prompt de propósito: o system carrega a instrução, que é
 * estável e versionada; o user carrega os dados, que mudam a cada proposta.
 * Além de deixar o diff legível, isso permite ao Gemini reaproveitar o system
 * entre as etapas encadeadas.
 *
 * Nenhum builder aqui formata número por conta própria — a serialização dos
 * quantitativos (algarismo + extenso pronto) é de `factsSerializer.ts`, o mesmo
 * módulo cujas regras o guardrail verifica depois.
 */

import {
  formatBulletBlock,
  formatFactsBlock,
  formatReferencesBlock,
} from '../proposal/factsSerializer';
import type {
  ProposalActivityGroupInput,
  ProposalDraftInput,
} from '../proposal/types';

// ---------------------------------------------------------------------------
// Blocos reutilizados entre etapas
// ---------------------------------------------------------------------------

function projectBlock(input: ProposalDraftInput): string {
  const p = input.project;
  const lines = [
    `Cliente:            ${p.clientName}`,
    `Cidade:             ${p.city} / ${p.state}`,
    `Tipo de obra:       ${p.workType}`,
    `Concessionária:     ${p.utility}`,
    `Rótulo de escopo:   ${p.scopeLabel}`,
  ];

  if (p.developmentName) lines.push(`Empreendimento:     ${p.developmentName}`);
  if (p.environmentConstraints) {
    lines.push(`Condicionante:      ${p.environmentConstraints}`);
  }
  if (p.authorNotes) lines.push(`Notas do autor:     ${p.authorNotes}`);

  return `## PROJETO\n${lines.join('\n')}`;
}

function referencesBlock(input: ProposalDraftInput): string {
  return `## REFERÊNCIAS NORMATIVAS (lista fechada — só estas podem ser citadas)\n${formatReferencesBlock(
    input.technicalReferences
  )}`;
}

function segmentScopeBlock(input: ProposalDraftInput): string {
  const groups = input.activityGroups
    .map((g) => `- ${g.suggestedTitle}${g.segmentLabel ? ` (segmento: ${g.segmentLabel})` : ''}`)
    .join('\n');

  return `## GRUPOS DE ATIVIDADE DESTA OBRA (contexto, não escreva sobre eles agora)\n${groups}`;
}

function materialsBlock(input: ProposalDraftInput): string {
  if (input.materialSubgroups.length === 0) {
    return '## COMPOSIÇÃO DE MATERIAL\n(sem consolidado disponível)';
  }

  const rows = input.materialSubgroups
    .map((m) => `- ${m.subgroup}: ${m.itemCount} itens distintos`)
    .join('\n');

  return `## COMPOSIÇÃO DE MATERIAL POR SUBGRUPO (contexto — sem preço, de propósito)\n${rows}`;
}

// ---------------------------------------------------------------------------
// Etapa 1 — capa
// ---------------------------------------------------------------------------

export function buildCoverUserPrompt(input: ProposalDraftInput): string {
  return [
    projectBlock(input),
    segmentScopeBlock(input),
    '## TAREFA\nEscreva projectTitle e projectSubtitle da capa.',
  ].join('\n\n');
}

// ---------------------------------------------------------------------------
// Etapa 2 — institucional
// ---------------------------------------------------------------------------

export function buildInstitutionalUserPrompt(input: ProposalDraftInput): string {
  const company = input.company;

  return [
    projectBlock(input),
    [
      '## EMPRESA',
      `Razão social:  ${company.legalName}`,
      company.tradeName ? `Nome fantasia: ${company.tradeName}` : null,
      `CNPJ:          ${company.cnpj}`,
      `Endereço:      ${company.address}`,
    ]
      .filter(Boolean)
      .join('\n'),
    `## TEXTO INSTITUCIONAL DO TEMPLATE (fonte única — reescreva, não invente)\n${input.template.institutionalText.trim()}`,
    `## TEXTO DO DIFERENCIAL ORÇAREDE (fonte única para o bloco diferencialOrcaRede)\n${input.template.orcaRedeText.trim()}`,
    '## TAREFA\nEscreva os blocos quemSomos, identidade, compromisso e diferencialOrcaRede.',
  ].join('\n\n');
}

// ---------------------------------------------------------------------------
// Etapa 3 — grupo de atividades
// ---------------------------------------------------------------------------

export function buildActivityGroupUserPrompt(
  input: ProposalDraftInput,
  group: ProposalActivityGroupInput
): string {
  const noteBlock = group.mandatoryNote
    ? `## OBSERVAÇÃO OBRIGATÓRIA (redija em "note")\n${group.mandatoryNote.trim()}`
    : '## OBSERVAÇÃO OBRIGATÓRIA\n(nenhuma — devolva "note": null)';

  return [
    projectBlock(input),
    referencesBlock(input),
    [
      '## GRUPO A REDIGIR',
      `Título de partida: ${group.suggestedTitle}`,
      group.segmentLabel ? `Segmento de obra:  ${group.segmentLabel}` : null,
    ]
      .filter(Boolean)
      .join('\n'),
    `## DADOS FECHADOS — quantitativos deste grupo\n${formatFactsBlock(group.facts)}`,
    noteBlock,
    '## TAREFA\nEscreva title, intro, items e note deste grupo. Todo fato listado acima tem de aparecer em exatamente um item.',
  ].join('\n\n');
}

// ---------------------------------------------------------------------------
// Etapa 4 — comercial
// ---------------------------------------------------------------------------

export function buildCommercialUserPrompt(input: ProposalDraftInput): string {
  const c = input.commercial;

  const structure = [
    `Materiais faturados direto do fornecedor: ${c.materialsBilledDirectlyBySupplier ? 'sim' : 'não'}`,
    `Parcelamento incide apenas sobre o serviço: ${c.installmentsApplyToLaborOnly ? 'sim' : 'não'}`,
    `Há parcela de entrada / assinatura: ${c.hasDownPayment ? 'sim' : 'não'}`,
    c.unitsLabel ? `Unidade de investimento: ${c.unitsLabel}` : null,
  ]
    .filter(Boolean)
    .join('\n');

  return [
    projectBlock(input),
    `## ESTRUTURA COMERCIAL (forma, não valor — nenhuma cifra é enviada a você)\n${structure}`,
    `## DADOS FECHADOS — quantitativos comerciais\n${formatFactsBlock(c.commercialFacts)}`,
    `## TEXTO DE FATURAMENTO DO TEMPLATE (fonte única)\n${input.template.billingConditionsText.trim()}`,
    '## TAREFA\nEscreva billingConditions, scheduleFootnote e acceptanceClosingText.',
  ].join('\n\n');
}

// ---------------------------------------------------------------------------
// Etapa 5 — considerações finais
// ---------------------------------------------------------------------------

export function buildConsiderationsUserPrompt(input: ProposalDraftInput): string {
  return [
    projectBlock(input),
    referencesBlock(input),
    segmentScopeBlock(input),
    materialsBlock(input),
    `## RESPONSABILIDADES DA CONTRATADA (lista fechada — todos os itens, sem acrescentar)\n${formatBulletBlock(
      input.template.contractorResponsibilities,
      'nenhuma responsabilidade listada'
    )}`,
    `## ESCOPO NEGATIVO (lista fechada — todos os itens, sem acrescentar)\n${formatBulletBlock(
      input.template.exclusions,
      'nenhuma exclusão listada'
    )}`,
    '## TAREFA\nEscreva os seis blocos de finalConsiderations, na ordem definida.',
  ].join('\n\n');
}

// ---------------------------------------------------------------------------
// Retentativa informada pelo guardrail
// ---------------------------------------------------------------------------

/**
 * Prompt de correção. Não repete os dados: eles já estão no histórico da
 * conversa. Repete o defeito, que é o que precisa mudar.
 */
export function buildGuardrailRetryPrompt(violationsReport: string): string {
  return `A resposta anterior foi REPROVADA pela validação automática de números.

Violações encontradas:
${violationsReport}

Reescreva a resposta inteira corrigindo TODAS as violações acima, no mesmo
formato JSON. Regras que você quebrou e precisa reler antes de responder:

- todo número do texto tem de existir nos blocos de dados deste prompt;
- quantitativo tem de ser exatamente um valor de DADOS FECHADOS;
- "algarismo (extenso)" tem de vir copiado de DADOS FECHADOS;
- ESTIMADO exige "aproximadamente"; EXATO proíbe;
- nada de "R$", de prazo em dias ou de norma fora da lista;
- nenhum marcador de preenchimento.

Se você não consegue justificar um número pelos dados, remova o número e
reescreva a frase sem ele.`;
}
