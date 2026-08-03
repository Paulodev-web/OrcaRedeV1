import React from 'react';
import { StyleSheet, View } from '@react-pdf/renderer';

import type { ProposalRichBlock } from '@/types/proposal';
import { RichBlock, SectionTitle, hasRichBlockContent } from '../components/typography';
import type { SectionComponent } from './types';

/**
 * QUEM SOMOS / NOSSA IDENTIDADE / COMPROMISSO COM A QUALIDADE.
 *
 * Na Maxif4 os três blocos dividem a mesma página, cada um com seu próprio
 * título em caixa alta espaçada. O primeiro título vem de `config.title`; os
 * demais vêm do `heading` do próprio bloco, mantendo o texto institucional sob
 * controle do template (nada de rótulo cravado no código).
 */

const styles = StyleSheet.create({
  // Margem superior, nunca inferior (ver nota em ProposalDocument.tsx).
  blockGap: {
    marginTop: 20,
  },
  title: {
    marginBottom: 10,
  },
});

export const QuemSomosSection: SectionComponent = ({ data, config }) => {
  const { quemSomos, identidade, compromisso } = data.institutional;

  const blocks: Array<{ block: ProposalRichBlock | null; fallbackTitle: string }> = [
    { block: quemSomos, fallbackTitle: config.title },
    { block: identidade, fallbackTitle: 'Nossa Identidade' },
    { block: compromisso, fallbackTitle: 'Compromisso com a Qualidade' },
  ];

  return (
    <View>
      {blocks.map(({ block, fallbackTitle }, index) => {
        if (!hasRichBlockContent(block)) return null;
        return (
          <View key={`institucional-${index}`} style={index === 0 ? {} : styles.blockGap}>
            <View style={styles.title} minPresenceAhead={50}>
              <SectionTitle>{block?.heading ?? fallbackTitle}</SectionTitle>
            </View>
            {/* `showHeading={false}`: o heading já subiu para o título da seção. */}
            <RichBlock block={block} showHeading={false} emphasizeLeadIn />
          </View>
        );
      })}
    </View>
  );
};
