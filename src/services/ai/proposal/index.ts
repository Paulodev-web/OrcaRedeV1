/**
 * Camada de IA da proposta comercial — superfície pública.
 *
 * Três capacidades:
 *   1. rascunho estruturado    `generateProposalDraft` / `runProposalDraftStep`
 *   2. refinamento por bloco   `refineProposalBlock`
 *   3. sugestão de mídia       `suggestProposalMediaTags`
 *
 * Nada aqui toca no Supabase, em server action ou em rota. A ligação com o
 * banco é de outra frente: ela monta um `ProposalDraftInput` e consome
 * `ProposalDraftOutput`, que corresponde exatamente aos campos `[IA]` do
 * `ProposalData` em `src/types/proposal.ts`.
 *
 * Regra de ouro: a IA nunca emite quantitativo, valor monetário ou prazo. Ela
 * recebe os números fechados e escreve o texto em volta. `numberGuard.ts` é
 * quem verifica, e `validateProposalDraft` refaz a verificação sobre o texto já
 * editado à mão, antes de publicar.
 */

// --- Geração ---------------------------------------------------------------
export {
  generateProposalDraft,
  planProposalDraftSteps,
  runProposalDraftStep,
  mergeStepResults,
  type GenerateDraftOptions,
  type RunStepOptions,
} from './generateProposalDraft';

// --- Refinamento -----------------------------------------------------------
export {
  refineProposalBlock,
  PROPOSAL_REFINE_ACTION_LABELS,
  type RefineOptions,
} from './refineProposalBlock';

// --- Mídia -----------------------------------------------------------------
export {
  suggestProposalMediaTags,
  type SuggestMediaTagsOptions,
} from './suggestProposalMediaTags';

// --- Validação -------------------------------------------------------------
export {
  validateProposalDraft,
  type ProposalValidationReport,
  type ValidateDraftOptions,
} from './validateProposalDraft';

export {
  buildAllowedNumberUniverse,
  checkGeneratedText,
  checkNumbersPreserved,
  checkTextFields,
  formatViolationsForPrompt,
  type AllowedNumberUniverse,
} from './numberGuard';

// --- Utilitários de número (úteis ao motor de PDF e à UI) -------------------
export {
  formatDecimalPtBr,
  formatIntegerPtBr,
  formatQuantityPtBr,
  formatQuantityWithWords,
  integerToPtBrWords,
} from './ptNumbers';

export { flattenRichBlock } from './parseStepPayload';

// --- Configuração ----------------------------------------------------------
export {
  getProposalAiModel,
  getProposalAiLightModel,
  DEFAULT_PROPOSAL_AI_MODEL,
  DEFAULT_PROPOSAL_AI_LIGHT_MODEL,
} from './config';

// --- Tipos -----------------------------------------------------------------
export type {
  ProposalAiUsage,
  ProposalActivityGroupInput,
  ProposalCommercialContext,
  ProposalDraftInput,
  ProposalDraftOutput,
  ProposalDraftPartial,
  ProposalDraftResult,
  ProposalDraftStep,
  ProposalDraftStepKey,
  ProposalGuardrailViolation,
  ProposalInstitutionalDraft,
  ProposalMaterialSubgroupSummary,
  ProposalMediaTagResult,
  ProposalMediaTagSuggestion,
  ProposalMediaTagSuggestionInput,
  ProposalProjectContext,
  ProposalRefineAction,
  ProposalRefineInput,
  ProposalRefineResult,
  ProposalStepResult,
  ProposalTechnicalReference,
  ProposalTemplateContext,
} from './types';
