import type { SupabaseClient } from '@supabase/supabase-js';
import {
  createSupabaseServerClient,
  createSupabaseServiceRoleClient,
  requireAuthUserId,
} from '@/lib/supabaseServer';

const STORAGE_BUCKET = 'fornecedores_pdfs';

export type DeleteUploadedPdfInput = {
  sessionId: string;
  jobId?: string;
  quoteId?: string;
};

type JobRow = {
  id: string;
  session_id: string;
  user_id: string;
  file_path: string;
  status: string;
  quote_id: string | null;
};

async function loadJob(
  supabase: SupabaseClient,
  userId: string,
  sessionId: string,
  jobId: string
): Promise<JobRow | { error: string }> {
  const { data, error } = await supabase
    .from('extraction_jobs')
    .select('id, session_id, user_id, file_path, status, quote_id')
    .eq('id', jobId)
    .eq('user_id', userId)
    .eq('session_id', sessionId)
    .maybeSingle();

  if (error) return { error: error.message };
  if (!data) return { error: 'Job de extração não encontrado.' };
  return data as JobRow;
}

async function loadJobByQuoteId(
  supabase: SupabaseClient,
  userId: string,
  sessionId: string,
  quoteId: string
): Promise<JobRow | null | { error: string }> {
  const { data, error } = await supabase
    .from('extraction_jobs')
    .select('id, session_id, user_id, file_path, status, quote_id')
    .eq('quote_id', quoteId)
    .eq('user_id', userId)
    .eq('session_id', sessionId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return { error: error.message };
  return data ? (data as JobRow) : null;
}

async function loadQuotePdfPath(
  supabase: SupabaseClient,
  userId: string,
  sessionId: string,
  quoteId: string
): Promise<{ id: string; pdf_path: string } | { error: string }> {
  const { data, error } = await supabase
    .from('supplier_quotes')
    .select('id, pdf_path')
    .eq('id', quoteId)
    .eq('user_id', userId)
    .eq('session_id', sessionId)
    .maybeSingle();

  if (error) return { error: error.message };
  if (!data) return { error: 'Cotação não encontrada nesta sessão.' };
  return data;
}

function validateStoragePath(filePath: string, userId: string, sessionId: string): boolean {
  const expectedPrefix = `${userId}/${sessionId}/`;
  return filePath.startsWith(expectedPrefix);
}

async function removeStoragePdf(filePath: string): Promise<void> {
  try {
    const serviceRole = createSupabaseServiceRoleClient();
    const { error } = await serviceRole.storage.from(STORAGE_BUCKET).remove([filePath]);
    if (error) {
      const msg = error.message.toLowerCase();
      if (msg.includes('not found') || msg.includes('object not found')) return;
      console.warn('[deleteUploadedPdfCascade] storage remove:', error.message);
    }
  } catch (err) {
    console.warn('[deleteUploadedPdfCascade] storage remove failed:', err);
  }
}

export async function deleteUploadedPdfCascade(
  input: DeleteUploadedPdfInput
): Promise<{ success: true } | { error: string }> {
  const sessionId = input.sessionId?.trim();
  const jobId = input.jobId?.trim();
  const quoteId = input.quoteId?.trim();

  if (!sessionId) return { error: 'Sessão inválida.' };
  if (!jobId && !quoteId) {
    return { error: 'Informe o job ou a cotação a excluir.' };
  }

  const supabase = await createSupabaseServerClient();
  const userId = await requireAuthUserId(supabase);

  const { data: session, error: sessionError } = await supabase
    .from('quotation_sessions')
    .select('id, status')
    .eq('id', sessionId)
    .eq('user_id', userId)
    .maybeSingle();

  if (sessionError) return { error: sessionError.message };
  if (!session) return { error: 'Sessão não encontrada.' };
  if (session.status === 'completed') {
    return { error: 'Esta sessão está encerrada; não é possível excluir PDFs.' };
  }

  let job: JobRow | null = null;
  let resolvedQuoteId = quoteId ?? null;
  let filePath: string | null = null;

  if (jobId) {
    const loaded = await loadJob(supabase, userId, sessionId, jobId);
    if ('error' in loaded) return { error: loaded.error };
    job = loaded;
    filePath = job.file_path;
    if (!resolvedQuoteId && job.quote_id) resolvedQuoteId = job.quote_id;
  }

  if (quoteId && !job) {
    const byQuote = await loadJobByQuoteId(supabase, userId, sessionId, quoteId);
    if (byQuote && 'error' in byQuote) return { error: byQuote.error };
    if (byQuote) job = byQuote;
  }

  if (!filePath && quoteId) {
    const quote = await loadQuotePdfPath(supabase, userId, sessionId, quoteId);
    if ('error' in quote) return { error: quote.error };
    filePath = quote.pdf_path;
    resolvedQuoteId = quote.id;
  }

  if (job?.status === 'processing') {
    return { error: 'Aguarde o processamento terminar antes de excluir este PDF.' };
  }

  if (filePath && !validateStoragePath(filePath, userId, sessionId)) {
    return { error: 'Caminho do arquivo inválido para esta sessão.' };
  }

  if (resolvedQuoteId) {
    // Exclusão cirúrgica por id — não usar pdf_path para evitar deletar cotações de outros PDFs com mesmo caminho
    const { error: quotesError } = await supabase
      .from('supplier_quotes')
      .delete()
      .eq('user_id', userId)
      .eq('session_id', sessionId)
      .eq('id', resolvedQuoteId);
    if (quotesError) return { error: quotesError.message };
  } else if (filePath) {
    // Sem quoteId conhecido: limpeza de órfãos pelo caminho do arquivo
    const { error: quotesError } = await supabase
      .from('supplier_quotes')
      .delete()
      .eq('user_id', userId)
      .eq('session_id', sessionId)
      .eq('pdf_path', filePath);
    if (quotesError) return { error: quotesError.message };
  }

  const jobIdsToDelete = new Set<string>();
  if (job) jobIdsToDelete.add(job.id);
  if (jobId) jobIdsToDelete.add(jobId);

  if (filePath) {
    const { data: siblingJobs, error: siblingError } = await supabase
      .from('extraction_jobs')
      .select('id')
      .eq('session_id', sessionId)
      .eq('user_id', userId)
      .eq('file_path', filePath);

    if (siblingError) return { error: siblingError.message };
    for (const row of siblingJobs ?? []) {
      jobIdsToDelete.add(row.id);
    }
  }

  if (jobIdsToDelete.size > 0) {
    const { error: jobsError } = await supabase
      .from('extraction_jobs')
      .delete()
      .in('id', [...jobIdsToDelete])
      .eq('user_id', userId)
      .eq('session_id', sessionId);

    if (jobsError) return { error: jobsError.message };
  }

  if (filePath) {
    await removeStoragePdf(filePath);
  }

  return { success: true };
}
