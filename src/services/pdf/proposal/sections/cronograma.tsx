import React from 'react';
import { StyleSheet, Text, View } from '@react-pdf/renderer';

import { COLORS, CONTENT_WIDTH, FONTS, TYPE, columnWidths } from '../theme';
import { Cell, HeaderRow, Row, type TableColumn } from '../components/table';
import { SectionHeader } from '../components/typography';
import type { SectionComponent } from './types';

/**
 * CRONOGRAMA EXECUTIVO — página 9 da Maxif4.
 *
 * Grade de etapa × marco de prazo. `marks[colunaKey]` aceita `true` (marca X)
 * ou uma string livre, que a peça original usa para escrever "PROJETO APROVADO"
 * atravessando as colunas de prazo.
 */

const styles = StyleSheet.create({
  mark: {
    fontFamily: FONTS.display,
    fontWeight: 700,
    fontSize: TYPE.tableCell.size + 1,
    color: COLORS.white,
    textAlign: 'center',
  },
  markText: {
    fontFamily: FONTS.display,
    fontWeight: 600,
    fontSize: TYPE.tableCellSmall.size - 0.4,
    letterSpacing: 0.3,
    color: COLORS.white,
    textAlign: 'center',
  },
  footnote: {
    width: CONTENT_WIDTH,
    fontFamily: FONTS.text,
    fontWeight: 400,
    fontSize: TYPE.caption.size + 0.6,
    lineHeight: 1.4,
    color: COLORS.inkSoft,
    marginTop: 7,
  },
});

function MarkCell({ value }: { value: boolean | string | undefined }) {
  if (value === true) return <Text style={styles.mark}>X</Text>;
  if (typeof value === 'string' && value.trim()) {
    return <Text style={styles.markText}>{value.toUpperCase()}</Text>;
  }
  return <Text style={styles.mark}> </Text>;
}

export const CronogramaSection: SectionComponent = ({ data, config, tableNumber }) => {
  const { columns: scheduleColumns, rows: scheduleRows, footnote } = data.schedule;

  const columns: TableColumn[] = [
    { key: '__stage', label: 'Etapa', flex: 2.4, align: 'left' },
    ...scheduleColumns.map((column) => ({
      key: column.key,
      label: column.label,
      flex: 1,
      align: 'center' as const,
    })),
  ];
  const widths = columnWidths(columns.map((column) => column.flex));
  const rows = [...scheduleRows].sort((a, b) => a.order - b.order);

  return (
    <View>
      <SectionHeader
        title={config.title}
        tableLabel={tableNumber ? `Tabela ${String(tableNumber).padStart(2, '0')}` : null}
      />

      <View style={{ width: CONTENT_WIDTH }}>
        <HeaderRow columns={columns} widths={widths} minHeight={24} />

        {rows.map((row, rowIndex) => (
          <Row key={`etapa-${rowIndex}`}>
            <Cell width={widths[0]} align="left">
              {row.stage}
            </Cell>
            {scheduleColumns.map((column, columnIndex) => (
              <Cell
                key={`${rowIndex}-${column.key}`}
                width={widths[columnIndex + 1]}
                last={columnIndex === scheduleColumns.length - 1}
              >
                <MarkCell value={row.marks[column.key]} />
              </Cell>
            ))}
          </Row>
        ))}
      </View>

      {footnote ? <Text style={styles.footnote}>{footnote}</Text> : null}
    </View>
  );
};
