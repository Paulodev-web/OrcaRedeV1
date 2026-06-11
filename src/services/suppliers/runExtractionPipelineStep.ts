import { revalidatePath } from 'next/cache';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createSupabaseServiceRoleClient } from '@/lib/supabaseServer';
import { autoMatchQuoteItems } from '@/services/suppliers/autoMatchQuoteItems';
import {
  buildSemanticMatchPipelineContext,
  runSingleSemanticMatchBatch,
  type SemanticMatchPipelineContext,
} from '@/services/suppliers/runSemanticMatchLevel2';

export type PipelinePhase = 'extract' | 'post_extract' | 'match' | 'finalize';

export interface PipelineContextJson {
  supplierName: string;
  budgetId: string | null;
  sessionId: string;
  batchItemIds: string[][];
}

export interface PipelineStepResult {
  hasMore: boolean;
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

function parsePipelineContext(raw: unknown): PipelineContextJson | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  if (typeof obj.supplierName !== 'string' || typeof obj.sessionId !== 'string') {
    return null;
  }
  const batchItemIds = obj.batchItemIds;
  if (!Array.isArray(batchItemIds)) return null;
  return {
    supplierName: obj.supplierName,
    budgetId: typeof obj.budgetId === 'string' ? obj.budgetId : null,
    sessionId: obj.sessionId,
    batchItemIds: batchItemIds as string[][],
  };
}

async function recoverMatchPhaseFromExistingQuote(
  supabase: SupabaseClient,
  jobId: string,
  job: Record<string, unknown>,
  quoteId: string
): Promise<PipelineStepResult> {
  const userId = job.user_id as string;
  const sessionRaw = job.quotation_sessions as unknown;
  const session = (
    Array.isArray(sessionRaw) ? sessionRaw[0] : sessionRaw
  ) as {
    id: string;
    budget_id: string | null;
  } | null;

  if (!session) {
    await markJobError(supabase, jobId, 'Sessão inválida.');
    return { hasMore: false };
  }

  const { data: quote } = await supabase
    .from('supplier_quotes')
    .select('supplier_name')
    .eq('id', quoteId)
    .single();

  const supplierName = quote?.supplier_name ?? 'Fornecedor';
  const matchCtx = await buildSemanticMatchPipelineContext(
    supabase,
    userId,
    quoteId,
    supplierName,
    session.budget_id,
    session.id,
    { stepMode: true }
  );

  const batchItemIds = matchCtx?.batchItemIds ?? [];
  const totalBatches = batchItemIds.length;
  const pipelineContext: PipelineContextJson = {
    supplierName,
    budgetId: session.budget_id,
    sessionId: session.id,
    batchItemIds,
  };

  if (totalBatches === 0) {
    await supabase
      .from('extraction_jobs')
      .update({
        pipeline_phase: 'finalize',
        match_batch_index: 0,
        match_total_batches: 0,
        pipeline_context: pipelineContext,
      })
      .eq('id', jobId);
    return { hasMore: true };
  }

  await supabase
    .from('extraction_jobs')
    .update({
      pipeline_phase: 'match',
      match_batch_index: 0,
      match_total_batches: totalBatches,
      pipeline_context: pipelineContext,
    })
    .eq('id', jobId);

  console.log(
    `[runExtractionPipelineStep] Recuperação: quote existente; ${totalBatches} lotes L2 agendados`
  );

  return { hasMore: true };
}

async function runPostExtractPhase(
  supabase: SupabaseClient,
  jobId: string,
  job: Record<string, unknown>
): Promise<PipelineStepResult> {
  const userId = job.user_id as string;
  const quoteId = job.quote_id as string | null;

  if (!quoteId) {
    console.warn('[runExtractionPipelineStep] post_extract sem quote_id; aguardando Edge', jobId);
    return { hasMore: false };
  }

  const sessionRaw = job.quotation_sessions as unknown;
  const session = (
    Array.isArray(sessionRaw) ? sessionRaw[0] : sessionRaw
  ) as {
    id: string;
    budget_id: string | null;
  } | null;

  if (!session) {
    await markJobError(supabase, jobId, 'Sessão inválida.');
    return { hasMore: false };
  }

  const { data: quote } = await supabase
    .from('supplier_quotes')
    .select('supplier_name')
    .eq('id', quoteId)
    .single();

  const supplierName = quote?.supplier_name ?? 'Fornecedor';

  const level1 = await autoMatchQuoteItems(supabase, userId, quoteId).catch((err) => {
    console.warn('[runExtractionPipelineStep] Nível 1 auto-match falhou:', err);
    return { matched: 0, total: 0 };
  });

  console.log(
    `[runExtractionPipelineStep] Nível 1 (memória): ${level1.matched}/${level1.total} itens vinculados`
  );

  const matchCtx = await buildSemanticMatchPipelineContext(
    supabase,
    userId,
    quoteId,
    supplierName,
    session.budget_id,
    session.id,
    { stepMode: true }
  );

  const batchItemIds = matchCtx?.batchItemIds ?? [];
  const totalBatches = batchItemIds.length;

  const pipelineContext: PipelineContextJson = {
    supplierName,
    budgetId: session.budget_id,
    sessionId: session.id,
    batchItemIds,
  };

  if (totalBatches === 0) {
    await supabase
      .from('extraction_jobs')
      .update({
        quote_id: quoteId,
        pipeline_phase: 'finalize',
        match_batch_index: 0,
        match_total_batches: 0,
        pipeline_context: pipelineContext,
      })
      .eq('id', jobId);

    console.log('[runExtractionPipelineStep] Sem itens pendentes para L2; indo para finalize');
    return { hasMore: true };
  }

  await supabase
    .from('extraction_jobs')
    .update({
      quote_id: quoteId,
      pipeline_phase: 'match',
      match_batch_index: 0,
      match_total_batches: totalBatches,
      pipeline_context: pipelineContext,
    })
    .eq('id', jobId);

  console.log(
    `[runExtractionPipelineStep] Pós-extração concluída; ${totalBatches} lotes L2 agendados`
  );

  return { hasMore: true };
}

async function runExtractPhase(
  supabase: SupabaseClient,
  jobId: string,
  job: Record<string, unknown>
): Promise<PipelineStepResult> {
  const existingQuoteId = job.quote_id as string | null;
  if (existingQuoteId) {
    return recoverMatchPhaseFromExistingQuote(supabase, jobId, job, existingQuoteId);
  }

  if (!job.quote_id) {
    console.warn('[runExtractionPipelineStep] extract aguardando Edge Function', jobId);
    return { hasMore: false };
  }

  await markJobError(
    supabase,
    jobId,
    'Extração deve ser executada na Edge Function. Reprocesse o PDF.'
  );
  return { hasMore: false };
}

async function runMatchPhase(
  supabase: SupabaseClient,
  jobId: string,
  job: Record<string, unknown>
): Promise<PipelineStepResult> {
  const userId = job.user_id as string;
  const quoteId = job.quote_id as string | null;
  const batchIndex = (job.match_batch_index as number) ?? 0;
  const pipelineContext = parsePipelineContext(job.pipeline_context);

  if (!quoteId || !pipelineContext) {
    await markJobError(supabase, jobId, 'Contexto do pipeline inválido para match semântico.');
    return { hasMore: false };
  }

  const semanticCtx: SemanticMatchPipelineContext = pipelineContext;

  const batchResult = await runSingleSemanticMatchBatch(
    supabase,
    userId,
    quoteId,
    semanticCtx,
    batchIndex,
    { stepMode: true }
  );

  const nextIndex = batchIndex + 1;
  const totalBatches = batchResult.totalBatches;

  if (batchResult.done || nextIndex >= totalBatches) {
    await supabase
      .from('extraction_jobs')
      .update({
        pipeline_phase: 'finalize',
        match_batch_index: nextIndex,
      })
      .eq('id', jobId);

    console.log(
      `[runExtractionPipelineStep] L2 concluído (${nextIndex}/${totalBatches} lotes processados)`
    );
    return { hasMore: true };
  }

  await supabase
    .from('extraction_jobs')
    .update({ match_batch_index: nextIndex })
    .eq('id', jobId);

  console.log(
    `[runExtractionPipelineStep] Lote L2 ${nextIndex}/${totalBatches} concluído; próximo lote pendente`
  );

  return { hasMore: true };
}

async function runFinalizePhase(
  supabase: SupabaseClient,
  jobId: string,
  job: Record<string, unknown>
): Promise<PipelineStepResult> {
  const sessionRaw = job.quotation_sessions as unknown;
  const session = (
    Array.isArray(sessionRaw) ? sessionRaw[0] : sessionRaw
  ) as { id: string } | null;

  const quoteId = job.quote_id as string | null;

  await supabase
    .from('extraction_jobs')
    .update({
      status: 'completed',
      quote_id: quoteId,
      pipeline_phase: null,
      finished_at: new Date().toISOString(),
    })
    .eq('id', jobId);

  if (session) {
    revalidatePath(`/fornecedores/sessao/${session.id}/cenarios`);
    revalidatePath(`/fornecedores/sessao/${session.id}/conciliacao`);
    revalidatePath(`/fornecedores/sessao/${session.id}`);
  }

  console.log(`[runExtractionPipelineStep] Pipeline concluído para job ${jobId}`);

  return { hasMore: false };
}

/**
 * Executa um único step do pipeline (extract | match | finalize).
 * Compatível com Vercel Hobby — cada invocação deve caber em ~60s.
 */
export async function runExtractionPipelineStep(jobId: string): Promise<PipelineStepResult> {
  let supabase: SupabaseClient;
  try {
    supabase = createSupabaseServiceRoleClient();
  } catch (e) {
    console.error('[runExtractionPipelineStep] service role indisponível:', e);
    return { hasMore: false };
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
        supplier_id,
        quote_id,
        pipeline_phase,
        match_batch_index,
        match_total_batches,
        pipeline_context,
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
      console.error('[runExtractionPipelineStep] job não encontrado:', jobId, jobError?.message);
      return { hasMore: false };
    }

    if (job.status === 'completed') {
      return { hasMore: false };
    }

    if (job.status !== 'processing') {
      console.warn(
        '[runExtractionPipelineStep] status inesperado, ignorando:',
        job.status,
        jobId
      );
      return { hasMore: false };
    }

    const phase = (job.pipeline_phase as PipelinePhase | null) ?? 'extract';

    switch (phase) {
      case 'extract':
        return runExtractPhase(supabase, jobId, job);
      case 'post_extract':
        return runPostExtractPhase(supabase, jobId, job);
      case 'match':
        return runMatchPhase(supabase, jobId, job);
      case 'finalize':
        return runFinalizePhase(supabase, jobId, job);
      default:
        await markJobError(supabase, jobId, `Fase de pipeline inválida: ${String(phase)}`);
        return { hasMore: false };
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro inesperado ao processar o PDF.';
    console.error('[runExtractionPipelineStep]', jobId, err);
    await markJobError(supabase, jobId, message);
    return { hasMore: false };
  }
}
