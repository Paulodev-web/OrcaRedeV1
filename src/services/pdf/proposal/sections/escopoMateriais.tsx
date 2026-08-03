import React from 'react';
import { StyleSheet, Text, View } from '@react-pdf/renderer';

import type { ProposalMaterialRow } from '@/types/proposal';
import { COLORS, CONTENT_WIDTH, FONTS, TABLE_GUTTER, TYPE, columnWidths } from '../theme';
import { brl, decimal, quantity } from '../format';
import { BandRow, Cell, HeaderRow, Row, type TableColumn } from '../components/table';
import { SectionHeader } from '../components/typography';
import type { SectionComponent } from './types';

/**
 * ESCOPO DOS MATERIAIS SUBDIVIDIDOS.
 *
 * "Subdivididos" é o consolidado por subgrupo: cada subgrupo abre uma faixa
 * navy com seu subtotal, as linhas de material vêm em células azuis, e o total
 * geral fecha a tabela.
 *
 * É a tabela mais longa da peça — quebra entre páginas repetindo o cabeçalho
 * (`HeaderRow` é `fixed`). Na proposta original esta página era um print de
 * planilha coladoem cima da arte; aqui é tabela de verdade, paginada.
 */

const styles = StyleSheet.create({
  subgroupLabel: {
    flex: 1,
    fontFamily: FONTS.display,
    fontWeight: 600,
    fontSize: TYPE.tableHead.size + 0.4,
    letterSpacing: 0.6,
    color: COLORS.white,
    textTransform: 'uppercase',
  },
  subgroupAmount: {
    fontFamily: FONTS.display,
    fontWeight: 700,
    fontSize: TYPE.tableEmphasis.size - 0.6,
    color: COLORS.white,
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
  cellSmall: {
    fontSize: TYPE.tableCellSmall.size,
  },
});

interface MaterialGroup {
  label: string;
  rows: ProposalMaterialRow[];
  subtotal: number;
}

/** Agrupa por subgrupo preservando a ordem de primeira aparição. */
function groupBySubgroup(rows: ProposalMaterialRow[]): MaterialGroup[] {
  const groups = new Map<string, MaterialGroup>();
  for (const row of rows) {
    const label = row.subgroup ?? 'Sem subgrupo';
    const group = groups.get(label);
    if (group) {
      group.rows.push(row);
      group.subtotal += row.subtotal;
    } else {
      groups.set(label, { label, rows: [row], subtotal: row.subtotal });
    }
  }
  return [...groups.values()];
}

function buildColumns(showCode: boolean): TableColumn[] {
  const columns: TableColumn[] = [];
  if (showCode) columns.push({ key: 'code', label: 'Código', flex: 0.82, align: 'left' });
  columns.push(
    { key: 'name', label: 'Descrição do material', flex: showCode ? 3.05 : 3.7, align: 'left' },
    { key: 'unit', label: 'Un', flex: 0.42 },
    { key: 'quantity', label: 'Qtd', flex: 0.62, align: 'right' },
    { key: 'unitPrice', label: 'Valor unit.', flex: 0.98, align: 'right' },
    { key: 'subtotal', label: 'Subtotal', flex: 1.12, align: 'right' },
  );
  return columns;
}

export const EscopoMateriaisSection: SectionComponent = ({ data, config, tableNumber }) => {
  const groups = groupBySubgroup(data.materials);
  const total = data.materials.reduce((acc, row) => acc + row.subtotal, 0);
  const itemCount = data.materials.length;

  // A coluna de código só entra quando existe código para mostrar — evita uma
  // coluna vazia ocupando largura útil da tabela.
  const showCode = data.materials.some((row) => Boolean(row.code));
  const columns = buildColumns(showCode);
  const widths = columnWidths(columns.map((column) => column.flex));

  return (
    <View>
      <SectionHeader
        title={config.title}
        tableLabel={tableNumber ? `Tabela ${String(tableNumber).padStart(2, '0')}` : null}
      />

      <View style={{ width: CONTENT_WIDTH }}>
        <HeaderRow columns={columns} widths={widths} minHeight={20} />

        {groups.map((group, groupIndex) => (
          <View key={`subgrupo-${groupIndex}`}>
            <BandRow>
              <Text style={styles.subgroupLabel}>{group.label}</Text>
              <Text style={styles.subgroupAmount}>{brl(group.subtotal)}</Text>
            </BandRow>

            {group.rows.map((row, rowIndex) => (
              <Row key={`material-${groupIndex}-${rowIndex}`}>
                {showCode ? (
                  <Cell width={widths[0]} align="left" textStyle={styles.cellSmall}>
                    {row.code ?? '—'}
                  </Cell>
                ) : null}
                <Cell
                  width={widths[showCode ? 1 : 0]}
                  align="left"
                  textStyle={styles.cellSmall}
                >
                  {row.name}
                </Cell>
                <Cell width={widths[showCode ? 2 : 1]} textStyle={styles.cellSmall}>
                  {row.unit}
                </Cell>
                <Cell width={widths[showCode ? 3 : 2]} align="right" textStyle={styles.cellSmall}>
                  {quantity(row.quantity)}
                </Cell>
                <Cell width={widths[showCode ? 4 : 3]} align="right" textStyle={styles.cellSmall}>
                  {brl(row.unitPrice)}
                </Cell>
                <Cell
                  width={widths[showCode ? 5 : 4]}
                  align="right"
                  textStyle={styles.cellSmall}
                  last
                >
                  {brl(row.subtotal)}
                </Cell>
              </Row>
            ))}
          </View>
        ))}

        <BandRow style={{ marginTop: TABLE_GUTTER * 2 }}>
          <Text style={styles.totalLabel}>
            {`Total geral — ${decimal(itemCount, 0)} ${itemCount === 1 ? 'item' : 'itens'}`}
          </Text>
          <Text style={styles.totalAmount}>{brl(total)}</Text>
        </BandRow>
      </View>
    </View>
  );
};
