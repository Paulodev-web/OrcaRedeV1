import type { SupabaseClient } from '@supabase/supabase-js';
import { createSupabaseServiceRoleClient } from '@/lib/supabaseServer';
import { extractSupplierQuoteWithGemini } from '@/services/ai/geminiSupplierQuote';
import { persistSupplierQuoteFromExtraction } from '@/services/suppliers/persistSupplierQuoteFromExtraction';
import { autoMatchQuoteItems } from '@/services/suppliers/autoMatchQuoteItems';
import { semanticMatch } from '@/services/ai/semanticMatch';
import type { UnconciliatedItem, SystemMaterial } from '@/types/supplierExtract';

const CONFIDENCE_AUTO_APPLY_THRESHOLD = 80;

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
 * Carrega materiais do sistema conforme escopo da sessão (RDN01).
 */
async function loadSystemMaterials(
  supabase: SupabaseClient,
  userId: string,
  budgetId: string | null
): Promise<SystemMaterial[]> {
  if (budgetId) {
    const { data: groupMaterials } = await supabase
      .from('post_item_group_materials')
      .select(`
        materials (id, code, name, unit),
        post_item_groups!inner (
          budget_posts!inner (budget_id)
        )
      `)
      .eq('post_item_groups.budget_posts.budget_id', budgetId);

    const { data: looseMaterials } = await supabase
      .from('post_materials')
      .select(`
        materials (id, code, name, unit),
        budget_posts!inner (budget_id)
      `)
      .eq('budget_posts.budget_id', budgetId);

    const seen = new Set<string>();
    const materials: SystemMaterial[] = [];
    for (const row of [...(groupMaterials ?? []), ...(looseMaterials ?? [])]) {
      const mat = row.materials as unknown as SystemMaterial | null;
      if (mat && !seen.has(mat.id)) {
        seen.add(mat.id);
        materials.push(mat);
      }
    }
    return materials;
  }

  const { data } = await supabase
    .from('materials')
    .select('id, code, name, unit')
    .eq('user_id', userId);

  return (data ?? []) as SystemMaterial[];
}

/**
 * Nível 2 — IA Semântica: envia itens pendentes ao Gemini para pareamento.
 * Aplica automaticamente sugestões com confiança > threshold.
 * Persiste todas as sugestões para auditoria.
 */
async function runSemanticMatchLevel2(
  supabase: SupabaseClient,
  userId: string,
  quoteId: string,
  supplierName: string,
  budgetId: string | null
): Promise<{ matched: number; total: number }> {
  const { data: pendingItems } = await supabase
    .from('supplier_quote_items')
    .select('id, descricao, unidade, quantidade, preco_unit')
    .eq('quote_id', quoteId)
    .eq('match_status', 'sem_match');

  if (!pendingItems || pendingItems.length === 0) {
    return { matched: 0, total: 0 };
  }

  const systemMaterials = await loadSystemMaterials(supabase, userId, budgetId);
  if (systemMaterials.length === 0) {
    return { matched: 0, total: pendingItems.length };
  }

  const unconciliated: UnconciliatedItem[] = pendingItems.map((it) => ({
    id: it.id,
    descricao: it.descricao,
    unidade: it.unidade,
    quantidade: it.quantidade,
    preco_unit: it.preco_unit,
  }));

  const result = await semanticMatch(unconciliated, systemMaterials, supplierName);
  if (!result.success) {
    console.warn('[runExtractionJob] semanticMatch falhou:', result.error);
    return { matched: 0, total: pendingItems.length };
  }

  let matchedCount = 0;

  for (const suggestion of result.suggestions) {
    await supabase.from('semantic_match_suggestions').insert({
      supplier_quote_item_id: suggestion.supplierItemId,
      suggested_material_id: suggestion.materialId,
      suggested_conversion_factor: suggestion.conversionFactor,
      confidence_score: suggestion.confidenceScore,
      rationale: suggestion.rationale ?? null,
      status: 'suggested',
      model: 'gemini-2.5-flash',
    });

    if (suggestion.confidenceScore >= CONFIDENCE_AUTO_APPLY_THRESHOLD) {
      const { error: updateError } = await supabase
        .from('supplier_quote_items')
        .update({
          matched_material_id: suggestion.materialId,
          conversion_factor: suggestion.conversionFactor,
          match_status: 'ia_suggested',
          match_level: 2,
          match_method: 'semantic_ai',
          match_confidence: suggestion.confidenceScore,
        })
        .eq('id', suggestion.supplierItemId);

      if (!updateError) {
        matchedCount++;
      }
    }
  }

  return { matched: matchedCount, total: pendingItems.length };
}

/**
 * Pipeline completo de processamento de job:
 * 1. Extração PDF → JSON bruto
 * 2. Persistência inicial (status: sem_match)
 * 3. Nível 1: autoMatch (memória exata)
 * 4. Nível 2: semanticMatch (IA) para pendentes
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

    // === Passo 1: Download do PDF como Buffer ===
    const { data: blob, error: downloadError } = await supabase.storage
      .from('fornecedores_pdfs')
      .download(job.file_path);

    if (downloadError || !blob) {
      const msg = `Erro ao baixar o PDF: ${downloadError?.message ?? 'arquivo não encontrado'}`;
      await markJobError(supabase, jobId, msg);
      return;
    }

    const buffer = Buffer.from(await blob.arrayBuffer());

    if (buffer.length < 200) {
      await markJobError(supabase, jobId, 'O arquivo PDF parece estar vazio ou corrompido.');
      return;
    }

    const estimatedSeconds = Math.max(20, Math.round(buffer.length / 50_000));
    await supabase.from('extraction_jobs').update({ estimated_time: estimatedSeconds }).eq('id', jobId);

    // === Passo 2: Extração multimodal via Gemini (PDF nativo) ===
    const gemini = await extractSupplierQuoteWithGemini(buffer);
    if (!gemini.success) {
      await markJobError(supabase, jobId, gemini.error);
      return;
    }

    const supplierName = deriveSupplierName(job.file_path, job.supplier_name);

    // === Passo 3: Persistência inicial (status: sem_match) ===
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

    // === Passo 4: Nível 1 — Auto-match (memória exata) ===
    const level1 = await autoMatchQuoteItems(supabase, userId, persist.quoteId).catch((err) => {
      console.warn('[runExtractionJob] Nível 1 auto-match falhou:', err);
      return { matched: 0, total: 0 };
    });

    console.log(
      `[runExtractionJob] Nível 1 (memória): ${level1.matched}/${level1.total} itens vinculados`
    );

    // === Passo 5: Nível 2 — Match semântico (IA) para pendentes ===
    const level2 = await runSemanticMatchLevel2(
      supabase,
      userId,
      persist.quoteId,
      supplierName,
      session.budget_id
    ).catch((err) => {
      console.warn('[runExtractionJob] Nível 2 semantic-match falhou:', err);
      return { matched: 0, total: 0 };
    });

    console.log(
      `[runExtractionJob] Nível 2 (IA): ${level2.matched}/${level2.total} itens vinculados`
    );

    console.log(
      `[runExtractionJob] Pipeline concluído para job ${jobId} — ` +
        `Total: L1=${level1.matched} + L2=${level2.matched} matches automáticos`
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro inesperado ao processar o PDF.';
    console.error('[runExtractionJob]', jobId, err);
    await markJobError(supabase, jobId, message);
  }
}
