/**
 * CONTRATO CANÔNICO DA PROPOSTA COMERCIAL
 *
 * Fonte única de verdade compartilhada por três camadas construídas em paralelo:
 * modelo de dados (migrations), motor de PDF e camada de IA.
 *
 * Regra de ouro: campos numéricos e quantitativos são SEMPRE computados pelo
 * sistema a partir do orçamento e da precificação. A IA só produz os campos de
 * texto marcados como `[IA]` abaixo, e os recebe os números como dados imutáveis
 * para citar — nunca para recalcular.
 *
 * Alterações neste arquivo precisam ser comunicadas às três camadas.
 */

// ---------------------------------------------------------------------------
// Seções
// ---------------------------------------------------------------------------

/** As 19 seções padrão da proposta, na ordem de referência. Todas são
 * liga/desliga e reordenáveis por proposta. */
export type ProposalSectionKey =
  | 'capa'
  | 'quem_somos'
  | 'seu_projeto'
  | 'localizacao'
  | 'fotos_obra'
  | 'descricao_atividades'
  | 'escopo_materiais'
  | 'curva_abc'
  | 'condicoes_faturamento'
  | 'valores_por_segmento'
  | 'valores_globais'
  | 'investimento_por_unidade'
  | 'condicoes_pagamento'
  | 'cronograma'
  | 'matriz_responsabilidade'
  | 'consideracoes_finais'
  | 'diferencial_orcarede'
  | 'termo_aceite'
  | 'contato';

export interface ProposalSectionConfig {
  key: ProposalSectionKey;
  /** Título exibido. Editável — a peça atual usa caixa alta espaçada. */
  title: string;
  order: number;
  enabled: boolean;
}

// ---------------------------------------------------------------------------
// Blocos de texto
// ---------------------------------------------------------------------------

/** Bloco de texto estruturado. Nunca usar string única com markdown:
 * o motor de PDF precisa dos parágrafos e bullets separados para paginar. */
export interface ProposalRichBlock {
  heading: string | null;
  paragraphs: string[];
  bullets: string[];
}

// ---------------------------------------------------------------------------
// Identificação
// ---------------------------------------------------------------------------

export interface ProposalHeader {
  /** Número sequencial do orçamento (ex.: 287). */
  proposalNumber: number;
  /** Versão da proposta para o mesmo orçamento (ex.: 1, 4). */
  version: number;
  /** Rótulo do topo da capa (ex.: "TIPO DE ESCOPO", "TIPO DE SERVIÇO"). */
  scopeLabel: string;
  /** [IA] Título do empreendimento na capa. */
  projectTitle: string;
  /** [IA] Subtítulo opcional (ex.: "COND. RESIDENCIAL - Cyano Private Resort"). */
  projectSubtitle: string | null;
  clientName: string;
  city: string;
  /** ISO 8601. */
  issuedAt: string;
  /** ISO 8601. Informativa: não expira o link público. */
  validityDate: string | null;
}

export interface ProposalCompany {
  legalName: string;
  tradeName: string | null;
  cnpj: string;
  address: string;
  phonePrimary: string;
  phoneSecondary: string | null;
  email: string;
  website: string | null;
  instagram: string | null;
  /** Usado no botão de WhatsApp da página pública. Formato E.164. */
  whatsappNumber: string;
  logoUrl: string | null;
}

export interface ProposalTechnicalResponsible {
  fullName: string;
  crea: string;
  signatureUrl: string | null;
}

// ---------------------------------------------------------------------------
// Mídia
// ---------------------------------------------------------------------------

export interface ProposalMedia {
  url: string;
  caption: string | null;
  order: number;
  /** Agrupador livre dentro da seção (ex.: "ESTRUTURAS CIVIL"). */
  group: string | null;
}

// ---------------------------------------------------------------------------
// Escopo técnico
// ---------------------------------------------------------------------------

/**
 * Grupo de atividades do escopo (ex.: "1. Rede de Distribuição em MT/BT").
 *
 * [IA] escreve `title`, `intro`, `items` e `note`, mas recebe os quantitativos
 * em `facts` como dados fechados. Toda quantidade citada no texto tem de existir
 * em `facts` — é isso que impede o erro de "05 (seis) transformadores".
 */
export interface ProposalActivityGroup {
  order: number;
  title: string;
  intro: string;
  items: string[];
  note: ProposalRichBlock | null;
  /** Quantitativos computados do orçamento, injetados no prompt. */
  facts: ProposalActivityFact[];
}

export interface ProposalActivityFact {
  /** Ex.: "postes de concreto Duplo T CAAA IV", "rede de média tensão 13,8 kV". */
  label: string;
  quantity: number;
  unit: string;
  /** `true` quando o valor é estimativa e o texto deve dizer "aproximadamente". */
  isApproximate: boolean;
}

// ---------------------------------------------------------------------------
// Materiais e curva ABC
// ---------------------------------------------------------------------------

export interface ProposalMaterialRow {
  code: string | null;
  name: string;
  subgroup: string | null;
  unit: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
}

export interface ProposalAbcRow {
  curve: 'A' | 'B' | 'C';
  /** Rótulo comercial, editável — pode divergir do nome técnico do subgrupo. */
  label: string;
  amount: number;
  percent: number;
  order: number;
}

export interface ProposalAbcCurveTotal {
  curve: 'A' | 'B' | 'C';
  amount: number;
  percent: number;
}

/**
 * Curva ABC completa. Invariante obrigatória, validada antes de publicar:
 * soma de `rows[].amount` === `grandTotal`, e cada `totals[].percent`
 * coerente com `totals[].amount / grandTotal`.
 */
export interface ProposalAbc {
  rows: ProposalAbcRow[];
  totals: ProposalAbcCurveTotal[];
  grandTotal: number;
}

// ---------------------------------------------------------------------------
// Valores
// ---------------------------------------------------------------------------

/** Totais por segmento de obra (ex.: Rede Energia, Iluminação, Ramais). */
export interface ProposalSegmentTotal {
  label: string;
  materialAmount: number;
  laborAmount: number;
  totalAmount: number;
  percent: number;
  order: number;
}

export interface ProposalGlobals {
  /** Materiais: faturamento direto do fornecedor para o cliente. */
  materialTotal: number;
  /** Mão de obra / serviços: faturamento da ON. Equivale ao VS da precificação. */
  laborTotal: number;
  grandTotal: number;
}

export interface ProposalUnitInvestment {
  unitsCount: number;
  /** Rótulo editável: "lotes", "unidades", "apartamentos". */
  unitsLabel: string;
  amountPerUnit: number;
}

/**
 * Parcela do pagamento. Incide SEMPRE sobre `ProposalGlobals.laborTotal`,
 * nunca sobre materiais — que são faturados direto pelo fornecedor.
 */
export interface ProposalPaymentTerm {
  order: number;
  percent: number;
  amount: number;
  /** Ex.: "entrada", "assinatura contrato", "30 dias". */
  dueLabel: string;
}

/** Opção de preço apresentada ao cliente. Uma proposta pode exibir N. */
export interface ProposalPricingOption {
  /** Referência à precificação salva de origem. */
  savedPricingBudgetId: string;
  label: string;
  isRecommended: boolean;
  globals: ProposalGlobals;
  segments: ProposalSegmentTotal[];
  paymentTerms: ProposalPaymentTerm[];
  unitInvestment: ProposalUnitInvestment | null;
}

// ---------------------------------------------------------------------------
// Cronograma e responsabilidades
// ---------------------------------------------------------------------------

export interface ProposalScheduleColumn {
  key: string;
  /** Ex.: "01 DIA", "20 DIA", "270". */
  label: string;
}

export interface ProposalScheduleRow {
  order: number;
  stage: string;
  /** Chaveado por `ProposalScheduleColumn.key`. `true` marca X; string exibe texto. */
  marks: Record<string, boolean | string>;
}

export interface ProposalResponsibilityItem {
  order: number;
  description: string;
  responsible: 'contratada' | 'contratante' | 'ambos';
}

// ---------------------------------------------------------------------------
// Agregado
// ---------------------------------------------------------------------------

/**
 * Payload completo da proposta. É o que o motor de PDF recebe e o que a página
 * pública renderiza. Campos `[IA]` são preenchidos pela camada de IA e sempre
 * editáveis pelo usuário depois.
 */
export interface ProposalData {
  id: string;
  budgetId: string;
  status: 'draft' | 'published' | 'archived';

  header: ProposalHeader;
  company: ProposalCompany;
  responsible: ProposalTechnicalResponsible | null;
  sections: ProposalSectionConfig[];

  /** [IA] a partir do texto institucional do template. */
  institutional: {
    quemSomos: ProposalRichBlock | null;
    identidade: ProposalRichBlock | null;
    compromisso: ProposalRichBlock | null;
    diferencialOrcaRede: ProposalRichBlock | null;
  };

  media: {
    seuProjeto: ProposalMedia[];
    localizacao: ProposalMedia[];
    fotosObra: ProposalMedia[];
  };

  /** [IA] prosa; `facts` computado. */
  activities: ProposalActivityGroup[];

  materials: ProposalMaterialRow[];
  abc: ProposalAbc;

  /** [IA] a partir do template. */
  billingConditions: ProposalRichBlock | null;

  /** Ao menos uma opção. A primeira recomendada é o padrão de exibição. */
  pricingOptions: ProposalPricingOption[];

  schedule: {
    columns: ProposalScheduleColumn[];
    rows: ProposalScheduleRow[];
    /** [IA] nota de rodapé do cronograma. */
    footnote: string | null;
  };

  responsibilityMatrix: ProposalResponsibilityItem[];

  /** [IA] inclui normas, itens inclusos e escopo negativo. */
  finalConsiderations: ProposalRichBlock[];

  acceptance: {
    /** [IA] parágrafo de fechamento antes do termo de aceite. */
    closingText: string;
  };
}

// ---------------------------------------------------------------------------
// Analytics da página pública
// ---------------------------------------------------------------------------

export type ProposalViewEventType =
  | 'session_start'
  | 'heartbeat'
  | 'section_view'
  | 'pdf_download'
  | 'whatsapp_click';

export interface ProposalViewEvent {
  type: ProposalViewEventType;
  sectionKey: ProposalSectionKey | null;
  occurredAt: string;
  payload: Record<string, unknown> | null;
}
