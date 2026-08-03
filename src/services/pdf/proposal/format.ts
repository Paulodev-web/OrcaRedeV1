/**
 * Formatação pt-BR determinística.
 *
 * Implementada à mão de propósito: `Intl.NumberFormat` depende do ICU completo
 * do runtime, e o PDF precisa sair idêntico em dev, na Vercel e em qualquer
 * container. Aqui não há variação possível.
 */

function groupThousands(intPart: string): string {
  let out = '';
  for (let i = intPart.length; i > 0; i -= 3) {
    const chunk = intPart.slice(Math.max(0, i - 3), i);
    out = out === '' ? chunk : `${chunk}.${out}`;
  }
  return out;
}

/** Número com separador de milhar e vírgula decimal: `1.350.455,77`. */
export function decimal(value: number, digits = 2): string {
  const safe = Number.isFinite(value) ? value : 0;
  const negative = safe < 0;
  const fixed = Math.abs(safe).toFixed(digits);
  const [intPart, fracPart] = fixed.split('.');
  const grouped = groupThousands(intPart);
  const body = fracPart ? `${grouped},${fracPart}` : grouped;
  return negative ? `-${body}` : body;
}

/** Moeda: `R$ 1.350.455,77`. */
export function brl(value: number): string {
  return `R$ ${decimal(value, 2)}`;
}

/** Percentual: `25,92%`. */
export function percent(value: number, digits = 2): string {
  return `${decimal(value, digits)}%`;
}

/**
 * Quantidade: inteiro sai sem casas (`61`), fracionário sai com até 2 (`1.240,5`).
 * Evita o ruído de "61,00 un" nas tabelas de material.
 */
export function quantity(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  return Number.isInteger(rounded) ? decimal(rounded, 0) : decimal(rounded, 2);
}

/**
 * Data ISO → `dd/mm/aaaa`. Lê os componentes da string, sem passar por `Date`,
 * para que um `2026-06-12` não vire 11/06 por fuso horário.
 */
export function dateBR(iso: string | null): string {
  if (!iso) return '—';
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (match) return `${match[3]}/${match[2]}/${match[1]}`;
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return '—';
  const day = String(parsed.getUTCDate()).padStart(2, '0');
  const month = String(parsed.getUTCMonth() + 1).padStart(2, '0');
  return `${day}/${month}/${parsed.getUTCFullYear()}`;
}

/** Ano de uma data ISO, para compor `00287/2026`. */
export function yearOf(iso: string): string {
  const match = /^(\d{4})/.exec(iso);
  return match ? match[1] : String(new Date().getUTCFullYear());
}

export function pad(value: number, size = 2): string {
  return String(Math.trunc(Math.abs(value))).padStart(size, '0');
}

/** `287` + `2026` → `00287/2026`, como na capa da peça atual. */
export function budgetLabel(proposalNumber: number, issuedAt: string): string {
  return `${pad(proposalNumber, 5)}/${yearOf(issuedAt)}`;
}

/** Separa os caracteres por espaço: `03` → `0 3`. */
export function spacedChars(text: string): string {
  return text.split('').join(' ');
}

/**
 * Rodapé de paginação no formato exato da peça atual: `PÁG : 0 3 / 1 4`.
 * O "PÁG" fica sem espaçamento e só os dígitos são separados — é assim que
 * aparece nas duas propostas de referência.
 */
export function pageLabel(pageNumber: number, totalPages: number): string {
  return `PÁG : ${spacedChars(pad(pageNumber))} / ${spacedChars(pad(totalPages))}`;
}
