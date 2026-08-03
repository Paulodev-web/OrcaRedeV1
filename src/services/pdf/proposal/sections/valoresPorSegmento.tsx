import React from 'react';
import { StyleSheet, Text, View } from '@react-pdf/renderer';

import { COLORS, CONTENT_WIDTH, FONTS, TABLE_GUTTER, TYPE, columnWidths } from '../theme';
import { brl, percent } from '../format';
import { Cell, HeaderRow, Row, type TableColumn } from '../components/table';
import { PricingOptionLabel } from '../components/pricingOption';
import { SectionHeader } from '../components/typography';
import { shouldLabelPricingOptions, type SectionComponent } from './types';

/**
 * VALORES GLOBAIS DE MATERIAL E MÃO DE OBRA POR SEGMENTO.
 *
 * Espelha a TABELA 03 da Andora: uma linha por segmento de obra (Rede Energia,
 * Ramais de Ligação + Lógica, Rede Iluminação), com material e mão de obra
 * separados — a mesma separação que sustenta a regra de faturamento (material
 * direto do fornecedor, serviço faturado pela ON).
 */

const COLUMNS: TableColumn[] = [
  { key: 'label', label: 'Descrição', flex: 1.29, align: 'left' },
  { key: 'material', label: 'Material', flex: 0.99, align: 'right' },
  { key: 'labor', label: 'Mão de obra', flex: 0.94, align: 'right' },
  { key: 'total', label: 'Total', flex: 1.04, align: 'right' },
  { key: 'percent', label: 'Percentual', flex: 1.13 },
];

const styles = StyleSheet.create({
  // Margem superior, nunca inferior (ver nota em ProposalDocument.tsx).
  optionBlockGap: {
    marginTop: 18,
  },
  totalText: {
    fontFamily: FONTS.display,
    fontWeight: 700,
    fontSize: TYPE.tableEmphasis.size,
    color: COLORS.white,
  },
});

export const ValoresPorSegmentoSection: SectionComponent = ({ data, config, tableNumber }) => {
  const widths = columnWidths(COLUMNS.map((column) => column.flex));
  const labelOptions = shouldLabelPricingOptions(data);

  return (
    <View>
      <SectionHeader
        title={config.title}
        tableLabel={tableNumber ? `Tabela ${String(tableNumber).padStart(2, '0')}` : null}
      />

      {data.pricingOptions.map((option, optionIndex) => {
        const segments = [...option.segments].sort((a, b) => a.order - b.order);
        if (segments.length === 0) return null;

        return (
          <View key={`segmentos-${optionIndex}`} style={optionIndex === 0 ? {} : styles.optionBlockGap}>
            <PricingOptionLabel option={option} visible={labelOptions} />

            <View style={{ width: CONTENT_WIDTH }}>
              <HeaderRow columns={COLUMNS} widths={widths} minHeight={22} />

              {segments.map((segment, index) => (
                <Row key={`segmento-${optionIndex}-${index}`}>
                  <Cell width={widths[0]} align="left">
                    {segment.label}
                  </Cell>
                  <Cell width={widths[1]} align="right">
                    {brl(segment.materialAmount)}
                  </Cell>
                  <Cell width={widths[2]} align="right">
                    {brl(segment.laborAmount)}
                  </Cell>
                  <Cell width={widths[3]} align="right">
                    {brl(segment.totalAmount)}
                  </Cell>
                  <Cell width={widths[4]} last>
                    {percent(segment.percent)}
                  </Cell>
                </Row>
              ))}

              <Row style={{ marginTop: TABLE_GUTTER, marginBottom: 0 }}>
                <Cell width={widths[0]} align="left" tone="total">
                  <Text style={styles.totalText}>Total geral</Text>
                </Cell>
                <Cell width={widths[1]} align="right" tone="total">
                  <Text style={styles.totalText}>{brl(option.globals.materialTotal)}</Text>
                </Cell>
                <Cell width={widths[2]} align="right" tone="total">
                  <Text style={styles.totalText}>{brl(option.globals.laborTotal)}</Text>
                </Cell>
                <Cell width={widths[3]} align="right" tone="total">
                  <Text style={styles.totalText}>{brl(option.globals.grandTotal)}</Text>
                </Cell>
                <Cell width={widths[4]} tone="total" last>
                  <Text style={styles.totalText}>{percent(100, 0)}</Text>
                </Cell>
              </Row>
            </View>
          </View>
        );
      })}
    </View>
  );
};
