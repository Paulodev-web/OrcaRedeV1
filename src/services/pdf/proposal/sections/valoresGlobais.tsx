import React from 'react';
import { StyleSheet, Text, View } from '@react-pdf/renderer';

import { COLORS, CONTENT_WIDTH, FONTS, TABLE_GUTTER, TYPE, columnWidths } from '../theme';
import { brl } from '../format';
import { Cell, HeaderRow, Row, type TableColumn } from '../components/table';
import { PricingOptionLabel } from '../components/pricingOption';
import { SectionHeader } from '../components/typography';
import { shouldLabelPricingOptions, type SectionComponent } from './types';

/**
 * VALORES GLOBAIS — TABELA 04 da Andora.
 *
 * Três linhas apenas: material global (faturamento direto do fornecedor),
 * mão de obra global (o VS da precificação, faturado pela ON) e o total geral.
 */

const COLUMNS: TableColumn[] = [
  { key: 'label', label: 'Descrição', flex: 2.4, align: 'left' },
  { key: 'value', label: 'Valor', flex: 1.6, align: 'right' },
];

const styles = StyleSheet.create({
  // Margem superior, nunca inferior (ver nota em ProposalDocument.tsx).
  optionBlockGap: {
    marginTop: 18,
  },
  totalText: {
    fontFamily: FONTS.display,
    fontWeight: 700,
    fontSize: TYPE.tableTotal.size + 1,
    color: COLORS.white,
  },
});

export const ValoresGlobaisSection: SectionComponent = ({ data, config, tableNumber }) => {
  const widths = columnWidths(COLUMNS.map((column) => column.flex));
  const labelOptions = shouldLabelPricingOptions(data);

  return (
    <View>
      <SectionHeader
        title={config.title}
        tableLabel={tableNumber ? `Tabela ${String(tableNumber).padStart(2, '0')}` : null}
      />

      {data.pricingOptions.map((option, optionIndex) => (
        <View key={`globais-${optionIndex}`} style={optionIndex === 0 ? {} : styles.optionBlockGap} wrap={false}>
          <PricingOptionLabel option={option} visible={labelOptions} />

          <View style={{ width: CONTENT_WIDTH }}>
            <HeaderRow columns={COLUMNS} widths={widths} minHeight={22} />

            <Row>
              <Cell width={widths[0]} align="left">
                Material global
              </Cell>
              <Cell width={widths[1]} align="right" last>
                {brl(option.globals.materialTotal)}
              </Cell>
            </Row>
            <Row>
              <Cell width={widths[0]} align="left">
                Mão de obra global
              </Cell>
              <Cell width={widths[1]} align="right" last>
                {brl(option.globals.laborTotal)}
              </Cell>
            </Row>

            <Row style={{ marginTop: TABLE_GUTTER, marginBottom: 0 }}>
              <Cell width={widths[0]} align="left" tone="total" minHeight={26}>
                <Text style={styles.totalText}>Total geral</Text>
              </Cell>
              <Cell width={widths[1]} align="right" tone="total" minHeight={26} last>
                <Text style={styles.totalText}>{brl(option.globals.grandTotal)}</Text>
              </Cell>
            </Row>
          </View>
        </View>
      ))}
    </View>
  );
};
