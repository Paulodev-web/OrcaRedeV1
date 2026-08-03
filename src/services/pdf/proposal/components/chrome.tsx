import React from 'react';
import { StyleSheet, Text, View } from '@react-pdf/renderer';

import { CHROME, COLORS, FONTS, MARGIN_X, TYPE } from '../theme';
import { pageLabel } from '../format';

/**
 * Chrome das páginas de conteúdo: faixa navy no topo, filete azul, faixa azul
 * no rodapé com a paginação e um fio navy no pé. Geometria medida da arte
 * original — ver `CHROME.content` em `theme.ts`.
 */

const styles = StyleSheet.create({
  topNavy: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: CHROME.content.navyHeight,
    backgroundColor: COLORS.navy,
  },
  topBlue: {
    position: 'absolute',
    top: CHROME.content.blueRuleTop,
    left: 0,
    right: 0,
    height: CHROME.content.blueRuleHeight,
    backgroundColor: COLORS.blue,
  },
  footerBlue: {
    position: 'absolute',
    bottom: CHROME.content.footerBlueBottom,
    left: 0,
    right: 0,
    height: CHROME.content.footerBlueHeight,
    backgroundColor: COLORS.blue,
  },
  footerNavy: {
    position: 'absolute',
    bottom: CHROME.content.footerNavyBottom,
    left: 0,
    right: 0,
    height: CHROME.content.footerNavyHeight,
    backgroundColor: COLORS.navy,
  },
  pageNumber: {
    position: 'absolute',
    bottom:
      CHROME.content.footerBlueBottom +
      CHROME.content.footerBlueHeight / 2 -
      TYPE.pageNumber.size / 2,
    right: MARGIN_X - 24,
    fontFamily: FONTS.display,
    fontWeight: 400,
    fontSize: TYPE.pageNumber.size,
    color: COLORS.white,
  },
  coverNavy: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: CHROME.cover.navyHeight,
    backgroundColor: COLORS.navy,
  },
  coverBlueBand: {
    position: 'absolute',
    top: CHROME.cover.blueBandTop,
    left: 0,
    right: 0,
    height: CHROME.cover.blueBandHeight,
    backgroundColor: COLORS.blue,
  },
  coverFooterBlue: {
    position: 'absolute',
    bottom: CHROME.cover.footerBlueBottom,
    left: 0,
    right: 0,
    height: CHROME.cover.footerBlueHeight,
    backgroundColor: COLORS.blue,
  },
  coverFooterNavy: {
    position: 'absolute',
    bottom: CHROME.cover.footerNavyBottom,
    left: 0,
    right: 0,
    height: CHROME.cover.footerNavyHeight,
    backgroundColor: COLORS.navy,
  },
});

/**
 * Faixas de topo e rodapé + numeração. `fixed` faz repetir em todas as páginas
 * geradas pelo `<Page>` que flui — inclusive nas quebras automáticas de tabela.
 *
 * A capa é a página 1 do documento e entra na contagem, mas não exibe o rótulo
 * (idêntico às propostas de referência).
 */
export function ContentChrome({ showPageNumber = true }: { showPageNumber?: boolean }) {
  return (
    <>
      <View style={styles.topNavy} fixed />
      <View style={styles.topBlue} fixed />
      <View style={styles.footerBlue} fixed />
      <View style={styles.footerNavy} fixed />
      {showPageNumber ? (
        <Text
          style={styles.pageNumber}
          fixed
          render={({ pageNumber, totalPages }) => pageLabel(pageNumber, totalPages)}
        />
      ) : null}
    </>
  );
}

/** Faixas da capa: bloco navy alto com filete interno, banda azul e rodapé. */
export function CoverChrome() {
  return (
    <>
      <View style={styles.coverNavy} />
      <View style={styles.coverBlueBand} />
      <View style={styles.coverFooterBlue} />
      <View style={styles.coverFooterNavy} />
    </>
  );
}
