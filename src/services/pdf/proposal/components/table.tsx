import React from 'react';
import { StyleSheet, Text, View } from '@react-pdf/renderer';

import {
  COLORS,
  CONTENT_WIDTH,
  FONTS,
  TABLE_CELL_PADDING_X,
  TABLE_CELL_PADDING_Y,
  TABLE_GUTTER,
  TYPE,
  columnWidths,
} from '../theme';
import type { PdfStyle } from '../styleTypes';

/**
 * Primitivas de tabela no padrão visual da peça atual: célula preenchida em
 * azul da marca, texto branco e um vão branco de ~1,6pt separando as células
 * (não há linha de grade — o "traço" é o próprio respiro entre os blocos).
 *
 * Medido da arte original: colunas da curva ABC em 37,6 → 556,1pt, altura de
 * linha 15pt, cabeçalho 37,5pt, vão de 1,6pt.
 */

export type CellAlign = 'left' | 'center' | 'right';
export type CellTone = 'head' | 'body' | 'total' | 'emphasis' | 'plain';

export interface TableColumn {
  key: string;
  label: string;
  /** Peso proporcional da coluna dentro da largura total. */
  flex: number;
  align?: CellAlign;
}

const styles = StyleSheet.create({
  table: {
    width: CONTENT_WIDTH,
  },
  row: {
    flexDirection: 'row',
    marginBottom: TABLE_GUTTER,
  },
  cell: {
    justifyContent: 'center',
    paddingHorizontal: TABLE_CELL_PADDING_X,
    paddingVertical: TABLE_CELL_PADDING_Y,
    marginRight: TABLE_GUTTER,
  },
  cellLast: {
    marginRight: 0,
  },
  toneHead: { backgroundColor: COLORS.blue },
  toneBody: { backgroundColor: COLORS.blue },
  toneTotal: { backgroundColor: COLORS.navy },
  toneEmphasis: { backgroundColor: COLORS.navy },
  tonePlain: { backgroundColor: COLORS.white },

  textHead: {
    fontFamily: FONTS.display,
    fontWeight: 600,
    fontSize: TYPE.tableHead.size,
    letterSpacing: TYPE.tableHead.letterSpacing,
    color: COLORS.white,
    textTransform: 'uppercase',
  },
  textBody: {
    fontFamily: FONTS.text,
    fontWeight: 400,
    fontSize: TYPE.tableCell.size,
    color: COLORS.white,
  },
  textTotal: {
    fontFamily: FONTS.display,
    fontWeight: 700,
    fontSize: TYPE.tableTotal.size,
    color: COLORS.white,
  },
  textEmphasis: {
    fontFamily: FONTS.display,
    fontWeight: 600,
    fontSize: TYPE.tableEmphasis.size,
    color: COLORS.white,
  },
  textPlain: {
    fontFamily: FONTS.text,
    fontWeight: 400,
    fontSize: TYPE.tableCell.size,
    color: COLORS.ink,
  },
  bandRow: {
    flexDirection: 'row',
    marginBottom: TABLE_GUTTER,
    backgroundColor: COLORS.navy,
    paddingHorizontal: TABLE_CELL_PADDING_X + 2,
    paddingVertical: TABLE_CELL_PADDING_Y + 1,
    alignItems: 'center',
  },
  continuation: {
    fontFamily: FONTS.text,
    fontWeight: 400,
    fontSize: TYPE.caption.size,
    color: COLORS.blueInk,
    marginBottom: 3,
    textAlign: 'right',
  },
});

const toneBackground: Record<CellTone, PdfStyle> = {
  head: styles.toneHead,
  body: styles.toneBody,
  total: styles.toneTotal,
  emphasis: styles.toneEmphasis,
  plain: styles.tonePlain,
};

const toneText: Record<CellTone, PdfStyle> = {
  head: styles.textHead,
  body: styles.textBody,
  total: styles.textTotal,
  emphasis: styles.textEmphasis,
  plain: styles.textPlain,
};

export interface CellProps {
  width: number;
  align?: CellAlign;
  tone?: CellTone;
  last?: boolean;
  /** Altura mínima — usada para reproduzir o cabeçalho alto da peça original. */
  minHeight?: number;
  textStyle?: PdfStyle;
  style?: PdfStyle;
  children?: React.ReactNode;
}

/**
 * Célula. Quando `children` é texto, envolve em `<Text>` com o tom certo;
 * quando é elemento, apenas posiciona (permite empilhar duas linhas dentro de
 * uma célula, como "CURVA A" sobre o valor e o percentual).
 */
export function Cell({
  width,
  align = 'center',
  tone = 'body',
  last = false,
  minHeight,
  textStyle,
  style,
  children,
}: CellProps) {
  const isText = typeof children === 'string' || typeof children === 'number';
  const alignItems = align === 'left' ? 'flex-start' : align === 'right' ? 'flex-end' : 'center';

  return (
    <View
      style={[
        styles.cell,
        toneBackground[tone],
        { width, alignItems },
        minHeight ? { minHeight } : {},
        last ? styles.cellLast : {},
        style ?? {},
      ]}
    >
      {isText ? (
        <Text style={[toneText[tone], { textAlign: align }, textStyle ?? {}]}>{children}</Text>
      ) : (
        children
      )}
    </View>
  );
}

/** Texto extra dentro de uma célula composta (ex.: percentual sob o valor). */
export function CellText({
  children,
  tone = 'body',
  align = 'center',
  style,
}: {
  children: React.ReactNode;
  tone?: CellTone;
  align?: CellAlign;
  style?: PdfStyle;
}) {
  return <Text style={[toneText[tone], { textAlign: align }, style ?? {}]}>{children}</Text>;
}

export function Row({
  children,
  style,
  wrap = false,
  fixed = false,
}: {
  children: React.ReactNode;
  style?: PdfStyle;
  wrap?: boolean;
  fixed?: boolean;
}) {
  return (
    <View style={[styles.row, style ?? {}]} wrap={wrap} fixed={fixed}>
      {children}
    </View>
  );
}

/**
 * Cabeçalho da tabela. `fixed` faz o react-pdf repetir a linha no topo de cada
 * página em que a tabela continua — é o que atende ao requisito de tabela longa
 * quebrando entre páginas sem perder o cabeçalho.
 */
export function HeaderRow({
  columns,
  widths,
  minHeight = 22,
}: {
  columns: readonly TableColumn[];
  widths: number[];
  minHeight?: number;
}) {
  return (
    <Row fixed>
      {columns.map((column, index) => (
        <Cell
          key={column.key}
          width={widths[index]}
          align={column.align ?? 'center'}
          tone="head"
          minHeight={minHeight}
          last={index === columns.length - 1}
        >
          {column.label}
        </Cell>
      ))}
    </Row>
  );
}

/** Faixa navy de largura total — usada em subtotais e no total geral. */
export function BandRow({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: PdfStyle;
}) {
  return (
    <View style={[styles.bandRow, style ?? {}]} wrap={false}>
      {children}
    </View>
  );
}

export function Table({
  columns,
  children,
  headerMinHeight,
  width = CONTENT_WIDTH,
}: {
  columns: readonly TableColumn[];
  children: (widths: number[]) => React.ReactNode;
  headerMinHeight?: number;
  width?: number;
}) {
  const widths = columnWidths(
    columns.map((column) => column.flex),
    width,
  );
  return (
    <View style={[styles.table, { width }]}>
      <HeaderRow columns={columns} widths={widths} minHeight={headerMinHeight} />
      {children(widths)}
    </View>
  );
}

export const tableStyles = styles;
