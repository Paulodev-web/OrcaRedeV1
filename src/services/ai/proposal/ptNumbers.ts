/**
 * Números em português — formatação, extenso e parsing.
 *
 * Módulo folha: não importa nada. É a base do guardrail de quantitativo
 * (`numberGuard.ts`) e do serializador de fatos que alimenta o prompt
 * (`factsSerializer.ts`).
 *
 * Existe por causa de dois erros reais encontrados nas propostas enviadas ao
 * cliente:
 *   - "05 (seis) transformadores"  → algarismo divergindo do extenso
 *   - "53 (cinqüenta e três)"      → ortografia anterior ao Acordo de 1990
 *
 * A estratégia é não deixar a IA escrever o extenso: o sistema calcula o par
 * "algarismo (extenso)" e manda pronto no prompt; a IA copia; o validador
 * confere. Escrever o extenso deixa de ser tarefa de linguagem.
 */

// ---------------------------------------------------------------------------
// Léxico
// ---------------------------------------------------------------------------

/** U+0300..U+036F: marcas de combinação geradas pela decomposição NFD. */
const DIACRITICS_RE = new RegExp('[\u0300-\u036f]', 'g');

export function deaccentLower(text: string): string {
  return text
    .normalize('NFD')
    .replace(DIACRITICS_RE, '')
    .toLowerCase();
}

const UNITS_M = [
  'zero',
  'um',
  'dois',
  'três',
  'quatro',
  'cinco',
  'seis',
  'sete',
  'oito',
  'nove',
];

const UNITS_F = [
  'zero',
  'uma',
  'duas',
  'três',
  'quatro',
  'cinco',
  'seis',
  'sete',
  'oito',
  'nove',
];

const TEENS = [
  'dez',
  'onze',
  'doze',
  'treze',
  'catorze',
  'quinze',
  'dezesseis',
  'dezessete',
  'dezoito',
  'dezenove',
];

const TENS = [
  '',
  '',
  'vinte',
  'trinta',
  'quarenta',
  'cinquenta',
  'sessenta',
  'setenta',
  'oitenta',
  'noventa',
];

const HUNDREDS_M = [
  '',
  'cento',
  'duzentos',
  'trezentos',
  'quatrocentos',
  'quinhentos',
  'seiscentos',
  'setecentos',
  'oitocentos',
  'novecentos',
];

const HUNDREDS_F = [
  '',
  'cento',
  'duzentas',
  'trezentas',
  'quatrocentas',
  'quinhentas',
  'seiscentas',
  'setecentas',
  'oitocentas',
  'novecentas',
];

/** Todo token que pode compor um número por extenso. Usado para decidir se um
 * parêntese é um extenso (e portanto precisa concordar com o algarismo) ou
 * apenas um aposto qualquer. */
export const PT_NUMBER_WORD_TOKENS: ReadonlySet<string> = new Set(
  [
    ...UNITS_M,
    ...UNITS_F,
    ...TEENS,
    ...TENS.filter(Boolean),
    ...HUNDREDS_M.filter(Boolean),
    ...HUNDREDS_F.filter(Boolean),
    'cem',
    'mil',
    'milhao',
    'milhoes',
    'bilhao',
    'bilhoes',
    'e',
    // Grafias pré-Acordo que aparecem no acervo antigo — aceitas na leitura,
    // nunca produzidas na escrita.
    'catorze',
    'quatorze',
    'cinquenta',
  ].map(deaccentLower)
);

export type PtGender = 'm' | 'f';

// ---------------------------------------------------------------------------
// Extenso
// ---------------------------------------------------------------------------

function threeDigitsToWords(n: number, gender: PtGender): string {
  if (n === 100) return 'cem';

  const units = gender === 'f' ? UNITS_F : UNITS_M;
  const hundreds = gender === 'f' ? HUNDREDS_F : HUNDREDS_M;

  const h = Math.floor(n / 100);
  const rest = n % 100;
  const parts: string[] = [];

  if (h > 0) parts.push(hundreds[h]);

  if (rest > 0) {
    if (rest < 10) {
      parts.push(units[rest]);
    } else if (rest < 20) {
      parts.push(TEENS[rest - 10]);
    } else {
      const t = Math.floor(rest / 10);
      const u = rest % 10;
      parts.push(u > 0 ? `${TENS[t]} e ${units[u]}` : TENS[t]);
    }
  }

  return parts.join(' e ');
}

/**
 * Escreve um inteiro por extenso. `gender` flexiona 1, 2 e as centenas —
 * "181 (cento e oitenta e uma) caixas" vs "181 (cento e oitenta e um) postes".
 *
 * Suporta até 999.999.999, faixa muito acima de qualquer quantitativo de obra.
 */
export function integerToPtBrWords(value: number, gender: PtGender = 'm'): string {
  if (!Number.isInteger(value)) {
    throw new Error(`integerToPtBrWords espera inteiro, recebeu ${value}`);
  }
  if (value < 0) return `menos ${integerToPtBrWords(-value, gender)}`;
  if (value === 0) return 'zero';
  if (value > 999_999_999) {
    throw new Error(`integerToPtBrWords não cobre ${value} (máximo 999.999.999)`);
  }

  const millions = Math.floor(value / 1_000_000);
  const thousands = Math.floor((value % 1_000_000) / 1000);
  const units = value % 1000;

  const groups: { text: string; value: number }[] = [];

  if (millions > 0) {
    groups.push({
      text:
        millions === 1
          ? 'um milhão'
          : `${threeDigitsToWords(millions, 'm')} milhões`,
      value: millions,
    });
  }
  if (thousands > 0) {
    groups.push({
      text: thousands === 1 ? 'mil' : `${threeDigitsToWords(thousands, 'm')} mil`,
      value: thousands,
    });
  }
  if (units > 0) {
    groups.push({ text: threeDigitsToWords(units, gender), value: units });
  }

  if (groups.length === 1) return groups[0].text;

  // Regra do "e" entre grupos: entra quando o último grupo é menor que cem ou
  // é centena redonda. "mil e cinco", "mil e cem", mas "mil duzentos e quarenta".
  const head = groups.slice(0, -1).map((g) => g.text).join(' ');
  const tail = groups[groups.length - 1];
  const useE = tail.value < 100 || tail.value % 100 === 0;

  return useE ? `${head} e ${tail.text}` : `${head} ${tail.text}`;
}

// ---------------------------------------------------------------------------
// Formatação de algarismos
// ---------------------------------------------------------------------------

/**
 * Algarismo no padrão da casa: separador de milhar com ponto e zero à esquerda
 * em unidades — "05", "61", "1.240". O zero à esquerda é o estilo das duas
 * propostas de referência ("05 (cinco)", "07 (sete)").
 */
export function formatIntegerPtBr(value: number, options?: { pad?: boolean }): string {
  const pad = options?.pad ?? true;
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';

  if (pad && abs < 10) return `${sign}0${abs}`;

  return sign + abs.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/** Decimal no padrão brasileiro: "155,4", "1.240,50". */
export function formatDecimalPtBr(value: number, decimals = 2): string {
  const fixed = Math.abs(value).toFixed(decimals);
  const [intPart, decPart] = fixed.split('.');
  const withSeparator = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const sign = value < 0 ? '-' : '';
  return decPart ? `${sign}${withSeparator},${decPart}` : `${sign}${withSeparator}`;
}

/** Escolhe entre inteiro e decimal conforme o valor. */
export function formatQuantityPtBr(value: number): string {
  return Number.isInteger(value)
    ? formatIntegerPtBr(value)
    : formatDecimalPtBr(value, decimalPlacesOf(value));
}

function decimalPlacesOf(value: number): number {
  const s = value.toString();
  const dot = s.indexOf('.');
  if (dot === -1) return 0;
  return Math.min(s.length - dot - 1, 3);
}

// ---------------------------------------------------------------------------
// Parsing e normalização
// ---------------------------------------------------------------------------

/** Casa "1.240", "13,8", "1.234,56", "00004", "70". */
export const NUMERIC_TOKEN_PATTERN = /\d+(?:[.,]\d+)*/g;

/**
 * Converte um token numérico escrito em português para número.
 * "1.240" → 1240 | "13,8" → 13.8 | "00004" → 4 | "1.234,56" → 1234.56
 */
export function parseNumericToken(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  let normalized = trimmed;

  if (normalized.includes(',')) {
    // Vírgula é decimal; ponto vira separador de milhar.
    normalized = normalized.replace(/\./g, '').replace(',', '.');
  } else if (/^\d{1,3}(?:\.\d{3})+$/.test(normalized)) {
    // "1.240" / "1.234.567" — grupos de três dígitos são milhar, não decimal.
    normalized = normalized.replace(/\./g, '');
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Todos os números presentes num texto, já convertidos. */
export function extractNumbersFromText(text: string): { raw: string; value: number; index: number }[] {
  const out: { raw: string; value: number; index: number }[] = [];
  for (const match of text.matchAll(NUMERIC_TOKEN_PATTERN)) {
    const value = parseNumericToken(match[0]);
    if (value === null) continue;
    out.push({ raw: match[0], value, index: match.index ?? 0 });
  }
  return out;
}

/**
 * `true` quando o conteúdo de um parêntese é um número por extenso — e portanto
 * precisa concordar com o algarismo que o antecede. "(sessenta e um)" sim,
 * "(executados pela Contratante)" não.
 */
export function looksLikeNumberWords(text: string): boolean {
  const tokens = deaccentLower(text)
    .replace(/[^a-z\s-]/g, ' ')
    .split(/[\s-]+/)
    .filter(Boolean);

  if (tokens.length === 0) return false;
  return tokens.every((t) => PT_NUMBER_WORD_TOKENS.has(t));
}

/**
 * Formas aceitas do extenso de um inteiro: masculina e feminina. A concordância
 * de gênero depende do substantivo que a IA escolher ("uma caixa", "um poste"),
 * então o validador aceita as duas.
 */
export function acceptedWordFormsFor(value: number): string[] {
  if (!Number.isInteger(value) || value < 0 || value > 999_999_999) return [];
  const masculine = integerToPtBrWords(value, 'm');
  const feminine = integerToPtBrWords(value, 'f');
  const forms = new Set([deaccentLower(masculine), deaccentLower(feminine)]);
  return Array.from(forms);
}

/** Par "algarismo (extenso)" pronto para o prompt: `61 (sessenta e um)`. */
export function formatQuantityWithWords(value: number, gender: PtGender = 'm'): string {
  if (!Number.isInteger(value)) return formatQuantityPtBr(value);
  return `${formatIntegerPtBr(value)} (${integerToPtBrWords(value, gender)})`;
}
