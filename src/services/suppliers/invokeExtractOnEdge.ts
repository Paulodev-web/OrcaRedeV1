import {
  getInternalJobSecret,
  getSupabaseExtractFunctionUrl,
  getPipelineContinueUrl,
} from '@/lib/extractionPipelineConfig';

/**
 * Dispara extração (Gemini + persist) na Edge Function Supabase.
 * Fire-and-forget: não aguarda a Edge terminar (evita 504 em /continue).
 */
export function invokeExtractOnEdge(jobId: string): void {
  // Prefer service role: always available on Vercel; Edge accepts via SUPABASE_SECRET_KEYS.
  const secret =
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || getInternalJobSecret();
  const url = getSupabaseExtractFunctionUrl();

  if (!secret) {
    console.error(
      '[invokeExtractOnEdge] INTERNAL_JOB_SECRET ou SUPABASE_SERVICE_ROLE_KEY não configurado; job',
      jobId
    );
    return;
  }

  if (!url) {
    console.error('[invokeExtractOnEdge] URL da Edge não configurada; job', jobId);
    return;
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${secret}`,
  };

  const geminiKey = process.env.GEMINI_API_KEY?.trim();
  if (geminiKey) {
    headers['x-orcarede-gemini-pass'] = geminiKey;
  }

  const chainToken =
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || getInternalJobSecret();

  void fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      job_id: jobId,
      chain_token: chainToken,
      pipeline_continue_url: getPipelineContinueUrl(),
    }),
  })
    .then(async (res) => {
      if (!res.ok && res.status !== 202) {
        const body = await res.text().catch(() => '');
        console.warn(
          '[invokeExtractOnEdge] Edge respondeu',
          res.status,
          jobId,
          body.slice(0, 200)
        );
      }
    })
    .catch((err) => {
      console.warn('[invokeExtractOnEdge] falha ao invocar Edge', jobId, err);
    });
}
