import { getInternalJobSecret, getPipelineContinueUrl } from '@/lib/extractionPipelineConfig';

/**
 * Dispara a próxima invocação do pipeline.
 * Deve ser chamado via `after()` na rota — fetch solto morre ao encerrar a lambda.
 */
export async function chainExtractionStep(jobId: string): Promise<void> {
  const secret = getInternalJobSecret();
  if (!secret) {
    console.error(
      '[chainExtractionStep] INTERNAL_JOB_SECRET não configurado; pipeline não continuará para job',
      jobId
    );
    return;
  }

  const url = getPipelineContinueUrl();

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${secret}`,
      },
      body: JSON.stringify({ job_id: jobId }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.warn(
        '[chainExtractionStep] /continue respondeu',
        res.status,
        jobId,
        body.slice(0, 200)
      );
    }
  } catch (err) {
    console.warn('[chainExtractionStep] falha ao encadear job', jobId, err);
  }
}
