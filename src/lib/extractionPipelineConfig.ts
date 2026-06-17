/** Limite por invocação no Vercel Hobby (sem Pro). */
export const PIPELINE_MAX_DURATION = 60;

/** Jobs em extract sem quote_id: marcar error após este tempo. */
export const EXTRACT_STUCK_ERROR_MS = 10 * 60 * 1000;

/** UI: botão "Retomar" após este tempo em processing. */
export const EXTRACT_UI_STUCK_MS = 3 * 60 * 1000;

/** Auto-retomada na UI após este tempo. */
export const EXTRACT_AUTO_RESUME_MS = 60 * 1000;

/**
 * Orçamento de tempo por invocação do /continue para a fase de match (L2).
 * Após este tempo (com ao menos 1 lote processado), para e delega o restante à
 * próxima chamada. Deixa ~30s de margem antes do timeout de 60s do Vercel Hobby.
 */
export const MATCH_INVOCATION_BUDGET_MS = 30_000;

/** Cooldown mínimo entre tentativas de recovery do pipeline (post_extract / match). */
export const PIPELINE_RECOVERY_COOLDOWN_MS = 5 * 60 * 1000;

/** Número máximo de tentativas de recovery por job por sessão do browser. */
export const PIPELINE_MAX_RECOVERY_ATTEMPTS = 5;

/**
 * Watchdog server-side (pg_cron + pg_net). Estes valores documentam os intervalos
 * que a função SQL `public.drive_stuck_extraction_jobs()` usa (a SQL fixa os literais).
 * O watchdog roda no Supabase a cada 1 min e move jobs travados independente do navegador.
 */
/** Janela de inatividade (sem escrita em updated_at) antes de considerar um job travado. */
export const WATCHDOG_STALE_MS = 120_000;
/** Intervalo mínimo entre disparos (re-invoke/continue) do mesmo job. > teto de ~150s da Edge. */
export const WATCHDOG_DISPATCH_COOLDOWN_MS = 180_000;
/**
 * Só re-invoca a Edge de extração após este tempo desde started_at (job sem cotação).
 * Maior que o teto de wall-clock da Edge (~150s), garantindo que nenhuma extração
 * concorrente esteja em voo — impede extração/cotação duplicada SEM alterar a Edge.
 */
export const WATCHDOG_EXTRACT_REINVOKE_AFTER_MS = 240_000;
/** Marca erro se a extração (job sem cotação na fase extract) passar deste tempo. */
export const WATCHDOG_EXTRACT_HARD_TIMEOUT_MS = 15 * 60 * 1000;

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
