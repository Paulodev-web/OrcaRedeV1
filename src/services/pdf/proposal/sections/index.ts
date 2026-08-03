import type { ProposalData, ProposalSectionKey } from '@/types/proposal';

import { hasRichBlockContent } from '../components/typography';
import { CoverPage } from './capa';
import { QuemSomosSection } from './quemSomos';
import { FotosObraSection, LocalizacaoSection, SeuProjetoSection } from './midia';
import { DescricaoAtividadesSection } from './descricaoAtividades';
import { EscopoMateriaisSection } from './escopoMateriais';
import { CurvaAbcSection } from './curvaAbc';
import {
  CondicoesFaturamentoSection,
  ConsideracoesFinaisSection,
  DiferencialOrcaRedeSection,
} from './blocosDeTexto';
import { ValoresPorSegmentoSection } from './valoresPorSegmento';
import { ValoresGlobaisSection } from './valoresGlobais';
import { InvestimentoPorUnidadeSection } from './investimentoPorUnidade';
import { CondicoesPagamentoSection } from './condicoesPagamento';
import { CronogramaSection } from './cronograma';
import { MatrizResponsabilidadeSection } from './matrizResponsabilidade';
import { TermoAceiteSection } from './termoAceite';
import { ContatoSection } from './contato';
import type { SectionComponent } from './types';

/**
 * REGISTRY DAS 19 SEÇÕES.
 *
 * `startsOnNewPage` reproduz a paginação das propostas de referência: seções
 * curtas continuam na mesma página da anterior (LOCALIZAÇÃO depois de SEU
 * PROJETO; CONDIÇÕES DE FATURAMENTO depois da CURVA ABC; os três blocos de
 * valor depois de VALORES POR SEGMENTO), o resto abre página.
 *
 * `hasContent` faz uma seção habilitada porém vazia sumir sem deixar página em
 * branco nem título órfão.
 */

export interface SectionDefinition {
  key: ProposalSectionKey;
  /** `page` desenha sua própria `<Page>`; `flow` entra no fluxo contínuo. */
  kind: 'page' | 'flow';
  Component: SectionComponent | null;
  startsOnNewPage: boolean;
  hasTable: boolean;
  hasContent: (data: ProposalData) => boolean;
}

const ALWAYS = () => true;

export const SECTION_REGISTRY: Record<ProposalSectionKey, SectionDefinition> = {
  capa: {
    key: 'capa',
    kind: 'page',
    Component: null,
    startsOnNewPage: true,
    hasTable: false,
    hasContent: ALWAYS,
  },
  quem_somos: {
    key: 'quem_somos',
    kind: 'flow',
    Component: QuemSomosSection,
    startsOnNewPage: true,
    hasTable: false,
    hasContent: (data) =>
      hasRichBlockContent(data.institutional.quemSomos) ||
      hasRichBlockContent(data.institutional.identidade) ||
      hasRichBlockContent(data.institutional.compromisso),
  },
  seu_projeto: {
    key: 'seu_projeto',
    kind: 'flow',
    Component: SeuProjetoSection,
    startsOnNewPage: true,
    hasTable: false,
    hasContent: (data) => data.media.seuProjeto.length > 0,
  },
  localizacao: {
    key: 'localizacao',
    kind: 'flow',
    Component: LocalizacaoSection,
    // Divide página com SEU PROJETO, como na Andora.
    startsOnNewPage: false,
    hasTable: false,
    hasContent: (data) => data.media.localizacao.length > 0,
  },
  fotos_obra: {
    key: 'fotos_obra',
    kind: 'flow',
    Component: FotosObraSection,
    startsOnNewPage: true,
    hasTable: false,
    hasContent: (data) => data.media.fotosObra.length > 0,
  },
  descricao_atividades: {
    key: 'descricao_atividades',
    kind: 'flow',
    Component: DescricaoAtividadesSection,
    startsOnNewPage: true,
    hasTable: false,
    hasContent: (data) => data.activities.length > 0,
  },
  escopo_materiais: {
    key: 'escopo_materiais',
    kind: 'flow',
    Component: EscopoMateriaisSection,
    startsOnNewPage: true,
    hasTable: true,
    hasContent: (data) => data.materials.length > 0,
  },
  curva_abc: {
    key: 'curva_abc',
    kind: 'flow',
    Component: CurvaAbcSection,
    startsOnNewPage: true,
    hasTable: true,
    hasContent: (data) => data.abc.rows.length > 0,
  },
  condicoes_faturamento: {
    key: 'condicoes_faturamento',
    kind: 'flow',
    Component: CondicoesFaturamentoSection,
    // Fecha a página da curva ABC, como na Andora.
    startsOnNewPage: false,
    hasTable: false,
    hasContent: (data) => hasRichBlockContent(data.billingConditions),
  },
  valores_por_segmento: {
    key: 'valores_por_segmento',
    kind: 'flow',
    Component: ValoresPorSegmentoSection,
    startsOnNewPage: true,
    hasTable: true,
    hasContent: (data) => data.pricingOptions.some((option) => option.segments.length > 0),
  },
  valores_globais: {
    key: 'valores_globais',
    kind: 'flow',
    Component: ValoresGlobaisSection,
    startsOnNewPage: false,
    hasTable: true,
    hasContent: (data) => data.pricingOptions.length > 0,
  },
  investimento_por_unidade: {
    key: 'investimento_por_unidade',
    kind: 'flow',
    Component: InvestimentoPorUnidadeSection,
    startsOnNewPage: false,
    hasTable: true,
    hasContent: (data) => data.pricingOptions.some((option) => option.unitInvestment !== null),
  },
  condicoes_pagamento: {
    key: 'condicoes_pagamento',
    kind: 'flow',
    Component: CondicoesPagamentoSection,
    startsOnNewPage: false,
    hasTable: true,
    hasContent: (data) => data.pricingOptions.some((option) => option.paymentTerms.length > 0),
  },
  cronograma: {
    key: 'cronograma',
    kind: 'flow',
    Component: CronogramaSection,
    startsOnNewPage: true,
    hasTable: true,
    hasContent: (data) => data.schedule.rows.length > 0 && data.schedule.columns.length > 0,
  },
  matriz_responsabilidade: {
    key: 'matriz_responsabilidade',
    kind: 'flow',
    Component: MatrizResponsabilidadeSection,
    startsOnNewPage: true,
    hasTable: true,
    hasContent: (data) => data.responsibilityMatrix.length > 0,
  },
  consideracoes_finais: {
    key: 'consideracoes_finais',
    kind: 'flow',
    Component: ConsideracoesFinaisSection,
    startsOnNewPage: true,
    hasTable: false,
    hasContent: (data) => data.finalConsiderations.some(hasRichBlockContent),
  },
  diferencial_orcarede: {
    key: 'diferencial_orcarede',
    kind: 'flow',
    Component: DiferencialOrcaRedeSection,
    startsOnNewPage: true,
    hasTable: false,
    hasContent: (data) => hasRichBlockContent(data.institutional.diferencialOrcaRede),
  },
  termo_aceite: {
    key: 'termo_aceite',
    kind: 'flow',
    Component: TermoAceiteSection,
    startsOnNewPage: true,
    hasTable: false,
    hasContent: ALWAYS,
  },
  contato: {
    key: 'contato',
    kind: 'flow',
    Component: ContatoSection,
    // Fecha a página do termo de aceite, como nas duas propostas de referência.
    startsOnNewPage: false,
    hasTable: false,
    hasContent: ALWAYS,
  },
};

export { CoverPage };
export type { SectionComponent } from './types';
