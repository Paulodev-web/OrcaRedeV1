import React from 'react';
import { Document, Page, StyleSheet, View } from '@react-pdf/renderer';

import type { ProposalData, ProposalSectionConfig } from '@/types/proposal';

import {
  COLORS,
  CONTENT_PADDING_BOTTOM,
  CONTENT_PADDING_TOP,
  FONTS,
  MARGIN_X,
  TYPE,
} from './theme';
import { budgetLabel, pad } from './format';
import { ContentChrome } from './components/chrome';
import { CoverPage, SECTION_REGISTRY, type SectionDefinition } from './sections';

/**
 * Orquestração do documento.
 *
 * As seções são renderizadas na ordem de `sections[].order`, respeitando
 * `enabled`. Seções `kind: 'page'` (a capa) abrem uma `<Page>` própria; as
 * demais entram num fluxo contínuo dentro de uma `<Page wrap>`, que é o que
 * permite tabela longa quebrar entre páginas e seções curtas dividirem a mesma
 * folha — exatamente o comportamento das propostas de referência.
 */

const styles = StyleSheet.create({
  flowPage: {
    backgroundColor: COLORS.paper,
    paddingTop: CONTENT_PADDING_TOP,
    paddingBottom: CONTENT_PADDING_BOTTOM,
    paddingHorizontal: MARGIN_X,
    fontFamily: FONTS.text,
    fontSize: TYPE.body.size,
    color: COLORS.ink,
  },
  /**
   * O respiro entre seções é margem SUPERIOR, nunca inferior.
   *
   * Margem inferior que não cabe no resto da página gera uma página fantasma:
   * o react-pdf empurra a caixa vazia para a folha seguinte e a próxima seção,
   * que já pede quebra, vai para a folha depois dela.
   */
  section: {
    // Ver nota em `media.tsx`: sem `flexShrink: 0` a página comprime o último
    // bloco para caber, em vez de paginá-lo.
    flexShrink: 0,
  },
  sectionGap: {
    marginTop: 26,
    flexShrink: 0,
  },
});

interface RenderableSection {
  config: ProposalSectionConfig;
  definition: SectionDefinition;
  tableNumber?: number;
}

/** Sequência de blocos de página: a capa isola, o resto se agrupa em fluxo. */
type PageGroup =
  | { kind: 'cover'; section: RenderableSection }
  | { kind: 'flow'; sections: RenderableSection[] };

export function selectRenderableSections(data: ProposalData): RenderableSection[] {
  const enabled = data.sections
    .filter((section) => section.enabled)
    .sort((a, b) => a.order - b.order);

  let tableCounter = 0;

  return enabled
    .map<RenderableSection | null>((config) => {
      const definition = SECTION_REGISTRY[config.key];
      if (!definition || !definition.hasContent(data)) return null;
      // O número da tabela é atribuído na ordem de render — resolve a numeração
      // incoerente das peças manuais, onde "Tabela 01" mudava de significado.
      const tableNumber = definition.hasTable ? (tableCounter += 1) : undefined;
      return { config, definition, tableNumber };
    })
    .filter((section): section is RenderableSection => section !== null);
}

function groupIntoPages(sections: RenderableSection[]): PageGroup[] {
  const groups: PageGroup[] = [];

  for (const section of sections) {
    if (section.definition.kind === 'page') {
      groups.push({ kind: 'cover', section });
      continue;
    }
    const last = groups[groups.length - 1];
    if (last && last.kind === 'flow') {
      last.sections.push(section);
    } else {
      groups.push({ kind: 'flow', sections: [section] });
    }
  }

  return groups;
}

function FlowPage({ data, sections }: { data: ProposalData; sections: RenderableSection[] }) {
  return (
    <Page size="A4" style={styles.flowPage} wrap>
      <ContentChrome />
      {sections.map((section, index) => {
        const { Component, startsOnNewPage } = section.definition;
        if (!Component) return null;
        // Só quem continua na mesma página da anterior precisa de respiro;
        // quem abre folha já ganha o `paddingTop` da página.
        const needsGap = index > 0 && !startsOnNewPage;
        return (
          <View
            key={section.config.key}
            style={needsGap ? styles.sectionGap : styles.section}
            // A primeira seção do fluxo nunca quebra — quebrar aqui geraria
            // uma página em branco logo após a capa.
            break={index > 0 && startsOnNewPage}
          >
            <Component data={data} config={section.config} tableNumber={section.tableNumber} />
          </View>
        );
      })}
    </Page>
  );
}

export interface ProposalDocumentProps {
  data: ProposalData;
}

export function ProposalDocument({ data }: ProposalDocumentProps) {
  const sections = selectRenderableSections(data);
  const groups = groupIntoPages(sections);
  const reference = budgetLabel(data.header.proposalNumber, data.header.issuedAt);

  return (
    <Document
      title={`Proposta Comercial ${reference} v${pad(data.header.version)} — ${data.header.clientName}`}
      author={data.company.legalName}
      subject={data.header.projectTitle}
      creator="OrçaRede"
      producer="OrçaRede"
      language="pt-BR"
    >
      {groups.map((group, index) =>
        group.kind === 'cover' ? (
          <CoverPage key={`capa-${index}`} data={data} />
        ) : (
          <FlowPage key={`fluxo-${index}`} data={data} sections={group.sections} />
        ),
      )}
    </Document>
  );
}
