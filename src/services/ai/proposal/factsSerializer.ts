/**
 * Serialização dos quantitativos fechados para dentro do prompt.
 *
 * Este é o ponto onde a regra de ouro deixa de ser recomendação e vira
 * mecânica: o algarismo E o extenso saem daqui prontos, no formato exato em que
 * devem aparecer no texto. A IA copia; não escreve número.
 *
 * O erro real "05 (seis) transformadores" só é possível quando o modelo redige
 * o extenso. Aqui ele recebe `05 (cinco)` mastigado.
 */

import type { ProposalActivityFact } from '@/types/proposal';
import {
  deaccentLower,
  formatIntegerPtBr,
  formatQuantityPtBr,
  integerToPtBrWords,
} from './ptNumbers';

/** Marcadores que o texto deve conter quando o fato é estimativa. */
export const APPROXIMATION_MARKERS = [
  'aproximadamente',
  'cerca de',
  'estimad',
  'em torno de',
] as const;

/**
 * Unidades tratadas como "posição de quantitativo": um número imediatamente
 * seguido por uma delas está afirmando uma quantidade, e por isso precisa bater
 * exatamente com um fato. Sinônimos e plurais são resolvidos por `unitAliases`.
 */
const UNIT_ALIAS_GROUPS: string[][] = [
  ['m', 'metro', 'metros', 'ml', 'mts'],
  ['km', 'quilometro', 'quilometros'],
  ['un', 'und', 'unid', 'unidade', 'unidades', 'pc', 'pca', 'peca', 'pecas'],
  ['cj', 'conjunto', 'conjuntos'],
  ['pt', 'ponto', 'pontos'],
  ['lote', 'lotes'],
  ['parcela', 'parcelas'],
  ['vb', 'verba'],
  ['m2', 'm²'],
  ['m3', 'm³'],
];

/** Todas as grafias equivalentes de uma unidade, normalizadas. */
export function unitAliases(unit: string): string[] {
  const normalized = normalizeUnitToken(unit);
  const group = UNIT_ALIAS_GROUPS.find((g) => g.map(normalizeUnitToken).includes(normalized));
  if (group) return group.map(normalizeUnitToken);
  return [normalized];
}

/** Minúscula, sem acento, sem pontuação, sem plural trivial. */
export function normalizeUnitToken(raw: string): string {
  const base = deaccentLower(raw).replace(/[^a-z0-9²³]/g, '');
  if (base.length > 2 && base.endsWith('s')) return base.slice(0, -1);
  return base;
}

/** Todas as unidades (e sinônimos) que aparecem num conjunto de fatos. */
export function collectFactUnitAliases(facts: ProposalActivityFact[]): Set<string> {
  const out = new Set<string>();
  for (const fact of facts) {
    for (const alias of unitAliases(fact.unit)) out.add(alias);
  }
  return out;
}

/**
 * Como a quantidade deve aparecer no texto.
 *
 * Inteiro vira o par `61 (sessenta e um)`, com as duas flexões oferecidas
 * quando divergem — o modelo escolhe a que concorda com o substantivo, e o
 * validador aceita ambas. Decimal fica só no algarismo: "155,4 (cento e
 * cinquenta e cinco vírgula quatro)" não é português de proposta.
 */
export function formatFactQuantityForPrompt(fact: ProposalActivityFact): string {
  if (!Number.isInteger(fact.quantity)) {
    return `${formatQuantityPtBr(fact.quantity)} ${fact.unit} (decimal — escreva só o algarismo, sem extenso)`;
  }

  const digits = formatIntegerPtBr(fact.quantity);
  const masculine = integerToPtBrWords(fact.quantity, 'm');
  const feminine = integerToPtBrWords(fact.quantity, 'f');

  const words =
    masculine === feminine ? masculine : `${masculine}  |  fem.: ${feminine}`;

  return `${digits} (${words}) ${fact.unit}`;
}

/**
 * Bloco DADOS FECHADOS de um grupo de atividades. Vai literalmente no prompt.
 */
export function formatFactsBlock(facts: ProposalActivityFact[]): string {
  if (facts.length === 0) {
    return '(nenhum quantitativo para este grupo — não escreva número algum)';
  }

  return facts
    .map((fact, i) => {
      const quantity = formatFactQuantityForPrompt(fact);
      const precision = fact.isApproximate
        ? 'ESTIMADO → o texto TEM de dizer "aproximadamente" antes do número'
        : 'EXATO → NÃO use "aproximadamente", "cerca de" nem "em torno de"';
      return [
        `${i + 1}. ${fact.label}`,
        `   quantidade: ${quantity}`,
        `   precisão:   ${precision}`,
      ].join('\n');
    })
    .join('\n');
}

/** Bloco de normas citáveis. Fora desta lista, o guardrail reprova. */
export function formatReferencesBlock(
  references: { code: string; issuer: string; subject: string; revision: string | null }[]
): string {
  if (references.length === 0) {
    return '(nenhuma norma liberada — não cite código de norma neste texto)';
  }

  return references
    .map((ref) => {
      const revision = ref.revision ? ` — ${ref.revision}` : '';
      return `- ${ref.code}${revision} (${ref.issuer}): ${ref.subject}`;
    })
    .join('\n');
}

/** Lista simples, um item por linha, para blocos de template. */
export function formatBulletBlock(items: string[], emptyLabel: string): string {
  if (items.length === 0) return `(${emptyLabel})`;
  return items.map((item) => `- ${item}`).join('\n');
}
