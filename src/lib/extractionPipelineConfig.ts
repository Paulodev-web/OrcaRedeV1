/** Limite por invocação no Vercel Hobby (sem Pro). */
export const PIPELINE_MAX_DURATION = 60;

/** Lote menor por step para caber em ~60s por invocação. */
export const STEP_MODE_SEMANTIC_MATCH_BATCH_SIZE = 5;

/** Candidatos reduzidos no modo step. */
export const STEP_MODE_SEMANTIC_MATCH_MAX_CANDIDATES = 30;

export function getInternalJobSecret(): string | undefined {
  return process.env.INTERNAL_JOB_SECRET?.trim() || undefined;
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
