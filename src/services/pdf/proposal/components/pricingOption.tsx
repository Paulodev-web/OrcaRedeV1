import React from 'react';
import { StyleSheet, Text, View } from '@react-pdf/renderer';

import type { ProposalPricingOption } from '@/types/proposal';
import { COLORS, FONTS, TYPE } from '../theme';

/**
 * Rótulo de cenário de preço. Só aparece quando a proposta apresenta mais de
 * uma opção ao cliente — no caso de opção única, o bloco de valores fica igual
 * ao das propostas de referência, sem chrome extra.
 */

const styles = StyleSheet.create({
  wrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 5,
  },
  label: {
    fontFamily: FONTS.display,
    fontWeight: 600,
    fontSize: TYPE.groupLabel.size + 0.6,
    letterSpacing: TYPE.groupLabel.letterSpacing,
    color: COLORS.navy,
    textTransform: 'uppercase',
  },
  badge: {
    marginLeft: 6,
    paddingHorizontal: 5,
    paddingVertical: 1.5,
    backgroundColor: COLORS.blue,
  },
  badgeText: {
    fontFamily: FONTS.display,
    fontWeight: 600,
    fontSize: 6.4,
    letterSpacing: 1.1,
    color: COLORS.white,
    textTransform: 'uppercase',
  },
});

export function PricingOptionLabel({
  option,
  visible,
}: {
  option: ProposalPricingOption;
  visible: boolean;
}) {
  if (!visible) return null;
  return (
    <View style={styles.wrapper} wrap={false}>
      <Text style={styles.label}>{option.label}</Text>
      {option.isRecommended ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>Recomendada</Text>
        </View>
      ) : null}
    </View>
  );
}
