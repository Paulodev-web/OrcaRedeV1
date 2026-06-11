import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { authorizeExtractRequest } from '../_shared/auth.ts';
import { chainToVercelContinue } from '../_shared/chainToVercel.ts';
import { extractSupplierQuoteWithGemini } from '../_shared/geminiExtract.ts';
import { persistSupplierQuoteFromExtraction } from '../_shared/persistQuote.ts';
import { createAdminClient } from '../_shared/supabaseAdmin.ts';

const JSON_HEADERS = { 'Content-Type': 'application/json' };

async function markJobError(jobId: string, message: string): Promise<void> {
  const supabase = createAdminClient();
  await supabase
    .from('extraction_jobs')
    .update({
      status: 'error',
      error_message: message,
      finished_at: new Date().toISOString(),
    })
    .eq('id', jobId);
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: JSON_HEADERS,
    });
  }

  if (!authorizeExtractRequest(req)) {
    return new Response(JSON.stringify({ error: 'Não autorizado.' }), {
      status: 401,
      headers: JSON_HEADERS,
    });
  }

  let jobId: string | undefined;

  try {
    const body = (await req.json()) as { job_id?: string; chain_token?: string };
    jobId = body.job_id;
    const chainToken =
      body.chain_token?.trim() || req.headers.get('x-orcarede-chain-pass')?.trim();

    if (!jobId || typeof jobId !== 'string') {
      return new Response(JSON.stringify({ error: 'job_id é obrigatório.' }), {
        status: 400,
        headers: JSON_HEADERS,
      });
    }

    const supabase = createAdminClient();
    const geminiKeyPass = req.headers.get('x-orcarede-gemini-pass')?.trim();

    const { data: job, error: jobError } = await supabase
      .from('extraction_jobs')
      .select(
        `
        id,
        user_id,
        session_id,
        file_path,
        status,
        supplier_id,
        quotation_sessions (
          id,
          budget_id,
          status
        )
      `
      )
      .eq('id', jobId)
      .single();

    if (jobError || !job) {
      return new Response(JSON.stringify({ error: 'Job não encontrado.' }), {
        status: 404,
        headers: JSON_HEADERS,
      });
    }

    if (job.status !== 'processing') {
      return new Response(
        JSON.stringify({ error: 'Job não está em processamento.' }),
        { status: 409, headers: JSON_HEADERS }
      );
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
      await markJobError(jobId, 'Sessão inválida.');
      return new Response(JSON.stringify({ error: 'Sessão inválida.' }), {
        status: 400,
        headers: JSON_HEADERS,
      });
    }

    if (session.status === 'completed') {
      await markJobError(
        jobId,
        'Esta sessão está encerrada; não é possível processar novos arquivos.'
      );
      return new Response(JSON.stringify({ error: 'Sessão encerrada.' }), {
        status: 409,
        headers: JSON_HEADERS,
      });
    }

    const filePath = job.file_path as string;
    const userId = job.user_id as string;
    const supplierId = job.supplier_id as string | null;

    if (!supplierId) {
      await markJobError(
        jobId,
        'Selecione um fornecedor cadastrado antes de processar o PDF.'
      );
      return new Response(JSON.stringify({ error: 'Fornecedor não selecionado.' }), {
        status: 400,
        headers: JSON_HEADERS,
      });
    }

    const { data: blob, error: downloadError } = await supabase.storage
      .from('fornecedores_pdfs')
      .download(filePath);

    if (downloadError || !blob) {
      const msg = `Erro ao baixar o PDF: ${downloadError?.message ?? 'arquivo não encontrado'}`;
      await markJobError(jobId, msg);
      return new Response(JSON.stringify({ error: msg }), {
        status: 400,
        headers: JSON_HEADERS,
      });
    }

    const buffer = new Uint8Array(await blob.arrayBuffer());

    if (buffer.length < 200) {
      await markJobError(jobId, 'O arquivo PDF parece estar vazio ou corrompido.');
      return new Response(JSON.stringify({ error: 'PDF inválido.' }), {
        status: 400,
        headers: JSON_HEADERS,
      });
    }

    const estimatedSeconds = Math.max(20, Math.round(buffer.length / 50_000));
    await supabase.from('extraction_jobs').update({ estimated_time: estimatedSeconds }).eq('id', jobId);

    const gemini = await extractSupplierQuoteWithGemini(buffer, geminiKeyPass);
    if (!gemini.success) {
      await markJobError(jobId, gemini.error);
      return new Response(JSON.stringify({ error: gemini.error }), {
        status: 500,
        headers: JSON_HEADERS,
      });
    }

    const persist = await persistSupplierQuoteFromExtraction(supabase, {
      userId,
      budgetId: session.budget_id,
      sessionId: session.id,
      supplierId,
      pdfPath: filePath,
      observacoesGerais: gemini.data.observacoesGerais,
      quoteDate: gemini.data.quoteDate,
      items: gemini.data.items,
    });

    if ('error' in persist) {
      await markJobError(jobId, persist.error);
      return new Response(JSON.stringify({ error: persist.error }), {
        status: 500,
        headers: JSON_HEADERS,
      });
    }

    const { error: phaseError } = await supabase
      .from('extraction_jobs')
      .update({
        quote_id: persist.quoteId,
        pipeline_phase: 'post_extract',
        match_batch_index: 0,
        match_total_batches: null,
        pipeline_context: null,
      })
      .eq('id', jobId);

    if (phaseError) {
      await markJobError(jobId, `Erro ao atualizar fase do job: ${phaseError.message}`);
      return new Response(JSON.stringify({ error: phaseError.message }), {
        status: 500,
        headers: JSON_HEADERS,
      });
    }

    await chainToVercelContinue(jobId, chainToken);

    return new Response(
      JSON.stringify({
        ok: true,
        job_id: jobId,
        quote_id: persist.quoteId,
        pipeline_phase: 'post_extract',
      }),
      { status: 200, headers: JSON_HEADERS }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro inesperado na extração.';
    console.error('[extract-supplier-pdf]', jobId, err);
    if (jobId) {
      await markJobError(jobId, message);
    }
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: JSON_HEADERS,
    });
  }
});
