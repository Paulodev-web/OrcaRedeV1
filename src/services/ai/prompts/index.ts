/**
 * Biblioteca de prompts da proposta comercial.
 *
 * Convenção da pasta:
 *   `<assunto>.system.ts`  → instrução, estável, versionada em `*_PROMPT_VERSION`
 *   `<assunto>.user.ts`    → builder que injeta os dados daquela proposta
 *   `shared/`              → blocos reaproveitados por mais de um system prompt
 *
 * Motivo de existir: hoje os prompts de IA do projeto são strings inline
 * duplicadas entre a versão Next e a versão Edge Function. Quando a instrução
 * vive num arquivo próprio e versionado, dá para saber com que texto uma
 * proposta foi escrita e para mudar a instrução sem caçar string em service.
 *
 * Nada aqui chama a API. Estes módulos só produzem texto.
 */

export { HOUSE_STYLE, HOUSE_STYLE_VERSION } from './shared/houseStyle';
export { NUMBER_GUARDRAIL, NUMBER_GUARDRAIL_VERSION } from './shared/numberGuardrail';

export {
  PROPOSAL_DRAFT_PROMPT_VERSION,
  PROPOSAL_DRAFT_COVER_SYSTEM,
  PROPOSAL_DRAFT_INSTITUTIONAL_SYSTEM,
  PROPOSAL_DRAFT_ACTIVITIES_SYSTEM,
  PROPOSAL_DRAFT_COMMERCIAL_SYSTEM,
  PROPOSAL_DRAFT_CONSIDERATIONS_SYSTEM,
} from './proposalDraft.system';

export {
  buildCoverUserPrompt,
  buildInstitutionalUserPrompt,
  buildActivityGroupUserPrompt,
  buildCommercialUserPrompt,
  buildConsiderationsUserPrompt,
  buildGuardrailRetryPrompt,
} from './proposalDraft.user';

export {
  PROPOSAL_REFINE_PROMPT_VERSION,
  getRefineSystemPrompt,
} from './proposalBlockRefine.system';

export {
  buildRefineUserPrompt,
  buildRefineRetryPrompt,
} from './proposalBlockRefine.user';

export {
  PROPOSAL_MEDIA_TAGS_PROMPT_VERSION,
  PROPOSAL_MEDIA_TAGS_SYSTEM,
} from './proposalMediaTags.system';

export { buildMediaTagsUserPrompt } from './proposalMediaTags.user';
