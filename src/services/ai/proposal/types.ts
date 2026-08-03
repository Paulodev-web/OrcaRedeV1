/**
 * Contrato de ENTRADA da camada de IA da proposta comercial.
 *
 * `src/types/proposal.ts` é o contrato canônico e é consumido aqui apenas como
 * LEITURA. Este arquivo define o que a camada de IA *recebe* — a ligação com o
 * Supabase é de outra frente, que monta um `ProposalDraftInput` a partir do
 * orçamento, da precificação e das configurações.
 *
 * DECISÃO DE PROJETO — dinheiro não entra no prompt.
 * A regra de ouro diz que a IA nunca emite valor monetário. A forma mais forte
 * de garantir isso não é pedir educadamente: é não passar nenhum valor em real
 * para o modelo. Sem `materialTotal`, sem `laborTotal`, sem preço de material.
 * Consequência prática: qualquer cifra que aparecer no texto gerado é
 * necessariamente inventada, e o guardrail rejeita sem precisar julgar contexto.
 * Os números de dinheiro são renderizados pelo motor de PDF a partir das
 * tabelas, nunca pela prosa.
 *
 * O mesmo vale para prazo: nenhuma data ou contagem de dias é enviada. O
 * cronograma é tabela, não parágrafo.
 */

import type {
  ProposalActivityFact,
  ProposalActivityGroup,
  ProposalCompany,
  ProposalRichBlock,
  ProposalSectionKey,
  ProposalTechnicalResponsible,
} from '@/types/proposal';

// ---------------------------------------------------------------------------
// Entrada — contexto do empreendimento
// ---------------------------------------------------------------------------

export interface ProposalProjectContext {
  /** Ex.: "Condomínio residencial de alto padrão com rede subterrânea". */
  workType: string;
  /** Ex.: "Osório". */
  city: string;
  /** Sigla da UF. Ex.: "RS". */
  state: string;
  /** Nome comercial do empreendimento, quando existir. */
  developmentName: string | null;
  clientName: string;
  /** Concessionária local. Ex.: "Equatorial", "RGE / CPFL". */
  utility: string;
  /** Rótulo do topo da capa. Ex.: "TIPO DE ESCOPO". */
  scopeLabel: string;
  /**
   * Condicionantes que mudam a especificação técnica.
   * Ex.: "orla marítima — ambiente com risco de corrosão classe C5".
   */
  environmentConstraints: string | null;
  /** Anotações do orçamentista que devem ser incorporadas à prosa. */
  authorNotes: string | null;
}

/**
 * Norma citável. A IA só pode citar normas desta lista — o guardrail rejeita
 * códigos normativos que não estejam aqui. Isso impede o modelo de inventar
 * "NT.00012" ou trocar GED-4101 por GED-4110 numa proposta de engenharia.
 */
export interface ProposalTechnicalReference {
  /** Ex.: "NT.00004", "GED-4101", "NBR 5410", "NR-10". */
  code: string;
  /** Ex.: "Equatorial", "RGE / CPFL", "ABNT", "MTE". */
  issuer: string;
  /** Do que a norma trata, para o modelo saber onde citar. */
  subject: string;
  /** Ex.: "Revisão 03/2025". `null` quando não há revisão a citar. */
  revision: string | null;
}

// ---------------------------------------------------------------------------
// Entrada — atividades
// ---------------------------------------------------------------------------

/**
 * Grupo de atividades a redigir. Espelha `ProposalActivityGroup` do contrato
 * canônico, mas só com o que é de entrada: os `facts` já fechados e um título
 * de partida. `title`, `intro`, `items` e `note` são o que a IA produz.
 */
export interface ProposalActivityGroupInput {
  order: number;
  /** Título de partida vindo do segmento de obra. A IA refina a redação. */
  suggestedTitle: string;
  /** Segmento de obra do orçamento, quando marcado. */
  segmentLabel: string | null;
  /** Quantitativos fechados. Única fonte de número permitida para este grupo. */
  facts: ProposalActivityFact[];
  /**
   * Observação técnica que precisa obrigatoriamente aparecer na `note` do
   * grupo. Ex.: a ressalva de eletrodutos não previstos em projeto da Andora.
   */
  mandatoryNote: string | null;
}

// ---------------------------------------------------------------------------
// Entrada — materiais e condições comerciais
// ---------------------------------------------------------------------------

/**
 * Resumo de material por subgrupo. Sem preço, de propósito: a IA descreve a
 * composição do escopo, não precifica.
 */
export interface ProposalMaterialSubgroupSummary {
  subgroup: string;
  /** Quantos itens distintos o subgrupo tem no consolidado. */
  itemCount: number;
}

/**
 * Estrutura comercial — forma, não valor.
 *
 * Os quantitativos citáveis (nº de parcelas, nº de unidades) vêm em
 * `commercialFacts`, reaproveitando o mesmo `ProposalActivityFact` do contrato
 * canônico para que o guardrail de número seja exatamente o mesmo.
 */
export interface ProposalCommercialContext {
  /** Materiais faturados direto do fornecedor para o contratante. */
  materialsBilledDirectlyBySupplier: boolean;
  /** Parcelamento incide apenas sobre o serviço (VS). Nunca sobre material. */
  installmentsApplyToLaborOnly: boolean;
  /** Existe parcela de entrada / assinatura de contrato. */
  hasDownPayment: boolean;
  /** Rótulo da unidade de investimento: "lotes", "unidades", "apartamentos". */
  unitsLabel: string | null;
  /** Ex.: nº de parcelas, nº de lotes. Sem cifras. */
  commercialFacts: ProposalActivityFact[];
}

// ---------------------------------------------------------------------------
// Entrada — template e escopo negativo
// ---------------------------------------------------------------------------

/**
 * Texto institucional e listas fixas vindas do template de proposta
 * (`proposal_templates`). A IA reescreve o institucional no tom da peça, mas
 * não inventa conteúdo novo de posicionamento.
 */
export interface ProposalTemplateContext {
  /** Texto institucional bruto — "Quem Somos", missão, visão, valores. */
  institutionalText: string;
  /** Boilerplate do diferencial tecnológico OrçaRede. */
  orcaRedeText: string;
  /** Condições de faturamento de material, padrão da casa. */
  billingConditionsText: string;
  /** Itens que a contratada assume. Um por linha, já revisados. */
  contractorResponsibilities: string[];
  /** Escopo negativo — o que NÃO está incluso. A IA não acrescenta itens. */
  exclusions: string[];
}

// ---------------------------------------------------------------------------
// Entrada — agregado
// ---------------------------------------------------------------------------

export interface ProposalDraftInput {
  project: ProposalProjectContext;
  company: ProposalCompany;
  responsible: ProposalTechnicalResponsible | null;
  technicalReferences: ProposalTechnicalReference[];
  activityGroups: ProposalActivityGroupInput[];
  materialSubgroups: ProposalMaterialSubgroupSummary[];
  commercial: ProposalCommercialContext;
  template: ProposalTemplateContext;
}

// ---------------------------------------------------------------------------
// Saída — exatamente os campos [IA] do ProposalData
// ---------------------------------------------------------------------------

export interface ProposalInstitutionalDraft {
  quemSomos: ProposalRichBlock | null;
  identidade: ProposalRichBlock | null;
  compromisso: ProposalRichBlock | null;
  diferencialOrcaRede: ProposalRichBlock | null;
}

/**
 * Rascunho estruturado. Cada chave corresponde a um campo `[IA]` do
 * `ProposalData` — quem monta a proposta faz o splice direto, sem transformação.
 *
 * `activities` vem completo (com `facts`), porque os fatos são recopiados da
 * entrada pelo sistema, jamais reescritos pelo modelo.
 */
export interface ProposalDraftOutput {
  header: {
    projectTitle: string;
    projectSubtitle: string | null;
  };
  institutional: ProposalInstitutionalDraft;
  activities: ProposalActivityGroup[];
  billingConditions: ProposalRichBlock | null;
  scheduleFootnote: string | null;
  finalConsiderations: ProposalRichBlock[];
  acceptanceClosingText: string;
}

// ---------------------------------------------------------------------------
// Etapas — lotes encadeados para caber nos 60s do Vercel Hobby
// ---------------------------------------------------------------------------

export type ProposalDraftStepKey =
  | 'capa'
  | 'institucional'
  | 'atividade'
  | 'comercial'
  | 'consideracoes';

/**
 * Uma unidade de geração. O plano é montado antes de qualquer chamada, no mesmo
 * padrão de `buildSemanticMatchPipelineContext`: quem chama pode rodar tudo de
 * uma vez (script/worker) ou uma etapa por invocação (API route no Hobby).
 */
export interface ProposalDraftStep {
  index: number;
  key: ProposalDraftStepKey;
  /** Rótulo para log e UI. Ex.: "Atividades 2/3 — Rede de Iluminação Pública". */
  label: string;
  /** Índice em `input.activityGroups`. Só para `key === 'atividade'`. */
  activityGroupIndex: number | null;
}

/** Resultado parcial de uma etapa — merge incremental em `ProposalDraftOutput`. */
export type ProposalDraftPartial = Partial<
  Omit<ProposalDraftOutput, 'activities' | 'finalConsiderations'>
> & {
  activities?: ProposalActivityGroup[];
  finalConsiderations?: ProposalRichBlock[];
};

// ---------------------------------------------------------------------------
// Resultado das chamadas
// ---------------------------------------------------------------------------

export interface ProposalAiUsage {
  model: string;
  promptTokens: number;
  outputTokens: number;
  totalTokens: number;
  latencyMs: number;
  /** Quantas chamadas ao Gemini, incluindo as retentativas por guardrail. */
  calls: number;
}

export interface ProposalGuardrailViolation {
  /** Categoria da violação — direciona a mensagem de correção na retentativa. */
  kind:
    | 'numero_fora_dos_fatos'
    | 'quantitativo_divergente'
    | 'extenso_divergente'
    | 'aproximacao_incoerente'
    | 'valor_monetario'
    | 'norma_nao_listada'
    | 'placeholder'
    | 'campo_ausente';
  /** Caminho do campo na saída. Ex.: "activities[1].items[3]". */
  path: string;
  message: string;
  /** Trecho ofensivo, para o prompt de correção ser cirúrgico. */
  excerpt: string | null;
}

export interface ProposalStepResult {
  step: ProposalDraftStep;
  partial: ProposalDraftPartial;
  usage: ProposalAiUsage;
  /** Violações que sobreviveram a todas as retentativas. Vazio no caso feliz. */
  violations: ProposalGuardrailViolation[];
}

export type ProposalDraftResult =
  | {
      success: true;
      draft: ProposalDraftOutput;
      usage: ProposalAiUsage;
      steps: ProposalStepResult[];
      /** Violações residuais. Não bloqueiam o rascunho, sinalizam revisão. */
      violations: ProposalGuardrailViolation[];
    }
  | { success: false; error: string; steps: ProposalStepResult[] };

// ---------------------------------------------------------------------------
// Refinamento por bloco
// ---------------------------------------------------------------------------

/** Ações disponíveis num `ProposalRichBlock` já gerado. */
export type ProposalRefineAction =
  | 'formal'
  | 'direto'
  | 'encurtar'
  | 'expandir'
  | 'corrigir_portugues';

export interface ProposalRefineInput {
  block: ProposalRichBlock;
  action: ProposalRefineAction;
  /** Onde o bloco vive na peça — orienta o registro e o vocabulário. */
  sectionKey: ProposalSectionKey;
  /** Contexto mínimo do projeto, para o modelo não sair do assunto. */
  project: Pick<
    ProposalProjectContext,
    'workType' | 'city' | 'state' | 'utility' | 'clientName'
  >;
  /**
   * Fatos do bloco, quando houver. Reforça o guardrail: refinar não pode
   * introduzir número que não estava nos fatos nem no bloco original.
   */
  facts?: ProposalActivityFact[];
  /** Normas citáveis. Refinar não pode inventar norma nova. */
  technicalReferences?: ProposalTechnicalReference[];
}

export type ProposalRefineResult =
  | {
      success: true;
      block: ProposalRichBlock;
      usage: ProposalAiUsage;
      violations: ProposalGuardrailViolation[];
    }
  | { success: false; error: string; violations: ProposalGuardrailViolation[] };

// ---------------------------------------------------------------------------
// Sugestão de mídia por tag
// ---------------------------------------------------------------------------

export interface ProposalMediaTagSuggestionInput {
  sectionKey: ProposalSectionKey;
  /** Título da seção na peça. */
  sectionTitle: string;
  /** Resumo do que a seção diz — normalmente a `intro` do bloco. */
  sectionSummary: string;
  /**
   * Vocabulário fechado da biblioteca de mídia. A IA só pode devolver tags
   * daqui — é sugestão de TAG, não visão computacional sobre imagem.
   */
  availableTags: string[];
  /** Quantas tags devolver, no máximo. */
  maxTags?: number;
  project: Pick<ProposalProjectContext, 'workType' | 'utility'>;
}

export interface ProposalMediaTagSuggestion {
  tag: string;
  /** 0 a 100. */
  confidence: number;
  rationale: string;
}

export type ProposalMediaTagResult =
  | { success: true; suggestions: ProposalMediaTagSuggestion[]; usage: ProposalAiUsage }
  | { success: false; error: string };

// ---------------------------------------------------------------------------
// Reexports de conveniência
// ---------------------------------------------------------------------------

export type {
  ProposalActivityFact,
  ProposalActivityGroup,
  ProposalCompany,
  ProposalRichBlock,
  ProposalSectionKey,
  ProposalTechnicalResponsible,
};
