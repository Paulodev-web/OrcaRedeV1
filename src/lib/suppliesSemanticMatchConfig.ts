/** Tamanho padrão de lote para match semântico (Nível 2). */
export const DEFAULT_SEMANTIC_MATCH_BATCH_SIZE = 15;

/** Lote reduzido quando o orçamento tem BOM grande (>250 materiais). */
export const LARGE_BOM_SEMANTIC_MATCH_BATCH_SIZE = 12;

/** Limite de materiais candidatos enviados ao Gemini por lote. */
export const DEFAULT_SEMANTIC_MATCH_MAX_CANDIDATES = 60;

/** Mínimo de candidatos no prompt (fallback se o filtro retornar poucos). */
export const SEMANTIC_MATCH_MIN_CANDIDATES = 20;

/** Confiança mínima para auto-aplicar sugestão IA em supplier_quote_items. */
export const CONFIDENCE_AUTO_APPLY_THRESHOLD = 80;

/** Retentativas por lote em falha transitória do Gemini. */
export const DEFAULT_SEMANTIC_MATCH_BATCH_RETRY = 1;

/** Modelo Gemini para match semântico na conciliação (melhor que flash na extração). */
export const DEFAULT_SEMANTIC_MATCH_GEMINI_MODEL = 'gemini-2.5-pro';

/** BOM considerada "grande" — força lote menor. */
export const LARGE_BOM_MATERIAL_COUNT = 250;

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function getSemanticMatchBatchSize(
  systemMaterialCount: number,
  options?: { stepMode?: boolean }
): number {
  if (options?.stepMode) {
    return getSemanticMatchBatchSizeForStepMode(systemMaterialCount);
  }
  const fromEnv = parsePositiveInt(
    process.env.SEMANTIC_MATCH_BATCH_SIZE,
    DEFAULT_SEMANTIC_MATCH_BATCH_SIZE
  );
  if (systemMaterialCount > LARGE_BOM_MATERIAL_COUNT) {
    return Math.min(fromEnv, LARGE_BOM_SEMANTIC_MATCH_BATCH_SIZE);
  }
  return fromEnv;
}

/** Lotes menores para pipeline multi-step (Vercel Hobby ~60s por invocação). */
export function getSemanticMatchBatchSizeForStepMode(systemMaterialCount: number): number {
  const stepDefault = 5;
  const fromEnv = parsePositiveInt(process.env.SEMANTIC_MATCH_BATCH_SIZE, stepDefault);
  const capped = systemMaterialCount > LARGE_BOM_MATERIAL_COUNT ? Math.min(fromEnv, 4) : fromEnv;
  return Math.min(capped, stepDefault);
}

export function getSemanticMatchMaxCandidates(options?: { stepMode?: boolean }): number {
  if (options?.stepMode) {
    return parsePositiveInt(
      process.env.SEMANTIC_MATCH_MAX_CANDIDATES,
      30
    );
  }
  return parsePositiveInt(
    process.env.SEMANTIC_MATCH_MAX_CANDIDATES,
    DEFAULT_SEMANTIC_MATCH_MAX_CANDIDATES
  );
}

export function getSemanticMatchBatchRetry(): number {
  return parsePositiveInt(
    process.env.SEMANTIC_MATCH_BATCH_RETRY,
    DEFAULT_SEMANTIC_MATCH_BATCH_RETRY
  );
}

export function getSemanticMatchGeminiModel(): string {
  const fromEnv = process.env.SEMANTIC_MATCH_GEMINI_MODEL?.trim();
  return fromEnv || DEFAULT_SEMANTIC_MATCH_GEMINI_MODEL;
}
