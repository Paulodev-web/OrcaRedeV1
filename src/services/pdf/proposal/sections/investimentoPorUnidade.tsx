import React from 'react';
import { StyleSheet, Text, View } from '@react-pdf/renderer';

import { COLORS, CONTENT_WIDTH, FONTS, TYPE } from '../theme';
import { brl, decimal } from '../format';
import { PricingOptionLabel } from '../components/pricingOption';
import { SectionHeader } from '../components/typography';
import { shouldLabelPricingOptions, type SectionComponent } from './types';

/**
 * VALOR DE INVESTIMENTO POR LOTE / UNIDADE — TABELA 05 da Andora.
 *
 * Bloco de uma linha só, e é assim de propósito: à esquerda a contagem
 * ("173 LOTES"), à direita o valor unitário em corpo grande. `unitsLabel` é
 * editável — pode ser lotes, unidades ou apartamentos.
 */

const styles = StyleSheet.create({
  // Margem superior, nunca inferior (ver nota em ProposalDocument.tsx).
  optionBlockGap: {
    marginTop: 18,
  },
  band: {
    width: CONTENT_WIDTH,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.blue,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  units: {
    fontFamily: FONTS.display,
    fontWeight: 600,
    fontSize: 15,
    letterSpacing: 1.2,
    color: COLORS.white,
    textTransform: 'uppercase',
  },
  amount: {
    fontFamily: FONTS.display,
    fontWeight: 700,
    fontSize: 19,
    letterSpacing: 0.8,
    color: COLORS.white,
  },
  note: {
    width: CONTENT_WIDTH,
    fontFamily: FONTS.text,
    fontWeight: 400,
    fontSize: TYPE.caption.size + 0.6,
    color: COLORS.inkSoft,
    marginTop: 4,
    textAlign: 'right',
  },
});

export const InvestimentoPorUnidadeSection: SectionComponent = ({ data, config, tableNumber }) => {
  const labelOptions = shouldLabelPricingOptions(data);

  return (
    <View>
      <SectionHeader
        title={config.title}
        tableLabel={tableNumber ? `Tabela ${String(tableNumber).padStart(2, '0')}` : null}
      />

      {data.pricingOptions.map((option, optionIndex) => {
        const unit = option.unitInvestment;
        if (!unit) return null;

        return (
          <View key={`unidade-${optionIndex}`} style={optionIndex === 0 ? {} : styles.optionBlockGap} wrap={false}>
            <PricingOptionLabel option={option} visible={labelOptions} />
            <View style={styles.band}>
              <Text style={styles.units}>
                {`${decimal(unit.unitsCount, 0)} ${unit.unitsLabel}`}
              </Text>
              <Text style={styles.amount}>{brl(unit.amountPerUnit)}</Text>
            </View>
            <Text style={styles.note}>
              {`Total de ${brl(option.globals.grandTotal)} dividido por ${decimal(unit.unitsCount, 0)} ${unit.unitsLabel}.`}
            </Text>
          </View>
        );
      })}
    </View>
  );
};
