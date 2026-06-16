import { revalidatePath } from 'next/cache';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createSupabaseServiceRoleClient } from '@/lib/supabaseServer';
import { runExtractionPipelineStep } from '@/services/suppliers/runExtractionPipelineStep';

async function markJobError(
  supabase: SupabaseClient,
  jobId: string,
  message: string
): Promise<void> {
  await supabase
    .from('extraction_jobs')
    .update({
      status: 'error',
      error_message: message,
      finished_at: new Date().toISOString(),
    })
    .eq('id', jobId);
}

/**
 * @deprecated Use runExtractionPipelineStep via /api/process-pdfs e /api/process-pdfs/continue.
 * Mantido para compatibilidade local — executa steps em loop síncrono.
 */
export async function runExtractionJob(jobId: string): Promise<void> {
  let supabase: SupabaseClient;
  try {
    supabase = createSupabaseServiceRoleClient();
  } catch (e) {
    console.error('[runExtractionJob] service role indisponível:', e);
    return;
  }

  try {
    let iterations = 0;
    const maxIterations = 200;

    while (iterations < maxIterations) {
      iterations++;
      const { hasMore } = await runExtractionPipelineStep(jobId);

      if (!hasMore) {
        return;
      }
    }

    await markJobError(supabase, jobId, 'Pipeline excedeu o limite de iterações.');
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro inesperado ao processar o PDF.';
    console.error('[runExtractionJob]', jobId, err);
    await markJobError(supabase, jobId, message);
  }
}
