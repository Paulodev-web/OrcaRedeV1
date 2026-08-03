import React from 'react';
import { StyleSheet, View } from '@react-pdf/renderer';

import { RichBlock, SectionHeader } from '../components/typography';
import type { SectionComponent } from './types';

/**
 * Seções puramente textuais, todas alimentadas por `ProposalRichBlock`:
 *
 * - CONDIÇÕES DE FATURAMENTO E NEGOCIAÇÃO DE MATERIAIS
 * - CONSIDERAÇÕES FINAIS (normas, itens inclusos e escopo negativo)
 * - DIFERENCIAL TECNOLÓGICO: SISTEMA ORÇAREDE
 *
 * Todas usam `emphasizeLeadIn`, que põe em negrito o rótulo antes do primeiro
 * dois-pontos — é o traço das duas propostas de referência ("Faturamento
 * Direto:", "Precisão Cirúrgica no Orçamento:", "Solo Rochoso:").
 */

const styles = StyleSheet.create({
  // Margem superior, nunca inferior — evita página fantasma no fim da seção.
  blockGap: {
    marginTop: 14,
  },
});

export const CondicoesFaturamentoSection: SectionComponent = ({ data, config }) => (
  <View>
    <SectionHeader title={config.title} />
    <RichBlock block={data.billingConditions} showHeading={false} emphasizeLeadIn />
  </View>
);

export const ConsideracoesFinaisSection: SectionComponent = ({ data, config }) => (
  <View>
    <SectionHeader title={config.title} />
    {data.finalConsiderations.map((block, index) => (
      <RichBlock
        key={`consideracao-${index}`}
        block={block}
        style={index === 0 ? {} : styles.blockGap}
        emphasizeLeadIn
      />
    ))}
  </View>
);

export const DiferencialOrcaRedeSection: SectionComponent = ({ data, config }) => (
  <View>
    <SectionHeader title={config.title} />
    <RichBlock block={data.institutional.diferencialOrcaRede} showHeading={false} emphasizeLeadIn />
  </View>
);
