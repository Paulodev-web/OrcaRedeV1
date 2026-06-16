import { after } from 'next/server';
import { NextResponse } from 'next/server';
import {
  createSupabaseServerClient,
  createSupabaseServiceRoleClient,
  requireAuthUserId,
} from '@/lib/supabaseServer';
import { getInternalJobSecret } from '@/lib/extractionPipelineConfig';
import { chainExtractionStep } from '@/services/suppliers/chainExtractionStep';
import { runExtractionPipelineStep } from '@/services/suppliers/runExtractionPipelineStep';

export const runtime = 'nodejs';
/** Um step por invocação — compatível com Vercel Hobby (até 60s). */
export const maxDuration = 60;

async function authorizeContinueRequest(
  request: Request,
  jobId: string
): Promise<{ authorized: boolean; error?: string }> {
  const secret = getInternalJobSecret();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const authHeader = request.headers.get('authorization');
  const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (secret && bearerToken === secret) {
    return { authorized: true };
  }

  if (serviceRoleKey && bearerToken === serviceRoleKey) {
    return { authorized: true };
  }

  try {
    const supabase = await createSupabaseServerClient();
    const userId = await requireAuthUserId(supabase);

    const { data: job, error } = await supabase
      .from('extraction_jobs')
      .select('id')
      .eq('id', jobId)
      .eq('user_id', userId)
      .maybeSingle();

    if (error || !job) {
      return { authorized: false, error: 'Job não encontrado.' };
    }

    return { authorized: true };
  } catch {
    return { authorized: false, error: 'Não autorizado.' };
  }
}

export async function POST(request: Request) {
  let jobId: string | undefined;

  try {
    const body = (await request.json()) as { job_id?: string };
    jobId = body.job_id;

    if (!jobId || typeof jobId !== 'string') {
      return NextResponse.json({ error: 'job_id é obrigatório.' }, { status: 400 });
    }

    const auth = await authorizeContinueRequest(request, jobId);
    if (!auth.authorized) {
      return NextResponse.json({ error: auth.error ?? 'Não autorizado.' }, { status: 401 });
    }

    const supabase = createSupabaseServiceRoleClient();
    const { data: job, error: jobError } = await supabase
      .from('extraction_jobs')
      .select('id, status')
      .eq('id', jobId)
      .single();

    if (jobError || !job) {
      return NextResponse.json({ error: 'Job não encontrado.' }, { status: 404 });
    }

    if (job.status === 'completed') {
      return NextResponse.json({ ok: true, message: 'Job já concluído.' });
    }

    if (job.status !== 'processing') {
      return NextResponse.json(
        { error: 'Job não está em processamento.' },
        { status: 409 }
      );
    }

    const stepResult = await runExtractionPipelineStep(jobId);
    if (stepResult.hasMore) {
      const resolvedJobId = jobId;
      after(async () => {
        await chainExtractionStep(resolvedJobId);
      });
    }

    return NextResponse.json({ ok: true, job_id: jobId, has_more: stepResult.hasMore });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro inesperado ao continuar o job.';
    console.error('[process-pdfs/continue]', err);
    if (jobId) {
      try {
        const supabase = createSupabaseServiceRoleClient();
        await supabase
          .from('extraction_jobs')
          .update({ status: 'error', error_message: message, finished_at: new Date().toISOString() })
          .eq('id', jobId)
          .eq('status', 'processing');
      } catch {}
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
