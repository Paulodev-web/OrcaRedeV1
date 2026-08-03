import React from 'react';
import { StyleSheet, Text, View } from '@react-pdf/renderer';

import type { ProposalRichBlock } from '@/types/proposal';
import { COLORS, FONTS, TYPE } from '../theme';
import type { PdfStyle } from '../styleTypes';

/**
 * Blocos de texto da peça.
 *
 * O traço tipográfico dominante das propostas de referência é o título em caixa
 * alta com `letterSpacing` largo, centralizado, em azul da marca. Reproduzido
 * aqui com fonte real espaçada — e não com espaços literais entre as letras,
 * que quebrariam a busca de texto no PDF.
 */

const styles = StyleSheet.create({
  sectionTitle: {
    fontFamily: FONTS.display,
    fontWeight: 600,
    color: COLORS.blue,
    textAlign: 'center',
    textTransform: 'uppercase',
  },
  tableLabel: {
    fontFamily: FONTS.display,
    fontWeight: 400,
    fontSize: TYPE.tableLabel.size,
    letterSpacing: TYPE.tableLabel.letterSpacing,
    color: COLORS.blue,
    textAlign: 'center',
    textTransform: 'uppercase',
    marginTop: 4,
  },
  groupLabel: {
    fontFamily: FONTS.display,
    fontWeight: 600,
    fontSize: TYPE.groupLabel.size,
    letterSpacing: TYPE.groupLabel.letterSpacing,
    color: COLORS.blue,
    textAlign: 'center',
    textTransform: 'uppercase',
  },
  blockHeading: {
    fontFamily: FONTS.display,
    fontWeight: 600,
    fontSize: TYPE.blockHeading.size,
    color: COLORS.navy,
    marginBottom: 5,
  },
  paragraph: {
    fontFamily: FONTS.text,
    fontWeight: 400,
    fontSize: TYPE.body.size,
    lineHeight: TYPE.body.lineHeight,
    color: COLORS.ink,
    textAlign: 'justify',
    marginBottom: 6,
  },
  bulletRow: {
    flexDirection: 'row',
    marginBottom: 3.5,
  },
  bulletMark: {
    fontFamily: FONTS.text,
    fontWeight: 700,
    fontSize: TYPE.bullet.size,
    lineHeight: TYPE.bullet.lineHeight,
    color: COLORS.blue,
    width: 12,
  },
  bulletText: {
    flex: 1,
    fontFamily: FONTS.text,
    fontWeight: 400,
    fontSize: TYPE.bullet.size,
    lineHeight: TYPE.bullet.lineHeight,
    color: COLORS.ink,
    textAlign: 'justify',
  },
  sectionHeader: {
    marginBottom: 12,
  },
  leadIn: {
    fontFamily: FONTS.text,
    fontWeight: 700,
    color: COLORS.navy,
  },
});

/**
 * Título de seção. Acima de ~34 caracteres cai para a escala reduzida, do mesmo
 * jeito que a peça original diminui o corpo em títulos longos (compare
 * "TERMO DE ACEITE" a 15,4pt com "VALORES GLOBAIS DE MATERIAL E MÃO DE OBRA POR
 * SEGMENTO" a 12pt).
 */
export function SectionTitle({ children }: { children: string }) {
  const long = children.length > 34;
  const scale = long ? TYPE.sectionTitleLong : TYPE.sectionTitle;
  return (
    <Text style={[styles.sectionTitle, { fontSize: scale.size, letterSpacing: scale.letterSpacing }]}>
      {children}
    </Text>
  );
}

/** Rótulo "TABELA 01" sob o título, em azul espaçado. */
export function TableLabel({ children }: { children: string }) {
  return <Text style={styles.tableLabel}>{children}</Text>;
}

/** Rótulo de agrupamento de mídia, ex.: "ESTRUTURAS CIVIL". */
export function GroupLabel({ children, style }: { children: string; style?: PdfStyle }) {
  return <Text style={[styles.groupLabel, style ?? {}]}>{children}</Text>;
}

/**
 * Cabeçalho de seção com título e rótulo de tabela opcional.
 * `minPresenceAhead` evita título órfão no pé da página.
 */
export function SectionHeader({
  title,
  tableLabel,
  minPresenceAhead = 60,
}: {
  title: string;
  tableLabel?: string | null;
  /** Altura que precisa existir logo abaixo para o título não ficar órfão. */
  minPresenceAhead?: number;
}) {
  return (
    <View style={styles.sectionHeader} minPresenceAhead={minPresenceAhead}>
      <SectionTitle>{title}</SectionTitle>
      {tableLabel ? <TableLabel>{tableLabel}</TableLabel> : null}
    </View>
  );
}

/**
 * Separa o "lead-in" de um parágrafo: o rótulo curto antes do primeiro
 * dois-pontos, que na peça atual aparece em negrito ("Faturamento Direto:",
 * "Precisão Cirúrgica no Orçamento:"). Só considera lead-in quando o trecho é
 * curto e não contém pontuação de fim de frase — assim "Nota: o valor é X. Y: Z"
 * não vira negrito no lugar errado.
 */
function splitLeadIn(text: string): { lead: string; rest: string } | null {
  const index = text.indexOf(':');
  if (index <= 0 || index > 48) return null;
  const lead = text.slice(0, index);
  if (/[.!?;]/.test(lead)) return null;
  return { lead, rest: text.slice(index + 1) };
}

function LeadInText({ text, leadStyle }: { text: string; leadStyle: PdfStyle }) {
  const parts = splitLeadIn(text);
  if (!parts) return <>{text}</>;
  return (
    <>
      <Text style={leadStyle}>{`${parts.lead}:`}</Text>
      {parts.rest}
    </>
  );
}

export function Paragraph({
  children,
  style,
  emphasizeLeadIn = false,
}: {
  children: React.ReactNode;
  style?: PdfStyle;
  emphasizeLeadIn?: boolean;
}) {
  const content =
    emphasizeLeadIn && typeof children === 'string' ? (
      <LeadInText text={children} leadStyle={styles.leadIn} />
    ) : (
      children
    );
  return <Text style={[styles.paragraph, style ?? {}]}>{content}</Text>;
}

export function Bullet({
  children,
  style,
  emphasizeLeadIn = false,
}: {
  children: React.ReactNode;
  style?: PdfStyle;
  emphasizeLeadIn?: boolean;
}) {
  const content =
    emphasizeLeadIn && typeof children === 'string' ? (
      <LeadInText text={children} leadStyle={styles.leadIn} />
    ) : (
      children
    );
  return (
    <View style={styles.bulletRow} wrap={false}>
      <Text style={styles.bulletMark}>•</Text>
      <Text style={[styles.bulletText, style ?? {}]}>{content}</Text>
    </View>
  );
}

/**
 * Renderiza um `ProposalRichBlock`. O contrato separa heading, parágrafos e
 * bullets justamente para o motor de PDF poder paginar cada peça — nunca
 * receber markdown em string única.
 */
export function RichBlock({
  block,
  style,
  showHeading = true,
  emphasizeLeadIn = false,
}: {
  block: ProposalRichBlock | null | undefined;
  style?: PdfStyle;
  showHeading?: boolean;
  emphasizeLeadIn?: boolean;
}) {
  if (!block) return null;
  const hasContent =
    Boolean(block.heading) || block.paragraphs.length > 0 || block.bullets.length > 0;
  if (!hasContent) return null;

  const heading = showHeading && block.heading ? block.heading : null;
  const [firstParagraph, ...restParagraphs] = block.paragraphs;

  return (
    <View style={style ?? {}}>
      {/*
        O heading não pode ficar órfão no pé da página, então viaja num bloco
        indivisível com o primeiro parágrafo. `minPresenceAhead` não serve aqui:
        o react-pdf ignora a propriedade quando o elemento é o primeiro filho do
        seu container — que é justamente o caso de um heading.
      */}
      {heading ? (
        <View wrap={false}>
          <Text style={styles.blockHeading}>{heading}</Text>
          {firstParagraph ? (
            <Paragraph emphasizeLeadIn={emphasizeLeadIn}>{firstParagraph}</Paragraph>
          ) : null}
        </View>
      ) : null}
      {(heading ? restParagraphs : block.paragraphs).map((paragraph, index) => (
        <Paragraph key={`p-${index}`} emphasizeLeadIn={emphasizeLeadIn}>
          {paragraph}
        </Paragraph>
      ))}
      {block.bullets.map((bullet, index) => (
        <Bullet key={`b-${index}`} emphasizeLeadIn={emphasizeLeadIn}>
          {bullet}
        </Bullet>
      ))}
    </View>
  );
}

export function hasRichBlockContent(block: ProposalRichBlock | null | undefined): boolean {
  if (!block) return false;
  return Boolean(block.heading) || block.paragraphs.length > 0 || block.bullets.length > 0;
}

export const textStyles = styles;
