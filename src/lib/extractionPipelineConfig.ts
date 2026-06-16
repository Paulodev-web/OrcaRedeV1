/** Limite por invocação no Vercel Hobby (sem Pro). */
export const PIPELINE_MAX_DURATION = 60;

/** Jobs em extract sem quote_id: marcar error após este tempo. */
export const EXTRACT_STUCK_ERROR_MS = 10 * 60 * 1000;

/** UI: botão "Retomar" após este tempo em processing. */
export const EXTRACT_UI_STUCK_MS = 3 * 60 * 1000;

/** Auto-retomada na UI após este tempo. */
export const EXTRACT_AUTO_RESUME_MS = 60 * 1000;

export const EXTRACT_TIMEOUT_ERROR_MESSAGE =
  'Processamento expirou (extração não concluída). Use "Tentar processar novamente" ou exclua.';

/** Lote menor por step para caber em ~60s por invocação. */
export const STEP_MODE_SEMANTIC_MATCH_BATCH_SIZE = 5;

/** Candidatos reduzidos no modo step. */
export const STEP_MODE_SEMANTIC_MATCH_MAX_CANDIDATES = 30;

export function getInternalJobSecret(): string | undefined {
  return (
    process.env.INTERNAL_JOB_SECRET?.trim() ||
    process.env.ORCAREDE_JOB_SECRET?.trim() ||
    undefined
  );
}

export function getSupabaseExtractFunctionUrl(): string | undefined {
  const base =
    process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, '') ||
    process.env.SUPABASE_URL?.replace(/\/$/, '');
  if (!base) return undefined;
  return `${base}/functions/v1/extract-supplier-pdf`;
}

export function getPipelineContinueUrl(): string {
  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') ||
    process.env.VERCEL_PROJECT_PRODUCTION_URL?.replace(/\/$/, '');
  if (appUrl) {
    return `${appUrl.startsWith('http') ? appUrl : `https://${appUrl}`}/api/process-pdfs/continue`;
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}/api/process-pdfs/continue`;
  }
  return 'http://localhost:3000/api/process-pdfs/continue';
}
