/**
 * Configuração da camada de IA da proposta, no mesmo padrão de
 * `src/lib/suppliesSemanticMatchConfig.ts`: default no código, override por
 * variável de ambiente, sem nenhuma leitura de banco.
 */

/**
 * Texto longo, técnico e com concordância em português — o pro entrega melhor
 * que o flash nesse recorte, do mesmo jeito que já acontece no match semântico
 * (`DEFAULT_SEMANTIC_MATCH_GEMINI_MODEL`).
 */
export const DEFAULT_PROPOSAL_AI_MODEL = 'gemini-2.5-pro';

/** Tarefas de classificação curta (sugestão de tag) não precisam do pro. */
export const DEFAULT_PROPOSAL_AI_LIGHT_MODEL = 'gemini-2.5-flash';

/**
 * Baixa, mas não zero: a peça precisa variar a redação entre parágrafos sem
 * inventar fato. Todo número já vem pronto no prompt, então a temperatura só
 * afeta a prosa.
 */
export const DEFAULT_PROPOSAL_AI_TEMPERATURE = 0.35;

/** Um grupo de atividades completo cabe folgado nisso. */
export const DEFAULT_PROPOSAL_AI_MAX_OUTPUT_TOKENS = 8192;

/**
 * Vercel Hobby corta a invocação em 60s. 50s deixa margem para parse,
 * validação e resposta HTTP.
 */
export const DEFAULT_PROPOSAL_AI_TIMEOUT_MS = 50_000;

/**
 * Retentativas por etapa quando o guardrail reprova a saída. A retentativa é
 * informada: o prompt de correção recebe a lista de violações.
 */
export const DEFAULT_PROPOSAL_GUARDRAIL_RETRY = 2;

/** Retentativas por falha transitória de rede/API, antes do guardrail entrar. */
export const DEFAULT_PROPOSAL_AI_TRANSPORT_RETRY = 1;

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function parseNonNegativeInt(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function parseFloatInRange(
  raw: string | undefined,
  fallback: number,
  min: number,
  max: number
): number {
  if (!raw) return fallback;
  const n = Number.parseFloat(raw);
  return Number.isFinite(n) && n >= min && n <= max ? n : fallback;
}

export function getProposalAiModel(): string {
  return process.env.PROPOSAL_AI_GEMINI_MODEL?.trim() || DEFAULT_PROPOSAL_AI_MODEL;
}

export function getProposalAiLightModel(): string {
  return (
    process.env.PROPOSAL_AI_LIGHT_GEMINI_MODEL?.trim() ||
    DEFAULT_PROPOSAL_AI_LIGHT_MODEL
  );
}

export function getProposalAiTemperature(): number {
  return parseFloatInRange(
    process.env.PROPOSAL_AI_TEMPERATURE,
    DEFAULT_PROPOSAL_AI_TEMPERATURE,
    0,
    2
  );
}

export function getProposalAiMaxOutputTokens(): number {
  return parsePositiveInt(
    process.env.PROPOSAL_AI_MAX_OUTPUT_TOKENS,
    DEFAULT_PROPOSAL_AI_MAX_OUTPUT_TOKENS
  );
}

export function getProposalAiTimeoutMs(): number {
  return parsePositiveInt(
    process.env.PROPOSAL_AI_TIMEOUT_MS,
    DEFAULT_PROPOSAL_AI_TIMEOUT_MS
  );
}

export function getProposalGuardrailRetry(): number {
  return parseNonNegativeInt(
    process.env.PROPOSAL_AI_GUARDRAIL_RETRY,
    DEFAULT_PROPOSAL_GUARDRAIL_RETRY
  );
}

export function getProposalAiTransportRetry(): number {
  return parseNonNegativeInt(
    process.env.PROPOSAL_AI_TRANSPORT_RETRY,
    DEFAULT_PROPOSAL_AI_TRANSPORT_RETRY
  );
}

/**
 * Guardrail estrito ligado por padrão. `PROPOSAL_AI_STRICT_NUMBERS=0` só deve
 * ser usado para depurar prompt em desenvolvimento — em produção, um rascunho
 * com número inventado é exatamente o defeito que esta camada existe para
 * eliminar.
 */
export function isProposalNumberGuardStrict(): boolean {
  const raw = process.env.PROPOSAL_AI_STRICT_NUMBERS?.trim();
  if (raw === undefined || raw === '') return true;
  return raw !== '0' && raw.toLowerCase() !== 'false';
}
