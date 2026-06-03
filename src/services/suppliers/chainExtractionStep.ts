import { getInternalJobSecret, getPipelineContinueUrl } from '@/lib/extractionPipelineConfig';

/**
 * Dispara a próxima invocação do pipeline (fire-and-forget).
 */
export function chainExtractionStep(jobId: string): void {
  const secret = getInternalJobSecret();
  if (!secret) {
    console.error(
      '[chainExtractionStep] INTERNAL_JOB_SECRET não configurado; pipeline não continuará para job',
      jobId
    );
    return;
  }

  const url = getPipelineContinueUrl();

  void fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${secret}`,
    },
    body: JSON.stringify({ job_id: jobId }),
  }).catch((err) => {
    console.warn('[chainExtractionStep] falha ao encadear job', jobId, err);
  });
}
