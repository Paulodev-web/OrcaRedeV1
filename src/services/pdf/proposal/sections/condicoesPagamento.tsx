import React from 'react';
import { StyleSheet, Text, View } from '@react-pdf/renderer';

import { COLORS, CONTENT_WIDTH, FONTS, TABLE_GUTTER, TYPE, columnWidths } from '../theme';
import { brl, pad, percent } from '../format';
import { Cell, HeaderRow, Row, type TableColumn } from '../components/table';
import { PricingOptionLabel } from '../components/pricingOption';
import { SectionHeader } from '../components/typography';
import { shouldLabelPricingOptions, type SectionComponent } from './types';

/**
 * CONDIÇÕES DE PAGAMENTO — TABELA 06 da Andora.
 *
 * O parcelamento incide SEMPRE sobre a mão de obra (`globals.laborTotal`),
 * nunca sobre material: nas duas propostas de referência o material é faturado
 * direto do fornecedor para o cliente, e os 10x são só sobre o VS da ON.
 * O rodapé da tabela deixa isso explícito para o cliente.
 */

const COLUMNS: TableColumn[] = [
  { key: 'order', label: 'Parcela', flex: 0.62 },
  { key: 'percent', label: 'Percentual', flex: 1.0 },
  { key: 'amount', label: 'Valor', flex: 1.35, align: 'right' },
  { key: 'due', label: 'Vencimento', flex: 1.55, align: 'left' },
];

const styles = StyleSheet.create({
  // Margem superior, nunca inferior (ver nota em ProposalDocument.tsx).
  optionBlockGap: {
    marginTop: 18,
  },
  totalText: {
    fontFamily: FONTS.display,
    fontWeight: 700,
    fontSize: TYPE.tableTotal.size,
    color: COLORS.white,
  },
  footnote: {
    width: CONTENT_WIDTH,
    fontFamily: FONTS.text,
    fontWeight: 400,
    fontSize: TYPE.caption.size + 0.6,
    color: COLORS.inkSoft,
    marginTop: 5,
  },
});

export const CondicoesPagamentoSection: SectionComponent = ({ data, config, tableNumber }) => {
  const widths = columnWidths(COLUMNS.map((column) => column.flex));
  const labelOptions = shouldLabelPricingOptions(data);

  return (
    <View>
      <SectionHeader
        title={config.title}
        tableLabel={tableNumber ? `Tabela ${String(tableNumber).padStart(2, '0')}` : null}
      />

      {data.pricingOptions.map((option, optionIndex) => {
        const terms = [...option.paymentTerms].sort((a, b) => a.order - b.order);
        if (terms.length === 0) return null;

        const totalPercent = terms.reduce((acc, term) => acc + term.percent, 0);
        const totalAmount = terms.reduce((acc, term) => acc + term.amount, 0);

        return (
          <View key={`pagamento-${optionIndex}`} style={optionIndex === 0 ? {} : styles.optionBlockGap}>
            <PricingOptionLabel option={option} visible={labelOptions} />

            <View style={{ width: CONTENT_WIDTH }}>
              <HeaderRow columns={COLUMNS} widths={widths} minHeight={22} />

              {terms.map((term, index) => (
                <Row key={`parcela-${optionIndex}-${index}`}>
                  <Cell width={widths[0]}>{pad(index + 1)}</Cell>
                  <Cell width={widths[1]}>{percent(term.percent)}</Cell>
                  <Cell width={widths[2]} align="right">
                    {brl(term.amount)}
                  </Cell>
                  <Cell width={widths[3]} align="left" last>
                    {term.dueLabel}
                  </Cell>
                </Row>
              ))}

              <Row style={{ marginTop: TABLE_GUTTER, marginBottom: 0 }}>
                <Cell width={widths[0]} tone="total">
                  <Text style={styles.totalText}> </Text>
                </Cell>
                <Cell width={widths[1]} tone="total">
                  <Text style={styles.totalText}>{percent(totalPercent)}</Text>
                </Cell>
                <Cell width={widths[2]} align="right" tone="total">
                  <Text style={styles.totalText}>{brl(totalAmount)}</Text>
                </Cell>
                <Cell width={widths[3]} align="left" tone="total" last>
                  <Text style={styles.totalText}>Total</Text>
                </Cell>
              </Row>
            </View>

            <Text style={styles.footnote}>
              {`O parcelamento incide exclusivamente sobre a mão de obra (${brl(option.globals.laborTotal)}). ` +
                `Os materiais (${brl(option.globals.materialTotal)}) são faturados diretamente do fornecedor para a Contratante.`}
            </Text>
          </View>
        );
      })}
    </View>
  );
};
