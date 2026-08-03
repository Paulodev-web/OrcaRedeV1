import React from 'react';
import { Image, StyleSheet, Text, View } from '@react-pdf/renderer';

import { COLORS, CONTENT_WIDTH, FONTS, TYPE } from '../theme';
import { budgetLabel, dateBR, pad } from '../format';
import { Paragraph, SectionHeader } from '../components/typography';
import type { SectionComponent } from './types';

/**
 * TERMO DE ACEITE — última página das duas propostas de referência.
 *
 * Anatomia: identificação do orçamento no canto, título, parágrafo de
 * fechamento, faixa de validade, bloco de assinatura do responsável técnico com
 * CREA, e os campos manuscritos (DATA / NOME / ASSINATURA / VALOR).
 *
 * Não existe aceite digital: o termo continua sendo página para assinatura à
 * mão, como manda a seção 9.2 do escopo.
 */

const styles = StyleSheet.create({
  identifier: {
    marginBottom: 10,
  },
  identifierLine: {
    fontFamily: FONTS.display,
    fontWeight: 600,
    fontSize: 11,
    color: COLORS.navy,
  },
  validityBand: {
    width: CONTENT_WIDTH,
    backgroundColor: COLORS.blue,
    paddingVertical: 8,
    marginTop: 18,
    marginBottom: 22,
  },
  validityText: {
    fontFamily: FONTS.display,
    fontWeight: 600,
    fontSize: 11,
    letterSpacing: 2.2,
    color: COLORS.white,
    textAlign: 'center',
    textTransform: 'uppercase',
  },
  signatureBlock: {
    alignItems: 'center',
    marginBottom: 24,
  },
  signatureImage: {
    height: 46,
    objectFit: 'contain',
    marginBottom: 2,
  },
  signatureRule: {
    width: 230,
    borderTopWidth: 0.8,
    borderTopColor: COLORS.navy,
    marginBottom: 5,
  },
  signatureName: {
    fontFamily: FONTS.display,
    fontWeight: 600,
    fontSize: 10.5,
    color: COLORS.navy,
  },
  signatureCrea: {
    fontFamily: FONTS.text,
    fontWeight: 400,
    fontSize: 9.5,
    color: COLORS.inkSoft,
    marginTop: 2,
  },
  fieldsBlock: {
    marginTop: 6,
  },
  fieldRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginBottom: 15,
  },
  fieldLabel: {
    fontFamily: FONTS.display,
    fontWeight: 600,
    fontSize: 8.4,
    letterSpacing: 1.8,
    color: COLORS.navy,
    textTransform: 'uppercase',
    width: 96,
  },
  fieldRule: {
    flex: 1,
    borderBottomWidth: 0.7,
    borderBottomColor: COLORS.navy,
    height: 12,
  },
  signOff: {
    fontFamily: FONTS.display,
    fontWeight: 600,
    fontSize: TYPE.blockHeading.size,
    color: COLORS.navy,
    marginTop: 10,
  },
});

const FIELDS = ['Data', 'Nome', 'Assinatura', 'Valor'];

export const TermoAceiteSection: SectionComponent = ({ data, config }) => {
  const { header, company, responsible, acceptance } = data;

  return (
    <View>
      <View style={styles.identifier}>
        <Text style={styles.identifierLine}>
          {`Orçamento Nº: ${budgetLabel(header.proposalNumber, header.issuedAt)}`}
        </Text>
        <Text style={styles.identifierLine}>{`Versão ${pad(header.version)}`}</Text>
      </View>

      <SectionHeader title={config.title} />

      {acceptance.closingText ? <Paragraph>{acceptance.closingText}</Paragraph> : null}
      <Text style={styles.signOff}>{company.tradeName ?? company.legalName}</Text>

      {header.validityDate ? (
        <View style={styles.validityBand} wrap={false}>
          <Text style={styles.validityText}>
            {`Validade da proposta: ${dateBR(header.validityDate)}`}
          </Text>
        </View>
      ) : null}

      {responsible ? (
        <View style={styles.signatureBlock} wrap={false}>
          {responsible.signatureUrl ? (
            // eslint-disable-next-line jsx-a11y/alt-text -- `Image` do @react-pdf/renderer não é <img>: não existe prop `alt` no PDF.
            <Image style={styles.signatureImage} src={responsible.signatureUrl} />
          ) : null}
          <View style={styles.signatureRule} />
          <Text style={styles.signatureName}>{responsible.fullName}</Text>
          <Text style={styles.signatureCrea}>{responsible.crea}</Text>
        </View>
      ) : null}

      <View style={styles.fieldsBlock}>
        {FIELDS.map((field) => (
          <View key={field} style={styles.fieldRow} wrap={false}>
            <Text style={styles.fieldLabel}>{field}:</Text>
            <View style={styles.fieldRule} />
          </View>
        ))}
      </View>
    </View>
  );
};
