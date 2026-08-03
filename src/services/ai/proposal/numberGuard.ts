/**
 * GUARDRAIL DE NÚMERO — a razão de existir desta camada.
 *
 * A IA nunca emite quantitativo, valor monetário ou prazo. Ela recebe os
 * números fechados e escreve o texto técnico em volta. Este módulo é quem
 * verifica que ela obedeceu, porque prompt não é garantia.
 *
 * Erros reais que motivaram cada camada (propostas 287.1 Andora e 163.4 Maxif4,
 * ambas enviadas ao cliente com o defeito):
 *
 *   L1 número fora do universo → "1.500 metros" onde o orçamento diz 1.240
 *   L2 quantitativo divergente → número em posição de quantidade que não é fato
 *   L3 extenso divergente      → "05 (seis) transformadores"
 *   L4 aproximação incoerente  → "aproximadamente 61 postes" para valor exato
 *   L5 valor monetário         → qualquer "R$" na prosa
 *   L6 norma não listada       → código normativo inventado
 *   L7 placeholder             → "TEXTO DO SEU PARÁGRAFO"
 *
 * L1 é a rede de segurança larga: todo número escrito tem de existir em algum
 * lugar da ENTRADA (fatos, rótulos, normas, texto do template). L2 é a checagem
 * cirúrgica: número em posição de quantitativo tem de ser, exatamente, um fato.
 */

import type { ProposalActivityFact } from '@/types/proposal';
import type { ProposalGuardrailViolation, ProposalTechnicalReference } from './types';
import {
  acceptedWordFormsFor,
  deaccentLower,
  extractNumbersFromText,
  looksLikeNumberWords,
  parseNumericToken,
} from './ptNumbers';
import { APPROXIMATION_MARKERS, collectFactUnitAliases, normalizeUnitToken } from './factsSerializer';

// ---------------------------------------------------------------------------
// Universo permitido
// ---------------------------------------------------------------------------

/**
 * Universo de números que o texto pode conter, colhido da própria entrada.
 *
 * A instrução original é "se o texto contiver um número que não existe em
 * `facts`, rejeite". Na prática o texto legítimo também cita números que vêm de
 * outros campos da entrada: "13,8 kV" e "155,4 MCM" estão dentro do *rótulo* do
 * fato, "NT.00004" está na lista de normas, "0,6/1 kV" está no nome do material.
 * Colher de toda a entrada mantém a regra ("número vem do sistema") sem gerar
 * reprovação falsa em texto correto.
 */
export interface AllowedNumberUniverse {
  /** Todo número presente em qualquer campo da entrada. */
  values: Set<number>;
  /** Quantidades dos fatos — o subconjunto exigido em posição de quantitativo. */
  factQuantities: Set<number>;
  /** Unidades (e sinônimos) que caracterizam posição de quantitativo. */
  quantityUnits: Set<string>;
  /** Códigos de norma citáveis, normalizados. */
  normCodes: Set<string>;
}

/** Tolerância para comparar quantidade decimal — evita ruído de ponto flutuante. */
const NUMERIC_EPSILON = 1e-6;

function hasValue(set: Set<number>, value: number): boolean {
  if (set.has(value)) return true;
  for (const candidate of set) {
    if (Math.abs(candidate - value) < NUMERIC_EPSILON) return true;
  }
  return false;
}

/** Percorre a entrada inteira colhendo números de strings e de campos numéricos. */
function harvestNumbers(node: unknown, into: Set<number>): void {
  if (node === null || node === undefined) return;

  if (typeof node === 'number') {
    if (Number.isFinite(node)) into.add(node);
    return;
  }

  if (typeof node === 'string') {
    for (const found of extractNumbersFromText(node)) into.add(found.value);
    return;
  }

  if (Array.isArray(node)) {
    for (const item of node) harvestNumbers(item, into);
    return;
  }

  if (typeof node === 'object') {
    for (const value of Object.values(node as Record<string, unknown>)) {
      harvestNumbers(value, into);
    }
  }
}

export interface BuildUniverseOptions {
  /** Qualquer objeto da entrada. Percorrido em profundidade. */
  sources: unknown[];
  facts: ProposalActivityFact[];
  references: ProposalTechnicalReference[];
}

export function buildAllowedNumberUniverse(
  options: BuildUniverseOptions
): AllowedNumberUniverse {
  const values = new Set<number>();
  harvestNumbers(options.sources, values);

  const factQuantities = new Set<number>();
  for (const fact of options.facts) {
    factQuantities.add(fact.quantity);
    values.add(fact.quantity);
  }

  const normCodes = new Set<string>();
  for (const ref of options.references) {
    normCodes.add(normalizeNormCode(ref.code));
  }

  return {
    values,
    factQuantities,
    quantityUnits: collectFactUnitAliases(options.facts),
    normCodes,
  };
}

// ---------------------------------------------------------------------------
// L5 — valor monetário
// ---------------------------------------------------------------------------

const MONEY_PATTERN = /R\$|\breais\b|\bBRL\b/gi;

// ---------------------------------------------------------------------------
// L6 — normas
// ---------------------------------------------------------------------------

/**
 * Casa os formatos que aparecem nas duas propostas: NT.00004, NT.023, GED-4101,
 * GED-11, NBR 5410, NBR 14039, NR-10.
 */
const NORM_CODE_PATTERN =
  /\b(?:NT|GED|NBR|NR|ABNT\s+NBR|IEC|ISO)[\s.\-]?\d[\d.\-/]*/gi;

export function normalizeNormCode(code: string): string {
  return deaccentLower(code).replace(/[^a-z0-9]/g, '');
}

// ---------------------------------------------------------------------------
// L7 — placeholders
// ---------------------------------------------------------------------------

/**
 * "TEXTO DO SEU PARÁGRAFO" saiu impresso na página 9 da Maxif4. O resto são
 * marcas típicas de rascunho que jamais podem chegar ao cliente.
 */
const PLACEHOLDER_PATTERNS: { pattern: RegExp; label: string }[] = [
  { pattern: /TEXTO\s+DO\s+SEU\s+PAR[ÁA]GRAFO/gi, label: 'placeholder de template' },
  { pattern: /LOREM\s+IPSUM/gi, label: 'lorem ipsum' },
  { pattern: /\[\s*(?:INSERIR|PREENCHER|TODO|XXX+)[^\]]*\]/gi, label: 'marcador de preenchimento' },
  { pattern: /\{\{[^}]*\}\}/g, label: 'variável de template não substituída' },
  { pattern: /\bTODO\b\s*:/g, label: 'TODO' },
  { pattern: /\bX{3,}\b/g, label: 'sequência XXX' },
  { pattern: /\.\.\.\s*$/g, label: 'reticências de texto truncado' },
];

// ---------------------------------------------------------------------------
// L2 — posição de quantitativo
// ---------------------------------------------------------------------------

/**
 * Número seguido, opcionalmente, de um extenso entre parênteses e depois de uma
 * palavra. Ex.: "61 (sessenta e um) postes", "1.240 metros", "13,8 kV".
 */
const QUANTITY_CONTEXT_PATTERN =
  /(\d+(?:[.,]\d+)*)\s*(?:\(([^)]{1,80})\)\s*)?([A-Za-zÀ-ÿ²³]+)/g;

// ---------------------------------------------------------------------------
// Verificação
// ---------------------------------------------------------------------------

export interface CheckTextOptions {
  path: string;
  universe: AllowedNumberUniverse;
  facts: ProposalActivityFact[];
  /** `false` desliga L1 e L2 (só depuração de prompt). */
  strict: boolean;
}

/**
 * Quebra em orações para avaliar o marcador de aproximação junto do número.
 *
 * O ponto só encerra oração quando vem seguido de espaço ou de fim de texto.
 * Sem essa condição, "1.240 metros" viraria duas orações e o número se perderia
 * do "aproximadamente" que o qualifica — e "NT.00004" viraria três.
 */
function splitSentences(text: string): { text: string; offset: number }[] {
  const out: { text: string; offset: number }[] = [];
  let start = 0;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const isHardBreak = ch === ';' || ch === '\n';
    const isPeriodLike = ch === '.' || ch === '!' || ch === '?';

    if (!isHardBreak && !isPeriodLike) continue;

    if (isPeriodLike) {
      const next = text[i + 1];
      if (next !== undefined && !/\s/.test(next)) continue;
    }

    out.push({ text: text.slice(start, i + 1), offset: start });
    start = i + 1;
  }

  if (start < text.length) out.push({ text: text.slice(start), offset: start });
  return out;
}

function excerptAround(text: string, index: number, radius = 60): string {
  const from = Math.max(0, index - radius);
  const to = Math.min(text.length, index + radius);
  return `${from > 0 ? '…' : ''}${text.slice(from, to).trim()}${to < text.length ? '…' : ''}`;
}

function hasApproximationMarker(text: string): boolean {
  const normalized = deaccentLower(text);
  return APPROXIMATION_MARKERS.some((marker) => normalized.includes(deaccentLower(marker)));
}

/**
 * Roda as sete camadas sobre um trecho de texto gerado.
 * Retorna todas as violações encontradas — o prompt de correção usa a lista
 * inteira, para não gastar uma retentativa por defeito.
 */
export function checkGeneratedText(
  text: string,
  options: CheckTextOptions
): ProposalGuardrailViolation[] {
  const violations: ProposalGuardrailViolation[] = [];
  const { path, universe, facts, strict } = options;

  if (!text || !text.trim()) {
    violations.push({
      kind: 'campo_ausente',
      path,
      message: 'Texto vazio.',
      excerpt: null,
    });
    return violations;
  }

  // L7 — placeholder
  for (const { pattern, label } of PLACEHOLDER_PATTERNS) {
    pattern.lastIndex = 0;
    const match = pattern.exec(text);
    if (match) {
      violations.push({
        kind: 'placeholder',
        path,
        message: `Texto contém ${label}: "${match[0].trim()}".`,
        excerpt: excerptAround(text, match.index),
      });
    }
  }

  // L5 — valor monetário
  MONEY_PATTERN.lastIndex = 0;
  const money = MONEY_PATTERN.exec(text);
  if (money) {
    violations.push({
      kind: 'valor_monetario',
      path,
      message:
        'Texto contém valor monetário. A prosa nunca cita preço — os valores são renderizados nas tabelas.',
      excerpt: excerptAround(text, money.index),
    });
  }

  // L6 — norma não listada
  NORM_CODE_PATTERN.lastIndex = 0;
  for (const match of text.matchAll(NORM_CODE_PATTERN)) {
    const normalized = normalizeNormCode(match[0]);
    if (universe.normCodes.size === 0 || !universe.normCodes.has(normalized)) {
      violations.push({
        kind: 'norma_nao_listada',
        path,
        message: `Norma "${match[0].trim()}" não está na lista de referências liberadas.`,
        excerpt: excerptAround(text, match.index ?? 0),
      });
    }
  }

  // L3 — concordância entre algarismo e extenso
  for (const match of text.matchAll(/(\d+(?:[.,]\d+)*)\s*\(([^)]{1,80})\)/g)) {
    const [, digitsRaw, inside] = match;
    if (!looksLikeNumberWords(inside)) continue;

    const value = parseNumericToken(digitsRaw);
    if (value === null || !Number.isInteger(value)) continue;

    const expected = acceptedWordFormsFor(value);
    const written = deaccentLower(inside).replace(/\s+/g, ' ').trim();

    if (!expected.includes(written)) {
      violations.push({
        kind: 'extenso_divergente',
        path,
        message: `"${digitsRaw} (${inside.trim()})" — o extenso não corresponde ao algarismo. Correto: "${digitsRaw} (${expected[0]})".`,
        excerpt: excerptAround(text, match.index ?? 0),
      });
    }
  }

  if (!strict) return violations;

  // L1 — número fora do universo da entrada
  for (const found of extractNumbersFromText(text)) {
    if (hasValue(universe.values, found.value)) continue;
    violations.push({
      kind: 'numero_fora_dos_fatos',
      path,
      message: `O número "${found.raw}" não existe em nenhum dado recebido. Todo número do texto tem de vir dos DADOS FECHADOS ou das referências.`,
      excerpt: excerptAround(text, found.index),
    });
  }

  // L2 — número em posição de quantitativo tem de ser um fato
  for (const match of text.matchAll(QUANTITY_CONTEXT_PATTERN)) {
    const [, digitsRaw, parenthetical, word] = match;
    const value = parseNumericToken(digitsRaw);
    if (value === null) continue;

    const isQuantityPosition =
      universe.quantityUnits.has(normalizeUnitToken(word)) ||
      (parenthetical !== undefined && looksLikeNumberWords(parenthetical));

    if (!isQuantityPosition) continue;
    if (hasValue(universe.factQuantities, value)) continue;

    violations.push({
      kind: 'quantitativo_divergente',
      path,
      message: `"${digitsRaw} ${word}" está em posição de quantitativo, mas ${digitsRaw} não é uma quantidade dos DADOS FECHADOS.`,
      excerpt: excerptAround(text, match.index ?? 0),
    });
  }

  // L4 — coerência da aproximação
  const approximateQuantities = new Set(
    facts.filter((f) => f.isApproximate).map((f) => f.quantity)
  );
  const exactQuantities = new Set(
    facts.filter((f) => !f.isApproximate).map((f) => f.quantity)
  );

  for (const sentence of splitSentences(text)) {
    const numbers = extractNumbersFromText(sentence.text);
    if (numbers.length === 0) continue;

    const marked = hasApproximationMarker(sentence.text);
    const citesApproximate = numbers.some((n) => hasValue(approximateQuantities, n.value));
    const citesExact = numbers.some((n) => hasValue(exactQuantities, n.value));

    if (citesApproximate && !marked) {
      violations.push({
        kind: 'aproximacao_incoerente',
        path,
        message:
          'A oração cita um quantitativo ESTIMADO sem dizer "aproximadamente".',
        excerpt: sentence.text.trim(),
      });
    }

    // Só acusa quando a oração é inequivocamente sobre valor exato: se houver
    // também um estimado ali, o marcador pode ser legitimamente dele.
    if (citesExact && !citesApproximate && marked) {
      violations.push({
        kind: 'aproximacao_incoerente',
        path,
        message:
          'A oração cita um quantitativo EXATO como se fosse estimativa. Remova "aproximadamente" / "cerca de".',
        excerpt: sentence.text.trim(),
      });
    }
  }

  return violations;
}

/** Aplica `checkGeneratedText` a vários trechos, preservando o caminho de cada um. */
export function checkTextFields(
  fields: { path: string; text: string | null }[],
  options: Omit<CheckTextOptions, 'path'>
): ProposalGuardrailViolation[] {
  const violations: ProposalGuardrailViolation[] = [];
  for (const field of fields) {
    if (field.text === null) continue;
    violations.push(...checkGeneratedText(field.text, { ...options, path: field.path }));
  }
  return violations;
}

// ---------------------------------------------------------------------------
// Refinamento — preservação dos números do bloco original
// ---------------------------------------------------------------------------

function numberMultiset(text: string): Map<number, number> {
  const counts = new Map<number, number>();
  for (const found of extractNumbersFromText(text)) {
    counts.set(found.value, (counts.get(found.value) ?? 0) + 1);
  }
  return counts;
}

/**
 * Compara os números de antes e depois de um refinamento.
 *
 * `allowDrop` existe porque "encurtar" pode legitimamente eliminar uma frase
 * inteira — e com ela o número que estava nela. O que nenhuma ação pode fazer é
 * *introduzir* número novo ou trocar um número por outro.
 */
export function checkNumbersPreserved(
  originalText: string,
  refinedText: string,
  options: { path: string; allowDrop: boolean }
): ProposalGuardrailViolation[] {
  const before = numberMultiset(originalText);
  const after = numberMultiset(refinedText);
  const violations: ProposalGuardrailViolation[] = [];

  for (const [value, count] of after) {
    const originalCount = before.get(value) ?? 0;
    if (count > originalCount) {
      violations.push({
        kind: 'numero_fora_dos_fatos',
        path: options.path,
        message: `O refinamento introduziu o número ${value}, que não estava no bloco original.`,
        excerpt: null,
      });
    }
  }

  if (!options.allowDrop) {
    for (const [value, count] of before) {
      const refinedCount = after.get(value) ?? 0;
      if (refinedCount < count) {
        violations.push({
          kind: 'quantitativo_divergente',
          path: options.path,
          message: `O refinamento perdeu o número ${value}, que precisa ser preservado nesta ação.`,
          excerpt: null,
        });
      }
    }
  }

  return violations;
}

/** Resumo das violações formatado para entrar no prompt de correção. */
export function formatViolationsForPrompt(
  violations: ProposalGuardrailViolation[]
): string {
  return violations
    .map((v, i) => {
      const excerpt = v.excerpt ? `\n   trecho: "${v.excerpt}"` : '';
      return `${i + 1}. [${v.kind}] em ${v.path}: ${v.message}${excerpt}`;
    })
    .join('\n');
}
