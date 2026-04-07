import { after, NextResponse } from 'next/server';
import {
  createSupabaseServerClient,
  createSupabaseServiceRoleClient,
  requireAuthUserId,
} from '@/lib/supabaseServer';
import { runExtractionJob } from '@/services/suppliers/runExtractionJob';

export const runtime = 'nodejs';

async function markJobErrorServiceRole(jobId: string, message: string): Promise<void> {
  try {
    const supabase = createSupabaseServiceRoleClient();
    await supabase
      .from('extraction_jobs')
      .update({
        status: 'error',
        error_message: message,
        finished_at: new Date().toISOString(),
      })
      .eq('id', jobId);
  } catch (e) {
    console.error('[process-pdfs] falha ao marcar job em erro:', jobId, e);
  }
}

export async function POST(request: Request) {
  let jobId: string | undefined;
  let processingClaimed = false;

  try {
    const body = (await request.json()) as { job_id?: string };
    jobId = body.job_id;
    if (!jobId || typeof jobId !== 'string') {
      return NextResponse.json({ error: 'job_id é obrigatório.' }, { status: 400 });
    }

    const supabase = await createSupabaseServerClient();
    const userId = await requireAuthUserId(supabase);

    const { data: job, error: jobError } = await supabase
      .from('extraction_jobs')
      .select(
        `
        id,
        session_id,
        file_path,
        status,
        supplier_name,
        quote_id,
        quotation_sessions (
          id,
          budget_id,
          status
        )
      `
      )
      .eq('id', jobId)
      .eq('user_id', userId)
      .single();

    if (jobError || !job) {
      return NextResponse.json({ error: 'Job não encontrado.' }, { status: 404 });
    }

    const sessionRaw = job.quotation_sessions as unknown;
    const session = (
      Array.isArray(sessionRaw) ? sessionRaw[0] : sessionRaw
    ) as {
      id: string;
      budget_id: string | null;
      status: string;
    } | null;

    if (!session) {
      return NextResponse.json({ error: 'Sessão inválida.' }, { status: 400 });
    }

    if (session.status === 'completed') {
      return NextResponse.json(
        { error: 'Esta sessão está encerrada; não é possível processar novos arquivos.' },
        { status: 409 }
      );
    }

    if (job.status === 'completed') {
      return NextResponse.json({
        ok: true,
        message: 'Job já concluído.',
        quote_id: job.quote_id as string | null,
      });
    }

    if (job.status === 'processing') {
      return NextResponse.json({ error: 'Job já está em processamento.' }, { status: 409 });
    }

    if (job.status !== 'pending') {
      return NextResponse.json(
        { error: 'Job não pode ser processado neste estado.' },
        { status: 409 }
      );
    }

    const { data: claimed, error: claimError } = await supabase
      .from('extraction_jobs')
      .update({
        status: 'processing',
        started_at: new Date().toISOString(),
        error_message: null,
      })
      .eq('id', jobId)
      .eq('status', 'pending')
      .select('id')
      .maybeSingle();

    if (claimError || !claimed) {
      return NextResponse.json(
        { error: 'Job não encontrado ou já em processamento.' },
        { status: 409 }
      );
    }

    processingClaimed = true;

    after(() => runExtractionJob(jobId!));

    return NextResponse.json({ status: 'queued', job_id: jobId }, { status: 202 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro inesperado ao enfileirar o job.';
    console.error('[process-pdfs]', err);
    if (jobId && processingClaimed) {
      await markJobErrorServiceRole(jobId, message);
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
