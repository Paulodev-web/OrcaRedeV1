import { getAcceptedAuthTokens, getServiceRoleKey } from './envKeys.ts';

function getChainAuthToken(): string | undefined {
  const jobSecret =
    Deno.env.get('INTERNAL_JOB_SECRET')?.trim() ||
    Deno.env.get('ORCAREDE_JOB_SECRET')?.trim();
  if (jobSecret) return jobSecret;

  return getServiceRoleKey();
}

export async function chainToVercelContinue(
  jobId: string,
  authTokenOverride?: string
): Promise<void> {
  const secret = authTokenOverride?.trim() || getChainAuthToken();
  const continueUrl =
    Deno.env.get('PIPELINE_CONTINUE_URL')?.trim() ||
    'https://orcaredeteste.vercel.app/api/process-pdfs/continue';

  if (!secret) {
    console.error('[chainToVercel] nenhum token de chain configurado; job', jobId);
    return;
  }

  try {
    const res = await fetch(continueUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${secret}`,
      },
      body: JSON.stringify({ job_id: jobId }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.warn('[chainToVercel] /continue respondeu', res.status, jobId, body.slice(0, 200));
    }
  } catch (err) {
    console.warn('[chainToVercel] falha ao encadear job', jobId, err);
  }
}
