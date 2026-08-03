import React from 'react';
import { Image, Page, StyleSheet, Text, View } from '@react-pdf/renderer';

import type { ProposalData } from '@/types/proposal';
import { CHROME, COLORS, FONTS, MARGIN_X, TYPE } from '../theme';
import { budgetLabel, dateBR, pad } from '../format';
import { CoverChrome } from '../components/chrome';

/**
 * CAPA — página própria, chrome próprio.
 *
 * Estrutura medida da peça atual: bloco navy de 193pt com o lockup da marca e
 * o wordmark "Proposta Comercial", faixa azul, corpo branco com o rótulo de
 * escopo, o título do empreendimento em caixa alta, subtítulo, dados do cliente
 * e do orçamento, e rodapé azul com os contatos.
 */

const styles = StyleSheet.create({
  page: {
    backgroundColor: COLORS.paper,
  },
  brandRow: {
    position: 'absolute',
    top: 40,
    left: MARGIN_X,
    right: MARGIN_X,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  logo: {
    height: 62,
    objectFit: 'contain',
  },
  wordmark: {
    fontFamily: FONTS.display,
    fontWeight: 700,
    fontSize: 44,
    color: COLORS.blue,
    letterSpacing: -1,
  },
  wordmarkSub: {
    fontFamily: FONTS.display,
    fontWeight: 600,
    fontSize: 9,
    letterSpacing: 4.4,
    color: COLORS.blue,
    marginTop: 2,
  },
  docLabelLight: {
    fontFamily: FONTS.display,
    fontWeight: 400,
    fontSize: 27,
    color: COLORS.blue,
    textAlign: 'right',
  },
  docLabelBold: {
    fontFamily: FONTS.display,
    fontWeight: 700,
    fontSize: 33,
    color: COLORS.blue,
    textAlign: 'right',
    marginTop: -6,
  },
  body: {
    position: 'absolute',
    top: 252,
    left: MARGIN_X,
    right: MARGIN_X,
  },
  eyebrow: {
    fontFamily: FONTS.display,
    fontWeight: 600,
    fontSize: TYPE.coverEyebrow.size,
    letterSpacing: TYPE.coverEyebrow.letterSpacing,
    color: COLORS.blue,
    textTransform: 'uppercase',
  },
  title: {
    fontFamily: FONTS.display,
    fontWeight: 700,
    color: COLORS.navy,
    textTransform: 'uppercase',
    lineHeight: TYPE.coverTitle.lineHeight,
    marginTop: 16,
  },
  subtitle: {
    fontFamily: FONTS.display,
    fontWeight: 600,
    fontSize: TYPE.coverSubtitle.size,
    color: COLORS.navy,
    marginTop: 22,
  },
  metaBlock: {
    marginTop: 24,
  },
  metaLine: {
    fontFamily: FONTS.text,
    fontWeight: 400,
    fontSize: TYPE.coverMeta.size,
    color: COLORS.navy,
    marginBottom: 5,
  },
  metaStrong: {
    fontFamily: FONTS.text,
    fontWeight: 600,
  },
  issuedAt: {
    position: 'absolute',
    bottom: CHROME.cover.footerBlueBottom + CHROME.cover.footerBlueHeight + 12,
    right: MARGIN_X,
    fontFamily: FONTS.display,
    fontWeight: 600,
    fontSize: TYPE.coverDate.size,
    color: COLORS.navy,
  },
  footerContact: {
    position: 'absolute',
    bottom: CHROME.cover.footerBlueBottom + CHROME.cover.footerBlueHeight / 2 - TYPE.coverFooter.size / 2,
    left: MARGIN_X,
    right: MARGIN_X,
    textAlign: 'center',
    fontFamily: FONTS.text,
    fontWeight: 600,
    fontSize: TYPE.coverFooter.size,
    letterSpacing: TYPE.coverFooter.letterSpacing,
    color: COLORS.white,
  },
});

/**
 * O título da capa é o elemento mais variável da peça (de 3 a 6 palavras longas
 * em caixa alta). A escala se adapta ao comprimento para nunca estourar o bloco
 * nem ficar pequeno demais num título curto.
 */
function titleSize(title: string): number {
  if (title.length <= 32) return 44;
  if (title.length <= 52) return 38;
  if (title.length <= 78) return 32;
  return 27;
}

function BrandLockup({ logoUrl, tradeName }: { logoUrl: string | null; tradeName: string }) {
  // eslint-disable-next-line jsx-a11y/alt-text -- `Image` do @react-pdf/renderer não é <img>: não existe prop `alt` no PDF.
  if (logoUrl) return <Image style={styles.logo} src={logoUrl} />;
  const [mark, ...rest] = tradeName.split(' ');
  return (
    <View>
      <Text style={styles.wordmark}>{mark.toUpperCase()}</Text>
      {rest.length > 0 ? (
        <Text style={styles.wordmarkSub}>{rest.join(' ').toUpperCase()}</Text>
      ) : null}
    </View>
  );
}

export function CoverPage({ data }: { data: ProposalData }) {
  const { header, company } = data;
  const contact = [company.phonePrimary, company.email].filter(Boolean).join('   |   ');

  return (
    <Page size="A4" style={styles.page}>
      <CoverChrome />

      <View style={styles.brandRow}>
        <BrandLockup logoUrl={company.logoUrl} tradeName={company.tradeName ?? company.legalName} />
        <View>
          <Text style={styles.docLabelLight}>Proposta</Text>
          <Text style={styles.docLabelBold}>Comercial</Text>
        </View>
      </View>

      <View style={styles.body}>
        <Text style={styles.eyebrow}>{header.scopeLabel}</Text>
        <Text style={[styles.title, { fontSize: titleSize(header.projectTitle) }]}>
          {header.projectTitle}
        </Text>
        {header.projectSubtitle ? (
          <Text style={styles.subtitle}>{header.projectSubtitle}</Text>
        ) : null}

        <View style={styles.metaBlock}>
          <Text style={styles.metaLine}>
            Cliente: <Text style={styles.metaStrong}>{header.clientName}</Text>
          </Text>
          <Text style={styles.metaLine}>Cidade: {header.city}</Text>
          <Text style={styles.metaLine}>
            Orçamento Nº: {budgetLabel(header.proposalNumber, header.issuedAt)}
          </Text>
          <Text style={styles.metaLine}>Versão {pad(header.version)}</Text>
        </View>
      </View>

      <Text style={styles.issuedAt}>{dateBR(header.issuedAt)}</Text>
      <Text style={styles.footerContact}>{contact}</Text>
    </Page>
  );
}
