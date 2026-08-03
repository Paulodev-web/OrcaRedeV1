/**
 * DERIVAÇÕES NUMÉRICAS DA PROPOSTA — curva ABC, segmentos, parcelamento.
 *
 * Nada aqui fala com o Supabase: são funções puras sobre números já fechados.
 * É a metade "número vem do banco" da regra de ouro (Escopo §8.1) — a outra
 * metade, a prosa, é da camada de IA.
 *
 * Toda função foi escrita para SOBREVIVER à validação de coerência do motor de
 * PDF (`src/services/pdf/proposal/validation.ts`). Onde o arredondamento
 * poderia quebrar uma identidade, a última linha absorve o resíduo. Não é
 * capricho: foi a falta dessa disciplina que mandou ao cliente a proposta da
 * Maxif4 com a Curva C repetindo o valor da Curva B.
 */

import type {
  ProposalAbc,
  ProposalAbcCurveTotal,
  ProposalAbcRow,
  ProposalMaterialRow,
  ProposalPaymentTerm,
  ProposalSegmentTotal,
  ProposalUnitInvestment,
} from '@/types/proposal';

export function round2(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function toNumber(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function sum(values: number[]): number {
  return values.reduce((acc, value) => acc + value, 0);
}

/**
 * Distribui `total` entre pesos e devolve valores já arredondados cuja soma é
 * exatamente `round2(total)`. A última fatia com peso absorve a diferença.
 */
function distribute(total: number, weights: number[]): number[] {
  const target = round2(total);
  const weightSum = sum(weights);

  if (weights.length === 0) return [];

  const shares =
    weightSum > 0
      ? weights.map((weight) => round2((weight / weightSum) * target))
      : weights.map(() => round2(target / weights.length));

  const drift = round2(target - sum(shares));
  if (drift !== 0) {
    // Índice da última fatia com peso — jogar o resíduo numa fatia de peso zero
    // criaria um segmento "fantasma" com valor sem material nenhum.
    let lastIndex = weights.length - 1;
    for (let i = weights.length - 1; i >= 0; i -= 1) {
      if (weightSum <= 0 || weights[i] > 0) {
        lastIndex = i;
        break;
      }
    }
    shares[lastIndex] = round2(shares[lastIndex] + drift);
  }

  return shares;
}

// ---------------------------------------------------------------------------
// Curva ABC
// ---------------------------------------------------------------------------

export const DEFAULT_ABC_CUT_A = 68;
export const DEFAULT_ABC_CUT_B = 95;

export interface AbcCuts {
  /** Percentual acumulado onde a curva A termina. */
  cutA: number;
  /** Percentual acumulado onde a curva B termina. */
  cutB: number;
}

export interface AbcGroup {
  label: string;
  amount: number;
}

/** Consolida as linhas de material por subgrupo, do maior valor para o menor. */
export function groupMaterialsBySubgroup(rows: ProposalMaterialRow[]): AbcGroup[] {
  const totals = new Map<string, number>();

  for (const row of rows) {
    const label = row.subgroup?.trim() || 'Não classificado';
    totals.set(label, round2((totals.get(label) ?? 0) + row.subtotal));
  }

  return [...totals.entries()]
    .map(([label, amount]) => ({ label, amount }))
    .sort((a, b) => b.amount - a.amount || a.label.localeCompare(b.label, 'pt-BR'));
}

/**
 * Curva ABC por Pareto sobre os subgrupos (Escopo §8.4).
 *
 * O item que CRUZA o corte ainda pertence à curva corrente; o próximo desce.
 * Sem isso, um único subgrupo caro (frete, transformador) que já passa de 68%
 * sozinho deixaria a curva A vazia.
 */
export function buildAbcFromMaterials(
  materials: ProposalMaterialRow[],
  cuts: AbcCuts = { cutA: DEFAULT_ABC_CUT_A, cutB: DEFAULT_ABC_CUT_B },
): ProposalAbc {
  const groups = groupMaterialsBySubgroup(materials);
  const grandTotal = round2(sum(groups.map((group) => group.amount)));

  if (grandTotal <= 0) {
    return { rows: [], totals: [], grandTotal: 0 };
  }

  let cumulative = 0;
  let curve: 'A' | 'B' | 'C' = 'A';

  const rows: ProposalAbcRow[] = groups.map((group, index) => {
    const current = curve;
    cumulative += (group.amount / grandTotal) * 100;
    if (curve === 'A' && cumulative >= cuts.cutA) curve = 'B';
    else if (curve === 'B' && cumulative >= cuts.cutB) curve = 'C';

    return {
      curve: current,
      label: group.label,
      amount: group.amount,
      percent: round2((group.amount / grandTotal) * 100),
      order: index + 1,
    };
  });

  return { rows, totals: totalsFromAbcRows(rows, grandTotal), grandTotal };
}

/**
 * Totais por curva a partir das linhas. NUNCA digitados: é literalmente o
 * cálculo que a Maxif4 não fez.
 */
export function totalsFromAbcRows(
  rows: ProposalAbcRow[],
  grandTotal: number,
): ProposalAbcCurveTotal[] {
  return (['A', 'B', 'C'] as const)
    .map((curve) => {
      const amount = round2(
        sum(rows.filter((row) => row.curve === curve).map((row) => row.amount)),
      );
      return {
        curve,
        amount,
        percent: grandTotal > 0 ? round2((amount / grandTotal) * 100) : 0,
      };
    })
    .filter((total) => rows.some((row) => row.curve === total.curve));
}

/** Reaplica percentuais e ordem depois de o usuário editar rótulos e valores. */
export function normalizeAbcRows(rows: ProposalAbcRow[]): ProposalAbc {
  const grandTotal = round2(sum(rows.map((row) => row.amount)));
  const normalized = rows
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((row, index) => ({
      ...row,
      amount: round2(row.amount),
      percent: grandTotal > 0 ? round2((row.amount / grandTotal) * 100) : 0,
      order: index + 1,
    }));

  return { rows: normalized, totals: totalsFromAbcRows(normalized, grandTotal), grandTotal };
}

// ---------------------------------------------------------------------------
// Valores por segmento
// ---------------------------------------------------------------------------

export interface SegmentShare {
  segmentId: string | null;
  label: string;
  /** Material consolidado do segmento — usado como peso do rateio. */
  materialWeight: number;
}

/**
 * Totais por segmento de obra a partir do material consolidado.
 *
 * `materialTotal` e `laborTotal` vêm da precificação escolhida e mandam: as
 * fatias são rateadas para fechar exatamente com eles, porque a validação do
 * PDF compara a soma dos segmentos com os globais da opção de preço. A mão de
 * obra é rateada pelo peso de material como PONTO DE PARTIDA — a peça real tem
 * VS negociado por segmento, e o editor deixa corrigir linha a linha.
 */
export function buildSegmentTotals(
  shares: SegmentShare[],
  materialTotal: number,
  laborTotal: number,
): Array<ProposalSegmentTotal & { segmentId: string | null }> {
  if (shares.length === 0) return [];

  const weights = shares.map((share) => Math.max(share.materialWeight, 0));
  const materials = distribute(materialTotal, weights);
  const labors = distribute(laborTotal, weights);
  const grandTotal = round2(materialTotal + laborTotal);

  return shares
    .map((share, index) => {
      const materialAmount = materials[index];
      const laborAmount = labors[index];
      const totalAmount = round2(materialAmount + laborAmount);

      return {
        segmentId: share.segmentId,
        label: share.label,
        materialAmount,
        laborAmount,
        totalAmount,
        percent: grandTotal > 0 ? round2((totalAmount / grandTotal) * 100) : 0,
        order: index + 1,
      };
    })
    .sort((a, b) => b.totalAmount - a.totalAmount)
    .map((segment, index) => ({ ...segment, order: index + 1 }));
}

/** Reaplica percentual e ordem depois da edição manual das linhas. */
export function normalizeSegmentTotals<T extends ProposalSegmentTotal>(
  segments: T[],
  grandTotal: number,
): T[] {
  return segments
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((segment, index) => {
      const materialAmount = round2(segment.materialAmount);
      const laborAmount = round2(segment.laborAmount);
      const totalAmount = round2(materialAmount + laborAmount);

      return {
        ...segment,
        materialAmount,
        laborAmount,
        totalAmount,
        percent: grandTotal > 0 ? round2((totalAmount / grandTotal) * 100) : 0,
        order: index + 1,
      };
    });
}

// ---------------------------------------------------------------------------
// Gerador de parcelamento (Escopo §8.5)
// ---------------------------------------------------------------------------

export interface PaymentPlanInput {
  /** Número TOTAL de parcelas, entrada inclusa. */
  installments: number;
  /** Primeira parcela é entrada / assinatura de contrato. */
  hasDownPayment: boolean;
  /** Intervalo em dias entre as parcelas subsequentes. 0 = sem rótulo de prazo. */
  intervalDays: number;
  /** Base de cálculo. É SEMPRE a mão de obra — material é faturado direto (§8.2). */
  laborTotal: number;
  /** Data da primeira parcela não-entrada, para calcular vencimentos. ISO. */
  firstDueDate?: string | null;
}

export interface GeneratedPaymentTerm extends ProposalPaymentTerm {
  dueDate: string | null;
}

/**
 * Gera a tabela de parcelas sobre o VS.
 *
 * O percentual da última parcela absorve o resíduo (10x de 100% dá 10,00; 3x dá
 * 33,33 / 33,33 / 33,34) e o valor de cada parcela é derivado do SEU percentual,
 * não do resíduo em reais. Assim `amount ≈ percent% × laborTotal` vale linha a
 * linha, que é o que a validação do PDF cobra parcela a parcela.
 */
export function generatePaymentTerms(input: PaymentPlanInput): GeneratedPaymentTerm[] {
  const count = Math.max(1, Math.floor(input.installments));
  const laborTotal = round2(Math.max(input.laborTotal, 0));
  const base = round2(100 / count);

  const percents = Array.from({ length: count }, (_, index) =>
    index === count - 1 ? round2(100 - base * (count - 1)) : base,
  );

  const start = parseIsoDate(input.firstDueDate);

  return percents.map((percent, index) => {
    const isDownPayment = input.hasDownPayment && index === 0;
    const offsetSteps = input.hasDownPayment ? index : index + 1;
    const days = input.intervalDays > 0 ? input.intervalDays * offsetSteps : 0;

    return {
      order: index + 1,
      percent,
      amount: round2((percent / 100) * laborTotal),
      dueLabel: isDownPayment
        ? 'Entrada — assinatura do contrato'
        : days > 0
          ? `${days} dias`
          : `Parcela ${index + 1}`,
      dueDate: start && !isDownPayment ? addDaysIso(start, days) : null,
    };
  });
}

/** Recalcula os valores das parcelas quando o VS da opção muda. */
export function repricePaymentTerms(
  terms: ProposalPaymentTerm[],
  laborTotal: number,
): ProposalPaymentTerm[] {
  return terms
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((term, index) => ({
      ...term,
      order: index + 1,
      percent: round2(term.percent),
      amount: round2((round2(term.percent) / 100) * round2(laborTotal)),
    }));
}

function parseIsoDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const parsed = new Date(`${value.slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function addDaysIso(start: Date, days: number): string {
  const result = new Date(start.getTime());
  result.setUTCDate(result.getUTCDate() + days);
  return result.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Investimento por unidade
// ---------------------------------------------------------------------------

export function buildUnitInvestment(
  grandTotal: number,
  unitsCount: number | null,
  unitsLabel: string | null,
): ProposalUnitInvestment | null {
  if (!unitsCount || unitsCount <= 0) return null;

  return {
    unitsCount,
    unitsLabel: unitsLabel?.trim() || 'unidades',
    amountPerUnit: round2(grandTotal / unitsCount),
  };
}
