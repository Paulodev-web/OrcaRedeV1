import type {
  ProposalAbc,
  ProposalData,
  ProposalPricingOption,
  ProposalSectionKey,
} from '@/types/proposal';

import { brl, decimal, percent } from './format';

/**
 * VALIDAÇÃO DE COERÊNCIA NUMÉRICA — roda ANTES de qualquer render.
 *
 * Motivo de existir: a proposta real da Maxif4 (163.4) foi enviada ao cliente
 * com a Curva C repetindo o valor da Curva B. Nenhuma checagem impediu.
 * Aqui, um documento incoerente não vira PDF: `renderProposalPdf` aborta com
 * erro descritivo apontando o campo, o valor encontrado e o valor esperado.
 */

export type ProposalValidationCode =
  | 'abc/rows-sum-mismatch'
  | 'abc/row-percent-mismatch'
  | 'abc/curve-total-mismatch'
  | 'abc/curve-percent-mismatch'
  | 'abc/curve-total-duplicated'
  | 'abc/totals-sum-mismatch'
  | 'abc/missing-curve-total'
  | 'material/subtotal-mismatch'
  | 'globals/split-mismatch'
  | 'segment/split-mismatch'
  | 'segment/sum-mismatch'
  | 'segment/percent-mismatch'
  | 'payment/percent-sum-mismatch'
  | 'payment/amount-sum-mismatch'
  | 'payment/amount-percent-mismatch'
  | 'unit/amount-mismatch'
  | 'unit/invalid-count'
  | 'pricing/no-options'
  | 'section/duplicate-key'
  | 'section/duplicate-order'
  | 'content/placeholder-leak';

export interface ProposalValidationIssue {
  /** Caminho no `ProposalData`, ex.: `abc.totals[C].amount`. */
  path: string;
  code: ProposalValidationCode;
  message: string;
}

export class ProposalValidationError extends Error {
  readonly issues: ProposalValidationIssue[];

  constructor(issues: ProposalValidationIssue[]) {
    const lines = issues.map((issue) => `  • [${issue.code}] ${issue.path}: ${issue.message}`);
    super(
      `Proposta reprovada na validação de coerência (${issues.length} ` +
        `${issues.length === 1 ? 'problema' : 'problemas'}):\n${lines.join('\n')}`,
    );
    this.name = 'ProposalValidationError';
    this.issues = issues;
  }
}

/** Tolerância de centavo para identidades de uma linha só. */
const ROW_EPS = 0.011;
/** Tolerância em pontos percentuais — cobre truncamento (17,485 → "17,48"). */
const PCT_EPS = 0.06;

/** Tolerância de soma: cresce com a quantidade de parcelas arredondadas. */
function sumEps(rowCount: number): number {
  return Math.max(0.05, rowCount * 0.011);
}

function near(a: number, b: number, eps: number): boolean {
  return Math.abs(a - b) <= eps;
}

const PLACEHOLDER_PATTERNS: Array<{ re: RegExp; label: string }> = [
  { re: /TEXTO\s+DO\s+SEU/i, label: 'placeholder de template ("TEXTO DO SEU…")' },
  { re: /LOREM\s+IPSUM/i, label: 'lorem ipsum' },
  { re: /\{\{[^}]*\}\}/, label: 'variável de template não substituída ({{…}})' },
  { re: /\[\[[^\]]*\]\]/, label: 'variável de template não substituída ([[…]])' },
  // Deliberadamente estreito: "TODO" e "XX" soltos dariam falso positivo em
  // texto português em caixa alta ("TODO O MATERIAL SERÁ…").
  { re: /\bTODO:|\bTBD\b|\bXXX+\b/, label: 'marcação de pendência (TODO:/TBD/XXX)' },
  { re: /\bINSIRA\s+(AQUI|O|A)\b/i, label: 'instrução de preenchimento ("insira aqui")' },
];

// ---------------------------------------------------------------------------
// Curva ABC — a checagem que faltou na Maxif4
// ---------------------------------------------------------------------------

function validateAbc(abc: ProposalAbc, issues: ProposalValidationIssue[]): void {
  const rowsSum = abc.rows.reduce((acc, row) => acc + row.amount, 0);

  if (!near(rowsSum, abc.grandTotal, sumEps(abc.rows.length))) {
    issues.push({
      path: 'abc.rows[].amount',
      code: 'abc/rows-sum-mismatch',
      message:
        `a soma das ${abc.rows.length} linhas da curva ABC é ${brl(rowsSum)}, ` +
        `mas grandTotal é ${brl(abc.grandTotal)} ` +
        `(diferença de ${brl(Math.abs(rowsSum - abc.grandTotal))})`,
    });
  }

  if (abc.grandTotal > 0) {
    abc.rows.forEach((row, index) => {
      const expected = (row.amount / abc.grandTotal) * 100;
      if (!near(row.percent, expected, PCT_EPS)) {
        issues.push({
          path: `abc.rows[${index}] (${row.label})`,
          code: 'abc/row-percent-mismatch',
          message:
            `percentual declarado ${percent(row.percent)} não confere com ` +
            `${brl(row.amount)} sobre ${brl(abc.grandTotal)} (esperado ${percent(expected)})`,
        });
      }
    });
  }

  const curves: Array<'A' | 'B' | 'C'> = ['A', 'B', 'C'];
  const usedCurves = new Set(abc.rows.map((row) => row.curve));

  for (const curve of curves) {
    const curveRows = abc.rows.filter((row) => row.curve === curve);
    const declared = abc.totals.find((total) => total.curve === curve);

    if (curveRows.length === 0) continue;

    if (!declared) {
      issues.push({
        path: `abc.totals[${curve}]`,
        code: 'abc/missing-curve-total',
        message: `existem ${curveRows.length} linhas na curva ${curve}, mas nenhum total declarado`,
      });
      continue;
    }

    const curveSum = curveRows.reduce((acc, row) => acc + row.amount, 0);
    if (!near(curveSum, declared.amount, sumEps(curveRows.length))) {
      issues.push({
        path: `abc.totals[${curve}].amount`,
        code: 'abc/curve-total-mismatch',
        message:
          `total da curva ${curve} declarado como ${brl(declared.amount)}, ` +
          `mas suas ${curveRows.length} linhas somam ${brl(curveSum)} ` +
          `(diferença de ${brl(Math.abs(curveSum - declared.amount))})`,
      });
    }

    if (abc.grandTotal > 0) {
      const expected = (declared.amount / abc.grandTotal) * 100;
      if (!near(declared.percent, expected, PCT_EPS)) {
        issues.push({
          path: `abc.totals[${curve}].percent`,
          code: 'abc/curve-percent-mismatch',
          message:
            `percentual da curva ${curve} declarado ${percent(declared.percent)} não confere ` +
            `com ${brl(declared.amount)} sobre ${brl(abc.grandTotal)} (esperado ${percent(expected)})`,
        });
      }
    }
  }

  // Detecção direta do erro da Maxif4: duas curvas com valor idêntico enquanto
  // as linhas de cada uma somam coisas diferentes.
  for (let i = 0; i < abc.totals.length; i += 1) {
    for (let j = i + 1; j < abc.totals.length; j += 1) {
      const a = abc.totals[i];
      const b = abc.totals[j];
      if (!near(a.amount, b.amount, ROW_EPS)) continue;

      const sumA = abc.rows.filter((row) => row.curve === a.curve).reduce((acc, r) => acc + r.amount, 0);
      const sumB = abc.rows.filter((row) => row.curve === b.curve).reduce((acc, r) => acc + r.amount, 0);
      if (near(sumA, sumB, ROW_EPS)) continue;

      issues.push({
        path: `abc.totals[${a.curve}] / abc.totals[${b.curve}]`,
        code: 'abc/curve-total-duplicated',
        message:
          `curvas ${a.curve} e ${b.curve} declaram o mesmo valor ${brl(a.amount)}, mas suas ` +
          `linhas somam ${brl(sumA)} e ${brl(sumB)} — provável valor copiado de uma curva para a outra`,
      });
    }
  }

  const totalsSum = abc.totals.reduce((acc, total) => acc + total.amount, 0);
  if (usedCurves.size > 0 && !near(totalsSum, abc.grandTotal, sumEps(abc.totals.length))) {
    issues.push({
      path: 'abc.totals[].amount',
      code: 'abc/totals-sum-mismatch',
      message:
        `a soma dos totais por curva é ${brl(totalsSum)}, mas grandTotal é ${brl(abc.grandTotal)}`,
    });
  }
}

// ---------------------------------------------------------------------------
// Precificação
// ---------------------------------------------------------------------------

function validatePricingOption(
  option: ProposalPricingOption,
  index: number,
  issues: ProposalValidationIssue[],
): void {
  const base = `pricingOptions[${index}] (${option.label})`;
  const { globals, segments, paymentTerms, unitInvestment } = option;

  const split = globals.materialTotal + globals.laborTotal;
  if (!near(split, globals.grandTotal, ROW_EPS)) {
    issues.push({
      path: `${base}.globals`,
      code: 'globals/split-mismatch',
      message:
        `material ${brl(globals.materialTotal)} + mão de obra ${brl(globals.laborTotal)} = ` +
        `${brl(split)}, mas grandTotal é ${brl(globals.grandTotal)}`,
    });
  }

  if (segments.length > 0) {
    segments.forEach((segment, segIndex) => {
      const segSplit = segment.materialAmount + segment.laborAmount;
      if (!near(segSplit, segment.totalAmount, ROW_EPS)) {
        issues.push({
          path: `${base}.segments[${segIndex}] (${segment.label})`,
          code: 'segment/split-mismatch',
          message:
            `material ${brl(segment.materialAmount)} + mão de obra ${brl(segment.laborAmount)} = ` +
            `${brl(segSplit)}, mas totalAmount é ${brl(segment.totalAmount)}`,
        });
      }
      if (globals.grandTotal > 0) {
        const expected = (segment.totalAmount / globals.grandTotal) * 100;
        if (!near(segment.percent, expected, PCT_EPS)) {
          issues.push({
            path: `${base}.segments[${segIndex}] (${segment.label})`,
            code: 'segment/percent-mismatch',
            message:
              `percentual declarado ${percent(segment.percent)} não confere com ` +
              `${brl(segment.totalAmount)} sobre ${brl(globals.grandTotal)} (esperado ${percent(expected)})`,
          });
        }
      }
    });

    const eps = sumEps(segments.length);
    const materialSum = segments.reduce((acc, s) => acc + s.materialAmount, 0);
    const laborSum = segments.reduce((acc, s) => acc + s.laborAmount, 0);

    if (!near(materialSum, globals.materialTotal, eps)) {
      issues.push({
        path: `${base}.segments[].materialAmount`,
        code: 'segment/sum-mismatch',
        message:
          `os segmentos somam ${brl(materialSum)} de material, mas globals.materialTotal é ` +
          `${brl(globals.materialTotal)}`,
      });
    }
    if (!near(laborSum, globals.laborTotal, eps)) {
      issues.push({
        path: `${base}.segments[].laborAmount`,
        code: 'segment/sum-mismatch',
        message:
          `os segmentos somam ${brl(laborSum)} de mão de obra, mas globals.laborTotal é ` +
          `${brl(globals.laborTotal)}`,
      });
    }
  }

  if (paymentTerms.length > 0) {
    const percentSum = paymentTerms.reduce((acc, term) => acc + term.percent, 0);
    if (!near(percentSum, 100, Math.max(PCT_EPS, paymentTerms.length * 0.01))) {
      issues.push({
        path: `${base}.paymentTerms[].percent`,
        code: 'payment/percent-sum-mismatch',
        message: `as ${paymentTerms.length} parcelas somam ${percent(percentSum)}, esperado 100,00%`,
      });
    }

    const amountSum = paymentTerms.reduce((acc, term) => acc + term.amount, 0);
    if (!near(amountSum, globals.laborTotal, sumEps(paymentTerms.length))) {
      issues.push({
        path: `${base}.paymentTerms[].amount`,
        code: 'payment/amount-sum-mismatch',
        message:
          `as parcelas somam ${brl(amountSum)}, mas incidem sobre a mão de obra ` +
          `${brl(globals.laborTotal)} — parcelamento nunca incide sobre material`,
      });
    }

    paymentTerms.forEach((term, termIndex) => {
      const expected = (term.percent / 100) * globals.laborTotal;
      if (!near(term.amount, expected, Math.max(ROW_EPS, 0.02))) {
        issues.push({
          path: `${base}.paymentTerms[${termIndex}] (${term.dueLabel})`,
          code: 'payment/amount-percent-mismatch',
          message:
            `parcela de ${percent(term.percent)} sobre ${brl(globals.laborTotal)} deveria ser ` +
            `${brl(expected)}, mas está ${brl(term.amount)}`,
        });
      }
    });
  }

  if (unitInvestment) {
    if (!Number.isFinite(unitInvestment.unitsCount) || unitInvestment.unitsCount <= 0) {
      issues.push({
        path: `${base}.unitInvestment.unitsCount`,
        code: 'unit/invalid-count',
        message: `quantidade de ${unitInvestment.unitsLabel} inválida: ${unitInvestment.unitsCount}`,
      });
    } else {
      const expected = globals.grandTotal / unitInvestment.unitsCount;
      if (!near(unitInvestment.amountPerUnit, expected, 0.02)) {
        issues.push({
          path: `${base}.unitInvestment.amountPerUnit`,
          code: 'unit/amount-mismatch',
          message:
            `${brl(globals.grandTotal)} ÷ ${decimal(unitInvestment.unitsCount, 0)} ` +
            `${unitInvestment.unitsLabel} = ${brl(expected)}, mas está declarado ` +
            `${brl(unitInvestment.amountPerUnit)}`,
        });
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Texto: placeholder vazado
// ---------------------------------------------------------------------------

function collectText(data: ProposalData): Array<{ path: string; text: string }> {
  const out: Array<{ path: string; text: string }> = [];
  const push = (path: string, text: string | null | undefined) => {
    if (typeof text === 'string' && text.trim()) out.push({ path, text });
  };

  push('header.projectTitle', data.header.projectTitle);
  push('header.projectSubtitle', data.header.projectSubtitle);
  push('header.scopeLabel', data.header.scopeLabel);

  for (const [key, block] of Object.entries(data.institutional)) {
    if (!block) continue;
    push(`institutional.${key}.heading`, block.heading);
    block.paragraphs.forEach((p, i) => push(`institutional.${key}.paragraphs[${i}]`, p));
    block.bullets.forEach((b, i) => push(`institutional.${key}.bullets[${i}]`, b));
  }

  data.activities.forEach((group, gi) => {
    push(`activities[${gi}].title`, group.title);
    push(`activities[${gi}].intro`, group.intro);
    group.items.forEach((item, i) => push(`activities[${gi}].items[${i}]`, item));
    if (group.note) {
      push(`activities[${gi}].note.heading`, group.note.heading);
      group.note.paragraphs.forEach((p, i) => push(`activities[${gi}].note.paragraphs[${i}]`, p));
      group.note.bullets.forEach((b, i) => push(`activities[${gi}].note.bullets[${i}]`, b));
    }
  });

  if (data.billingConditions) {
    push('billingConditions.heading', data.billingConditions.heading);
    data.billingConditions.paragraphs.forEach((p, i) =>
      push(`billingConditions.paragraphs[${i}]`, p),
    );
    data.billingConditions.bullets.forEach((b, i) => push(`billingConditions.bullets[${i}]`, b));
  }

  data.finalConsiderations.forEach((block, bi) => {
    push(`finalConsiderations[${bi}].heading`, block.heading);
    block.paragraphs.forEach((p, i) => push(`finalConsiderations[${bi}].paragraphs[${i}]`, p));
    block.bullets.forEach((b, i) => push(`finalConsiderations[${bi}].bullets[${i}]`, b));
  });

  push('schedule.footnote', data.schedule.footnote);
  push('acceptance.closingText', data.acceptance.closingText);
  data.responsibilityMatrix.forEach((item, i) =>
    push(`responsibilityMatrix[${i}].description`, item.description),
  );

  return out;
}

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

export interface ValidateOptions {
  /**
   * Desliga a varredura de placeholder de template. Só use quando a proposta
   * for propositalmente um rascunho — publicar com placeholder já aconteceu.
   */
  allowPlaceholders?: boolean;
}

/** Roda todas as checagens e devolve a lista de problemas (vazia = coerente). */
export function validateProposalData(
  data: ProposalData,
  options: ValidateOptions = {},
): ProposalValidationIssue[] {
  const issues: ProposalValidationIssue[] = [];

  validateAbc(data.abc, issues);

  data.materials.forEach((row, index) => {
    const expected = row.quantity * row.unitPrice;
    if (!near(row.subtotal, expected, Math.max(ROW_EPS, Math.abs(expected) * 1e-6))) {
      issues.push({
        path: `materials[${index}] (${row.name})`,
        code: 'material/subtotal-mismatch',
        message:
          `${quantityLabel(row.quantity, row.unit)} × ${brl(row.unitPrice)} = ${brl(expected)}, ` +
          `mas subtotal está ${brl(row.subtotal)}`,
      });
    }
  });

  if (data.pricingOptions.length === 0) {
    issues.push({
      path: 'pricingOptions',
      code: 'pricing/no-options',
      message: 'a proposta precisa de ao menos uma opção de precificação',
    });
  }
  data.pricingOptions.forEach((option, index) => validatePricingOption(option, index, issues));

  const seenKeys = new Set<ProposalSectionKey>();
  const seenOrders = new Set<number>();
  data.sections.forEach((section, index) => {
    if (seenKeys.has(section.key)) {
      issues.push({
        path: `sections[${index}]`,
        code: 'section/duplicate-key',
        message: `a seção "${section.key}" aparece mais de uma vez`,
      });
    }
    seenKeys.add(section.key);

    if (seenOrders.has(section.order)) {
      issues.push({
        path: `sections[${index}] (${section.key})`,
        code: 'section/duplicate-order',
        message: `order ${section.order} está duplicado — a ordem de renderização fica indefinida`,
      });
    }
    seenOrders.add(section.order);
  });

  if (!options.allowPlaceholders) {
    for (const { path, text } of collectText(data)) {
      for (const { re, label } of PLACEHOLDER_PATTERNS) {
        if (!re.test(text)) continue;
        issues.push({
          path,
          code: 'content/placeholder-leak',
          message: `${label} encontrado no texto: "${text.slice(0, 80)}${text.length > 80 ? '…' : ''}"`,
        });
        break;
      }
    }
  }

  return issues;
}

function quantityLabel(value: number, unit: string): string {
  return `${decimal(value, Number.isInteger(value) ? 0 : 2)} ${unit}`;
}

/** Lança `ProposalValidationError` se houver qualquer incoerência. */
export function assertValidProposalData(data: ProposalData, options: ValidateOptions = {}): void {
  const issues = validateProposalData(data, options);
  if (issues.length > 0) throw new ProposalValidationError(issues);
}
