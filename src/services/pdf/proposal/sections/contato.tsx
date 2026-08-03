import React from 'react';
import { Image, StyleSheet, Text, View } from '@react-pdf/renderer';

import { COLORS, CONTENT_WIDTH, FONTS } from '../theme';
import { SectionHeader } from '../components/typography';
import type { SectionComponent } from './types';

/**
 * CONTATO — bloco de rodapé institucional.
 *
 * Nas propostas de referência ele fecha a página do termo de aceite, com razão
 * social, CNPJ, endereço e canais. O contato inconsistente apontado na análise
 * (contato@ numa peça, projetos.on.engenharia@ na outra) deixa de existir: tudo
 * vem de `ProposalCompany`, fonte única das Configurações.
 */

const styles = StyleSheet.create({
  card: {
    width: CONTENT_WIDTH,
    backgroundColor: COLORS.navy,
    paddingHorizontal: 20,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
  },
  logo: {
    height: 44,
    width: 96,
    objectFit: 'contain',
    marginRight: 18,
  },
  info: {
    flex: 1,
  },
  legalName: {
    fontFamily: FONTS.display,
    fontWeight: 700,
    fontSize: 11.5,
    letterSpacing: 0.8,
    color: COLORS.white,
    textTransform: 'uppercase',
  },
  line: {
    fontFamily: FONTS.text,
    fontWeight: 400,
    fontSize: 8.6,
    lineHeight: 1.5,
    color: COLORS.white,
    marginTop: 3,
  },
  channels: {
    fontFamily: FONTS.text,
    fontWeight: 600,
    fontSize: 8.6,
    lineHeight: 1.45,
    color: COLORS.blue,
    marginTop: 3,
  },
});

export const ContatoSection: SectionComponent = ({ data, config }) => {
  const { company } = data;

  // Canais empilhados em linhas curtas, e não numa linha só separada por ponto.
  // Junto tudo numa linha, a quebra automática caía no meio de um endereço e o
  // motor de texto ainda inseria um hífen — coisa que não pode acontecer numa
  // peça que o cliente lê.
  const phones = [company.phonePrimary, company.phoneSecondary].filter(Boolean).join('   ·   ');
  const web = [company.website, company.instagram].filter(Boolean).join('   ·   ');

  return (
    <View wrap={false}>
      <SectionHeader title={config.title} />

      <View style={styles.card}>
        {/* eslint-disable-next-line jsx-a11y/alt-text -- `Image` do @react-pdf/renderer não é <img>: não existe prop `alt` no PDF. */}
        {company.logoUrl ? <Image style={styles.logo} src={company.logoUrl} /> : null}
        <View style={styles.info}>
          <Text style={styles.legalName}>{company.legalName}</Text>
          <Text style={styles.line}>{`CNPJ: ${company.cnpj}`}</Text>
          <Text style={styles.line}>{company.address}</Text>
          <Text style={styles.channels}>{company.email}</Text>
          {phones ? <Text style={styles.channels}>{phones}</Text> : null}
          {web ? <Text style={styles.channels}>{web}</Text> : null}
        </View>
      </View>
    </View>
  );
};
