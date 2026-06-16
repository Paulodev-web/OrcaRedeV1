import { revalidatePath } from 'next/cache';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createSupabaseServiceRoleClient } from '@/lib/supabaseServer';
import {
  EXTRACT_STUCK_ERROR_MS,
  EXTRACT_TIMEOUT_ERROR_MESSAGE,
  MATCH_INVOCATION_BUDGET_MS,
} from '@/lib/extractionPipelineConfig';
import { invokeExtractOnEdge } from '@/services/suppliers/invokeExtractOnEdge';
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

function getJobStartedAgeMs(job: Record<string, unknown>): number | null {
  const startedAt = job.started_at as string | null | undefined;
  if (!startedAt) return null;
  return Date.now() - new Date(startedAt).getTime();
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

  const ageMs = getJobStartedAgeMs(job);
  if (ageMs !== null && ageMs > EXTRACT_STUCK_ERROR_MS) {
    await markJobError(supabase, jobId, EXTRACT_TIMEOUT_ERROR_MESSAGE);
    return { hasMore: false };
  }

  console.log('[runExtractionPipelineStep] reinvocando Edge para extração', jobId);
  invokeExtractOnEdge(jobId);
  return { hasMore: false };
}

async function runMatchPhase(
  supabase: SupabaseClient,
  jobId: string,
  job: Record<string, unknown>
): Promise<PipelineStepResult> {
  const userId = job.user_id as string;
  const quoteId = job.quote_id as string | null;
  const pipelineContext = parsePipelineContext(job.pipeline_context);

  if (!quoteId || !pipelineContext) {
    await markJobError(supabase, jobId, 'Contexto do pipeline inválido para match semântico.');
    return { hasMore: false };
  }

  const totalBatches = pipelineContext.batchItemIds.length;
  let batchIndex = (job.match_batch_index as number) ?? 0;
  const startTs = Date.now();
  let processedThisCall = 0;

  while (batchIndex < totalBatches) {
    // Após o primeiro lote, verificar se ainda há orçamento de tempo antes de reivindicar o próximo.
    // Isso impede o timeout de 60s do Vercel — o restante dos lotes fica para a próxima chamada.
    if (processedThisCall > 0 && Date.now() - startTs >= MATCH_INVOCATION_BUDGET_MS) {
      console.log(
        `[runMatchPhase] Orçamento esgotado após ${processedThisCall} lotes; ` +
          `próxima chamada retoma do lote ${batchIndex + 1}/${totalBatches}`,
        jobId
      );
      return { hasMore: true };
    }

    // Optimistic lock: reivindica o lote atomicamente ANTES de processar.
    // Garante que instâncias concorrentes não processem o mesmo lote.
    const { data: claimed } = await supabase
      .from('extraction_jobs')
      .update({ match_batch_index: batchIndex + 1 })
      .eq('id', jobId)
      .eq('status', 'processing')
      .eq('match_batch_index', batchIndex)
      .select('id')
      .maybeSingle();

    if (!claimed) {
      console.log(
        `[runMatchPhase] lote ${batchIndex} já reivindicado por outra instância, ignorando`,
        jobId
      );
      return { hasMore: false };
    }

    const batchResult = await runSingleSemanticMatchBatch(
      supabase,
      userId,
      quoteId,
      pipelineContext as SemanticMatchPipelineContext,
      batchIndex,
      { stepMode: true }
    );

    processedThisCall++;
    batchIndex++;

    if (batchResult.done || batchIndex >= totalBatches) {
      await supabase
        .from('extraction_jobs')
        .update({ pipeline_phase: 'finalize' })
        .eq('id', jobId);
      console.log(
        `[runMatchPhase] L2 concluído: ${processedThisCall} lotes esta chamada, total ${batchIndex}/${totalBatches}`,
        jobId
      );
      return { hasMore: true };
    }

    console.log(
      `[runMatchPhase] Lote ${batchIndex}/${totalBatches} concluído; ${processedThisCall} processados nesta chamada`,
      jobId
    );
  }

  // Todos os lotes processados (loop exauriu sem trigger do done)
  await supabase.from('extraction_jobs').update({ pipeline_phase: 'finalize' }).eq('id', jobId);
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
        started_at,
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
