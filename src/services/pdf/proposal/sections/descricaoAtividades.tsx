import React from 'react';
import { StyleSheet, Text, View } from '@react-pdf/renderer';

import { COLORS, FONTS, TYPE } from '../theme';
import { Bullet, Paragraph, RichBlock, SectionHeader } from '../components/typography';
import type { SectionComponent } from './types';

/**
 * DESCRIÇÃO DAS ATIVIDADES.
 *
 * Cada `ProposalActivityGroup` vira um bloco numerado com título, parágrafo de
 * abertura, lista de serviços e uma observação técnica opcional.
 *
 * Os `facts` do grupo NÃO são renderizados: eles existem no contrato para
 * alimentar o prompt da IA com os quantitativos fechados do orçamento. A prosa
 * já chega aqui com os números embutidos — é essa separação que impede o
 * "05 (seis) transformadores" da proposta da Andora.
 */

const styles = StyleSheet.create({
  // Respiro por margem superior: margem inferior sobrando no pé da página vira
  // caixa vazia empurrada para a folha seguinte (página fantasma).
  groupGap: {
    marginTop: 18,
  },
  groupTitle: {
    fontFamily: FONTS.display,
    fontWeight: 600,
    fontSize: TYPE.blockHeading.size,
    color: COLORS.navy,
    marginBottom: 7,
  },
  note: {
    marginTop: 4,
    paddingLeft: 9,
    borderLeftWidth: 2,
    borderLeftColor: COLORS.blue,
  },
});

export const DescricaoAtividadesSection: SectionComponent = ({ data, config }) => {
  const groups = [...data.activities].sort((a, b) => a.order - b.order);

  return (
    <View>
      <SectionHeader title={config.title} />
      {groups.map((group, index) => (
        <View key={`atividade-${group.order}-${index}`} style={index === 0 ? {} : styles.groupGap}>
          {/*
            Título e parágrafo de abertura viajam juntos. `minPresenceAhead` não
            resolveria: o react-pdf ignora a propriedade no primeiro filho de um
            container, e o título é exatamente isso — ficava sozinho no pé da
            página com o texto do grupo abrindo a folha seguinte.
          */}
          <View wrap={false}>
            <Text style={styles.groupTitle}>{group.title}</Text>
            {group.intro ? <Paragraph>{group.intro}</Paragraph> : null}
          </View>
          {group.items.map((item, itemIndex) => (
            <Bullet key={`item-${itemIndex}`}>{item}</Bullet>
          ))}
          {group.note ? <RichBlock block={group.note} style={styles.note} emphasizeLeadIn /> : null}
        </View>
      ))}
    </View>
  );
};
