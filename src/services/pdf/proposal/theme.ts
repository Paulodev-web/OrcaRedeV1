/**
 * Tokens visuais do PDF da proposta comercial.
 *
 * Os valores de cor e a geometria das faixas foram medidos diretamente das duas
 * propostas de referência (Andora 287.1 e Maxif4 163.4), extraindo as artes de
 * fundo e amostrando os pixels. Não são chutes: `#1D3140` e `#64ABDE` são
 * exatamente os tokens de marca em `src/lib/branding.ts`.
 */

/** A4 retrato, em pontos — igual às propostas de referência (596 x 842). */
export const PAGE_WIDTH = 595.28;
export const PAGE_HEIGHT = 841.89;

export const COLORS = {
  navy: '#1D3140',
  blue: '#64ABDE',
  blueInk: '#3E85B8',
  white: '#FFFFFF',
  ink: '#141414',
  inkSoft: '#41505C',
  paper: '#FFFFFF',
  /** Vão branco entre células — o "grid" das tabelas da peça atual. */
  cellGutter: '#FFFFFF',
} as const;

/**
 * Faixas de cor das páginas, medidas da arte original.
 * Capa e páginas de conteúdo têm chrome diferente.
 */
/**
 * As faixas do rodapé são ancoradas por `bottom`, não por `top`.
 *
 * Não é preciosismo: `top + height` calculado a partir da medição (842) estoura
 * a altura real do A4 (841,89) por centésimos, e o react-pdf trata qualquer
 * transbordo como quebra — o que gerava uma página em branco depois da capa.
 */
export const CHROME = {
  cover: {
    navyHeight: 193,
    blueBandTop: 193,
    blueBandHeight: 16.3,
    /** 765,7 → 831,9 na arte original. */
    footerBlueBottom: 10.1,
    footerBlueHeight: 66.2,
    footerNavyBottom: 0,
    footerNavyHeight: 9.6,
  },
  content: {
    navyHeight: 19.7,
    blueRuleTop: 20.2,
    blueRuleHeight: 11,
    /** 792,1 → 833,8 na arte original. */
    footerBlueBottom: 8.2,
    footerBlueHeight: 41.7,
    footerNavyBottom: 0,
    footerNavyHeight: 7.7,
  },
} as const;

/** Margem lateral do grid de conteúdo. Casa com a largura de tabela medida (518,5pt). */
export const MARGIN_X = 38;
export const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_X * 2;

/** Respiro acima/abaixo do conteúdo, já contando as faixas de chrome. */
export const CONTENT_PADDING_TOP = 44;
export const CONTENT_PADDING_BOTTOM = 64;

export const FONTS = {
  display: 'ONDisplay',
  text: 'ONText',
} as const;

/**
 * Escala tipográfica derivada das propostas de referência.
 * O traço marcante da peça é o título em caixa alta com `letterSpacing` alto.
 */
export const TYPE = {
  coverEyebrow: { size: 12, letterSpacing: 3.2 },
  coverTitle: { lineHeight: 1.12 },
  coverSubtitle: { size: 17 },
  coverMeta: { size: 13.5 },
  coverDate: { size: 15 },
  coverFooter: { size: 9.5, letterSpacing: 0.6 },

  sectionTitle: { size: 13.4, letterSpacing: 2.6 },
  sectionTitleLong: { size: 10.6, letterSpacing: 1.8 },
  tableLabel: { size: 9, letterSpacing: 2.2 },
  groupLabel: { size: 8.4, letterSpacing: 1.7 },

  blockHeading: { size: 10.4 },
  body: { size: 9.2, lineHeight: 1.5 },
  bullet: { size: 9.2, lineHeight: 1.45 },
  caption: { size: 7.6, letterSpacing: 0.4 },

  tableHead: { size: 8.2, letterSpacing: 0.5 },
  tableCell: { size: 8.2 },
  tableCellSmall: { size: 7.4 },
  tableEmphasis: { size: 10 },
  tableTotal: { size: 10.5 },

  pageNumber: { size: 8.6 },
} as const;

/** Vão branco entre células — medido em 1,6pt na arte original. */
export const TABLE_GUTTER = 1.6;
export const TABLE_CELL_PADDING_X = 4;
export const TABLE_CELL_PADDING_Y = 3.4;

/**
 * Distribui `CONTENT_WIDTH` entre colunas proporcionais, descontando os vãos.
 * Usar largura em pontos (e não percentual) evita erro de arredondamento
 * acumulado nas tabelas de muitas colunas.
 */
export function columnWidths(
  flex: readonly number[],
  totalWidth: number = CONTENT_WIDTH,
  gutter: number = TABLE_GUTTER,
): number[] {
  const available = totalWidth - gutter * (flex.length - 1);
  const sum = flex.reduce((acc, value) => acc + value, 0);
  return flex.map((value) => (value / sum) * available);
}
