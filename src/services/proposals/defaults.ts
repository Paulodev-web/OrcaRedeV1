import type { ProposalSectionKey } from '@/types/proposal';

/**
 * Espelho de `public.proposal_default_sections()`
 * (supabase/migrations/20260803125000_proposal_templates.sql).
 *
 * Existe em duplicidade de propósito: a proposta criada sem template nenhum
 * precisa das 19 seções com título, e ler a função do banco a cada criação
 * custaria um round-trip para uma lista que só muda por migration.
 * Mudou lá, mude aqui.
 */
export const DEFAULT_SECTIONS: Array<{
  key: ProposalSectionKey;
  title: string;
  order: number;
  enabled: boolean;
}> = [
  { key: 'capa', title: 'Capa', order: 1, enabled: true },
  { key: 'quem_somos', title: 'Quem Somos', order: 2, enabled: true },
  { key: 'seu_projeto', title: 'Seu Projeto', order: 3, enabled: true },
  { key: 'localizacao', title: 'Localização da Obra', order: 4, enabled: true },
  { key: 'fotos_obra', title: 'Fotos da Obra', order: 5, enabled: true },
  { key: 'descricao_atividades', title: 'Descrição das Atividades', order: 6, enabled: true },
  { key: 'escopo_materiais', title: 'Escopo dos Materiais Subdivididos', order: 7, enabled: true },
  { key: 'curva_abc', title: 'Curva de Preços', order: 8, enabled: true },
  {
    key: 'condicoes_faturamento',
    title: 'Condições de Faturamento de Materiais',
    order: 9,
    enabled: true,
  },
  { key: 'valores_por_segmento', title: 'Valores Globais por Segmento', order: 10, enabled: true },
  { key: 'valores_globais', title: 'Valores Globais', order: 11, enabled: true },
  { key: 'investimento_por_unidade', title: 'Investimento por Unidade', order: 12, enabled: true },
  { key: 'condicoes_pagamento', title: 'Condições de Pagamento', order: 13, enabled: true },
  { key: 'cronograma', title: 'Cronograma Executivo', order: 14, enabled: true },
  { key: 'matriz_responsabilidade', title: 'Matriz de Responsabilidade', order: 15, enabled: true },
  { key: 'consideracoes_finais', title: 'Considerações Finais', order: 16, enabled: true },
  { key: 'diferencial_orcarede', title: 'Diferencial Tecnológico OrçaRede', order: 17, enabled: true },
  { key: 'termo_aceite', title: 'Termo de Aceite', order: 18, enabled: true },
  { key: 'contato', title: 'Contato', order: 19, enabled: true },
];

/** Rótulo humano de cada seção no editor. */
export const SECTION_LABELS: Record<ProposalSectionKey, string> = Object.fromEntries(
  DEFAULT_SECTIONS.map((section) => [section.key, section.title]),
) as Record<ProposalSectionKey, string>;

/**
 * Onde o conteúdo de cada seção é editado.
 *
 * `derivada` = a seção não tem campo de texto próprio: ela renderiza números que
 * vêm do orçamento e da precificação. O editor mostra o que será impresso e
 * manda o usuário para a origem, em vez de fingir um campo editável.
 */
export const SECTION_ORIGIN: Record<ProposalSectionKey, string> = {
  capa: 'Identificação da proposta e dados da empresa',
  quem_somos: 'Template institucional — editável aqui',
  seu_projeto: 'Imagens enviadas nesta seção',
  localizacao: 'Imagens enviadas nesta seção',
  fotos_obra: 'Imagens enviadas nesta seção',
  descricao_atividades: 'Quantitativos do orçamento + prosa da IA',
  escopo_materiais: 'Consolidado de materiais do orçamento',
  curva_abc: 'Pareto automático sobre os subgrupos — corte e rótulos editáveis',
  condicoes_faturamento: 'Template — editável aqui',
  valores_por_segmento: 'Segmentos do orçamento + precificação',
  valores_globais: 'Precificação escolhida',
  investimento_por_unidade: 'Precificação ÷ número de unidades',
  condicoes_pagamento: 'Gerador de parcelamento sobre o valor de serviço',
  cronograma: 'Preenchimento manual',
  matriz_responsabilidade: 'Template — editável por proposta',
  consideracoes_finais: 'Template + IA',
  diferencial_orcarede: 'Template institucional',
  termo_aceite: 'Responsável técnico + validade',
  contato: 'Dados da empresa em Configurações',
};

/** Colunas de cronograma oferecidas como ponto de partida. */
export const DEFAULT_SCHEDULE_COLUMNS = [
  { key: 'd01', label: '01 dia' },
  { key: 'd30', label: '30 dias' },
  { key: 'd60', label: '60 dias' },
  { key: 'd90', label: '90 dias' },
  { key: 'd180', label: '180 dias' },
];

export const DEFAULT_SCHEDULE_STAGES = [
  'Assinatura do contrato',
  'Elaboração do projeto executivo',
  'Aprovação junto à concessionária',
  'Mobilização de materiais',
  'Início da execução',
  'Comissionamento e energização',
];
