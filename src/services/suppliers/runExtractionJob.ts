import type { SupabaseClient } from '@supabase/supabase-js';
import { createSupabaseServiceRoleClient } from '@/lib/supabaseServer';
import { extractTextFromPdfBuffer } from '@/services/pdf/extractPdfText';
import { extractSupplierQuoteWithGemini } from '@/services/ai/geminiSupplierQuote';
import { persistSupplierQuoteFromExtraction } from '@/services/suppliers/persistSupplierQuoteFromExtraction';
import { autoMatchQuoteItems } from '@/services/suppliers/autoMatchQuoteItems';

function deriveSupplierName(filePath: string, explicit?: string | null): string {
  const trimmed = explicit?.trim();
  if (trimmed) return trimmed;
  const base = filePath.split('/').pop() ?? 'fornecedor';
  return base.replace(/\.pdf$/i, '').replace(/[_-]+/g, ' ').trim() || 'Fornecedor';
}

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
 * Processamento pesado do job (service role, sem cookies/getUser).
 * Chamado via `after()` a partir da rota POST.
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
    const { data: job, error: jobError } = await supabase
      .from('extraction_jobs')
      .select(
        `
        id,
        user_id,
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
      .single();

    if (jobError || !job) {
      console.error('[runExtractionJob] job não encontrado:', jobId, jobError?.message);
      return;
    }

    if (job.status === 'completed') {
      return;
    }

    if (job.status !== 'processing') {
      console.warn('[runExtractionJob] status inesperado, ignorando:', job.status, jobId);
      return;
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
      await markJobError(supabase, jobId, 'Sessão inválida.');
      return;
    }

    if (session.status === 'completed') {
      await markJobError(
        supabase,
        jobId,
        'Esta sessão está encerrada; não é possível processar novos arquivos.'
      );
      return;
    }

    const userId = job.user_id as string;

    const { data: blob, error: downloadError } = await supabase.storage
      .from('fornecedores_pdfs')
      .download(job.file_path);

    if (downloadError || !blob) {
      const msg = `Erro ao baixar o PDF: ${downloadError?.message ?? 'arquivo não encontrado'}`;
      await markJobError(supabase, jobId, msg);
      return;
    }

    const buffer = Buffer.from(await blob.arrayBuffer());

    let pdfText: string;
    let numpages: number;
    try {
      const extracted = await extractTextFromPdfBuffer(buffer);
      pdfText = extracted.text;
      numpages = extracted.numpages;
    } catch (parseErr) {
      console.error('[runExtractionJob] pdf2json', parseErr);
      await markJobError(
        supabase,
        jobId,
        'Não foi possível extrair o texto do PDF. Verifique se o arquivo não está protegido ou corrompido.'
      );
      return;
    }

    if (!pdfText.trim()) {
      await markJobError(
        supabase,
        jobId,
        'O PDF não contém texto legível. O arquivo pode ser baseado em imagens.'
      );
      return;
    }

    const estimatedSeconds = Math.max(15, numpages * 8);
    await supabase.from('extraction_jobs').update({ estimated_time: estimatedSeconds }).eq('id', jobId);

    const gemini = await extractSupplierQuoteWithGemini(pdfText);
    if (!gemini.success) {
      await markJobError(supabase, jobId, gemini.error);
      return;
    }

    const supplierName = deriveSupplierName(job.file_path, job.supplier_name);

    const persist = await persistSupplierQuoteFromExtraction(supabase, {
      userId,
      budgetId: session.budget_id,
      sessionId: session.id,
      supplierName,
      pdfPath: job.file_path,
      observacoesGerais: gemini.data.observacoesGerais,
      items: gemini.data.items,
    });

    if ('error' in persist) {
      await markJobError(supabase, jobId, persist.error);
      return;
    }

    await supabase
      .from('extraction_jobs')
      .update({
        status: 'completed',
        quote_id: persist.quoteId,
        finished_at: new Date().toISOString(),
      })
      .eq('id', jobId);

    await autoMatchQuoteItems(supabase, userId, persist.quoteId).catch((err) => {
      console.warn('[runExtractionJob] auto-match não bloqueante:', err);
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro inesperado ao processar o PDF.';
    console.error('[runExtractionJob]', jobId, err);
    await markJobError(supabase, jobId, message);
  }
}
