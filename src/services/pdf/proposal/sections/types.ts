import type React from 'react';

import type {
  ProposalData,
  ProposalPricingOption,
  ProposalSectionConfig,
  ProposalSectionKey,
} from '@/types/proposal';

export interface SectionProps {
  data: ProposalData;
  config: ProposalSectionConfig;
  /**
   * Número sequencial da tabela desta seção ("TABELA 03"), atribuído pelo
   * documento na ordem de render. Resolve a numeração incoerente apontada na
   * análise das propostas atuais, onde "Tabela 01" significava coisas
   * diferentes em cada peça.
   */
  tableNumber?: number;
}

export type SectionComponent = React.FC<SectionProps>;

export interface SectionDefinition {
  key: ProposalSectionKey;
  Component: SectionComponent;
  /** Começa em página nova (a menos que seja a primeira seção do fluxo). */
  startsOnNewPage: boolean;
  /** Consome um número de tabela. */
  hasTable: boolean;
  /** `false` faz a seção ser omitida silenciosamente, sem quebra de página órfã. */
  hasContent: (data: ProposalData) => boolean;
}

/**
 * Opções de precificação a exibir. O contrato permite N cenários; o padrão de
 * exibição é a primeira recomendada.
 */
export function pricingOptionsToRender(data: ProposalData): ProposalPricingOption[] {
  return data.pricingOptions;
}

export function primaryPricingOption(data: ProposalData): ProposalPricingOption | null {
  if (data.pricingOptions.length === 0) return null;
  return data.pricingOptions.find((option) => option.isRecommended) ?? data.pricingOptions[0];
}

/** Só rotula os blocos por cenário quando há mais de uma opção na peça. */
export function shouldLabelPricingOptions(data: ProposalData): boolean {
  return data.pricingOptions.length > 1;
}
