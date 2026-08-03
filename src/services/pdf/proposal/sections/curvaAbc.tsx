import React from 'react';
import { StyleSheet, Text, View } from '@react-pdf/renderer';

import type { ProposalAbcRow } from '@/types/proposal';
import { COLORS, CONTENT_WIDTH, FONTS, TABLE_GUTTER, TYPE, columnWidths } from '../theme';
import { brl, percent } from '../format';
import { BandRow, Cell, HeaderRow, Row, type TableColumn } from '../components/table';
import { SectionHeader } from '../components/typography';
import type { SectionComponent } from './types';

/**
 * CURVA DE PREÇOS DOS MATERIAIS (ABC).
 *
 * Reproduz a tabela da peça atual: descrição / valor / percentual à esquerda e,
 * à direita, uma célula mesclada por curva com o subtotal e o percentual da
 * curva — exatamente o "SUBDIVISÃO VALORES" com "CURVA A / R$ 655.248,47 /
 * 68,41%" da Andora.
 *
 * DIVERGÊNCIA CONSCIENTE: na peça original existe ainda uma 5ª coluna com o
 * total geral mesclada na altura inteira da tabela. Uma célula que atravessa a
 * tabela toda não sobrevive a uma quebra de página, então o total geral saiu
 * como faixa de largura total no pé — mesma informação, paginação correta.
 */

const COLUMNS: TableColumn[] = [
  { key: 'label', label: 'Descrição', flex: 1.35, align: 'left' },
  { key: 'amount', label: 'Valor', flex: 0.93, align: 'right' },
  { key: 'percent', label: 'Percentual', flex: 0.86 },
  { key: 'curve', label: 'Subdivisão valores', flex: 1.24 },
];

const styles = StyleSheet.create({
  curveName: {
    fontFamily: FONTS.display,
    fontWeight: 600,
    fontSize: TYPE.tableEmphasis.size,
    letterSpacing: 1.4,
    color: COLORS.white,
    textAlign: 'center',
  },
  curveAmount: {
    fontFamily: FONTS.display,
    fontWeight: 700,
    fontSize: TYPE.tableTotal.size,
    color: COLORS.white,
    textAlign: 'center',
    marginTop: 3,
  },
  curvePercent: {
    fontFamily: FONTS.display,
    fontWeight: 600,
    fontSize: TYPE.tableEmphasis.size,
    color: COLORS.white,
    textAlign: 'center',
    marginTop: 2,
  },
  totalLabel: {
    flex: 1,
    fontFamily: FONTS.display,
    fontWeight: 700,
    fontSize: TYPE.tableTotal.size,
    letterSpacing: 0.8,
    color: COLORS.white,
    textTransform: 'uppercase',
  },
  totalAmount: {
    fontFamily: FONTS.display,
    fontWeight: 700,
    fontSize: TYPE.tableTotal.size,
    color: COLORS.white,
  },
  totalPercent: {
    fontFamily: FONTS.display,
    fontWeight: 600,
    fontSize: TYPE.tableEmphasis.size,
    color: COLORS.white,
    marginLeft: 12,
    width: 46,
    textAlign: 'right',
  },
  cellCompact: {
    fontSize: TYPE.tableCellSmall.size + 0.4,
  },
});

const CURVE_ORDER: Array<'A' | 'B' | 'C'> = ['A', 'B', 'C'];

export const CurvaAbcSection: SectionComponent = ({ data, config, tableNumber }) => {
  const { abc } = data;
  const widths = columnWidths(COLUMNS.map((column) => column.flex));
  // A coluna da curva é irmã da pilha de linhas, então a pilha precisa saber
  // sua largura exata (as 3 primeiras colunas + os 2 vãos entre elas).
  const stackWidth = widths[0] + widths[1] + widths[2] + TABLE_GUTTER * 2;

  const groups = CURVE_ORDER.map((curve) => ({
    curve,
    rows: abc.rows
      .filter((row) => row.curve === curve)
      .sort((a, b) => a.order - b.order),
    total: abc.totals.find((total) => total.curve === curve) ?? null,
  })).filter((group) => group.rows.length > 0);

  return (
    <View>
      <SectionHeader
        title={config.title}
        tableLabel={tableNumber ? `Tabela ${String(tableNumber).padStart(2, '0')}` : null}
      />

      <View style={{ width: CONTENT_WIDTH }}>
        <HeaderRow columns={COLUMNS} widths={widths} minHeight={24} />

        {groups.map((group) => (
          <View
            key={`curva-${group.curve}`}
            style={{ flexDirection: 'row', marginBottom: TABLE_GUTTER }}
            // Um grupo de curva não é quebrado no meio: o valor mesclado à
            // direita precisa acompanhar suas próprias linhas.
            wrap={false}
          >
            <View style={{ width: stackWidth }}>
              {group.rows.map((row: ProposalAbcRow, index) => (
                <Row
                  key={`abc-${group.curve}-${index}`}
                  style={index === group.rows.length - 1 ? { marginBottom: 0 } : {}}
                >
                  <Cell width={widths[0]} align="left" textStyle={styles.cellCompact}>
                    {row.label}
                  </Cell>
                  <Cell width={widths[1]} align="right" textStyle={styles.cellCompact}>
                    {brl(row.amount)}
                  </Cell>
                  <Cell width={widths[2]} textStyle={styles.cellCompact} last>
                    {percent(row.percent)}
                  </Cell>
                </Row>
              ))}
            </View>

            <Cell width={widths[3]} tone="emphasis" last>
              <Text style={styles.curveName}>{`Curva ${group.curve}`}</Text>
              {group.total ? (
                <>
                  <Text style={styles.curveAmount}>{brl(group.total.amount)}</Text>
                  <Text style={styles.curvePercent}>{percent(group.total.percent)}</Text>
                </>
              ) : null}
            </Cell>
          </View>
        ))}

        <BandRow style={{ marginTop: TABLE_GUTTER * 2 }}>
          <Text style={styles.totalLabel}>Total geral dos materiais</Text>
          <Text style={styles.totalAmount}>{brl(abc.grandTotal)}</Text>
          <Text style={styles.totalPercent}>{percent(100)}</Text>
        </BandRow>
      </View>
    </View>
  );
};

