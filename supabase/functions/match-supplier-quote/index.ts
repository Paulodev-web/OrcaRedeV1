import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { authorizeExtractRequest } from '../_shared/auth.ts';
import { createAdminClient } from '../_shared/supabaseAdmin.ts';

const JSON_HEADERS = { 'Content-Type': 'application/json' };
const EMBEDDING_MODEL = 'text-embedding-004';
const MATCH_THRESHOLD = 0.82;
const MATCH_COUNT = 3;

// ---------------------------------------------------------------------------
// Tipos internos
// ---------------------------------------------------------------------------
interface QuoteRow {
  id: string;
  user_id: string;
  status: string;
  session_id: string | null;
  budget_id: string | null;
  supplier_name: string;
}

interface ItemRow {
  id: string;
  descricao: string;
  unidade: string;
}

interface MappingRow {
  supplier_material_name: string;
  internal_material_id: string;
  conversion_factor: number;
}

interface VectorMatch {
  id: string;
  name: string;
  code: string;
  unit: string;
  price: number;
  similarity: number;
}

// ---------------------------------------------------------------------------
// Handler principal
// ---------------------------------------------------------------------------
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

  let quoteId: string | undefined;

  try {
    const body = (await req.json()) as { quote_id?: string };
    quoteId = body.quote_id?.trim();

    if (!quoteId || typeof quoteId !== 'string') {
      return new Response(
        JSON.stringify({ error: 'quote_id é obrigatório (UUID).' }),
        { status: 400, headers: JSON_HEADERS }
      );
    }

    const supabase = createAdminClient();
    const geminiKeyPass = req.headers.get('x-orcarede-gemini-pass')?.trim();
    const geminiKey = geminiKeyPass || Deno.env.get('GEMINI_API_KEY')?.trim();

    // ------------------------------------------------------------------
    // 1. Buscar cotação e validar estado
    // ------------------------------------------------------------------
    const { data: quote, error: quoteError } = await supabase
      .from('supplier_quotes')
      .select('id, user_id, status, session_id, budget_id, supplier_name')
      .eq('id', quoteId)
      .single<QuoteRow>();

    if (quoteError || !quote) {
      return new Response(
        JSON.stringify({ error: 'Cotação não encontrada.' }),
        { status: 404, headers: JSON_HEADERS }
      );
    }

    // Idempotência: processa apenas cotações em 'conciliando'
    if (quote.status !== 'conciliando') {
      console.log('[match-supplier-quote] skipped — status atual:', quote.status, quoteId);
      return new Response(
        JSON.stringify({ ok: true, quote_id: quoteId, status: quote.status, skipped: true }),
        { status: 200, headers: JSON_HEADERS }
      );
    }

    // ------------------------------------------------------------------
    // 2. Resolver budget_id (direto ou via session → fonte da verdade)
    // ------------------------------------------------------------------
    let budgetId: string | null = quote.budget_id ?? null;
    if (!budgetId && quote.session_id) {
      const { data: session } = await supabase
        .from('quotation_sessions')
        .select('budget_id')
        .eq('id', quote.session_id)
        .single<{ budget_id: string | null }>();
      budgetId = session?.budget_id ?? null;
    }

    // ------------------------------------------------------------------
    // 3. Carregar itens ainda sem match
    // ------------------------------------------------------------------
    const { data: items, error: itemsError } = await supabase
      .from('supplier_quote_items')
      .select('id, descricao, unidade')
      .eq('quote_id', quoteId)
      .eq('match_status', 'sem_match')
      .returns<ItemRow[]>();

    if (itemsError) {
      await markQuoteError(supabase, quoteId, `Erro ao carregar itens: ${itemsError.message}`);
      return new Response(JSON.stringify({ error: itemsError.message }), {
        status: 500,
        headers: JSON_HEADERS,
      });
    }

    if (!items || items.length === 0) {
      await supabase
        .from('supplier_quotes')
        .update({ status: 'aguardando_revisao' })
        .eq('id', quoteId);
      console.log('[match-supplier-quote] sem itens pendentes → aguardando_revisao:', quoteId);
      return new Response(
        JSON.stringify({ ok: true, quote_id: quoteId, l1_matched: 0, l2_matched: 0, sem_match: 0 }),
        { status: 200, headers: JSON_HEADERS }
      );
    }

    console.log('[match-supplier-quote] processando', items.length, 'itens — quote:', quoteId, '— budget:', budgetId ?? 'global');

    // ------------------------------------------------------------------
    // 4. Carregar IDs de materiais válidos para o escopo do orçamento
    //    (RPC auxiliar get_budget_material_ids = fonte da verdade)
    // ------------------------------------------------------------------
    let budgetMaterialIds: Set<string> | null = null;
    if (budgetId) {
      const { data: scopeRows } = await supabase.rpc('get_budget_material_ids', {
        p_budget_id: budgetId,
      }) as { data: { material_id: string }[] | null };
      if (scopeRows && scopeRows.length > 0) {
        budgetMaterialIds = new Set(scopeRows.map((r) => r.material_id));
      }
    }

    // ------------------------------------------------------------------
    // 5. Carregar exclusões de sessão (materiais ocultos nesta sessão)
    // ------------------------------------------------------------------
    const sessionExclusions = new Set<string>();
    if (quote.session_id) {
      const { data: exclusions } = await supabase
        .from('session_material_exclusions')
        .select('material_id')
        .eq('session_id', quote.session_id)
        .eq('user_id', quote.user_id)
        .returns<{ material_id: string }[]>();
      for (const e of exclusions ?? []) {
        sessionExclusions.add(e.material_id);
      }
    }

    // ------------------------------------------------------------------
    // 6. L1: Memória Exata (supplier_material_mappings)
    // ------------------------------------------------------------------
    const { data: mappings } = await supabase
      .from('supplier_material_mappings')
      .select('supplier_material_name, internal_material_id, conversion_factor')
      .eq('user_id', quote.user_id)
      .eq('supplier_name', quote.supplier_name)
      .returns<MappingRow[]>();

    // Índice case-insensitive: lower(nome) → dados do mapeamento
    type MappingValue = { internal_material_id: string; conversion_factor: number; original_name: string };
    const mappingMap = new Map<string, MappingValue>();
    for (const m of mappings ?? []) {
      mappingMap.set(m.supplier_material_name.toLowerCase(), {
        internal_material_id: m.internal_material_id,
        conversion_factor: m.conversion_factor,
        original_name: m.supplier_material_name,
      });
    }

    const l1Updates: {
      id: string;
      matched_material_id: string;
      conversion_factor: number;
      original_mapping_name: string;
    }[] = [];
    const remainingItems: ItemRow[] = [];

    for (const item of items) {
      const mapping = mappingMap.get(item.descricao.toLowerCase());
      if (!mapping) {
        remainingItems.push(item);
        continue;
      }

      const matId = mapping.internal_material_id;

      // Valida escopo: material deve pertencer ao orçamento E não estar excluído da sessão
      const inScope = budgetMaterialIds === null || budgetMaterialIds.has(matId);
      const notExcluded = !sessionExclusions.has(matId);

      if (inScope && notExcluded) {
        l1Updates.push({
          id: item.id,
          matched_material_id: matId,
          conversion_factor: mapping.conversion_factor,
          original_mapping_name: mapping.original_name,
        });
      } else {
        remainingItems.push(item);
      }
    }

    // Aplicar updates L1
    if (l1Updates.length > 0) {
      await Promise.all(
        l1Updates.map((u) =>
          supabase
            .from('supplier_quote_items')
            .update({
              matched_material_id: u.matched_material_id,
              conversion_factor: u.conversion_factor,
              match_status: 'automatico',
              match_method: 'exact_memory',
              match_level: 1,
              match_confidence: 100,
            })
            .eq('id', u.id)
        )
      );

      // Atualizar last_seen_at nos mapeamentos utilizados (best-effort)
      const usedNames = [...new Set(l1Updates.map((u) => u.original_mapping_name))];
      await supabase
        .from('supplier_material_mappings')
        .update({ last_seen_at: new Date().toISOString() })
        .eq('user_id', quote.user_id)
        .eq('supplier_name', quote.supplier_name)
        .in('supplier_material_name', usedNames);
    }

    console.log('[match-supplier-quote] L1:', l1Updates.length, 'matched |', remainingItems.length, 'para L2');

    // ------------------------------------------------------------------
    // 7. L2: Busca Vetorial (Gemini text-embedding-004 + RPC pgvector)
    // ------------------------------------------------------------------
    let l2Matched = 0;
    let semMatchCount = remainingItems.length;

    if (remainingItems.length > 0) {
      if (!geminiKey) {
        console.warn('[match-supplier-quote] GEMINI_API_KEY ausente — L2 pulado, itens ficam sem_match');
      } else {
        const genAI = new GoogleGenerativeAI(geminiKey);
        const embModel = genAI.getGenerativeModel({ model: EMBEDDING_MODEL });

        let embeddings: number[][] = [];
        try {
          // Batch embedding de todas as descrições restantes
          const batchResult = await embModel.batchEmbedContents({
            requests: remainingItems.map((item) => ({
              content: { parts: [{ text: item.descricao }] },
            })),
          });
          embeddings = batchResult.embeddings.map((e) => e.values);
        } catch (embErr) {
          // Falha no embedding não aborta o fluxo — itens ficam sem_match
          console.error('[match-supplier-quote] Erro no batch embedding Gemini:', embErr);
        }

        if (embeddings.length === remainingItems.length) {
          semMatchCount = 0;
          const l2UpdatePromises: Promise<unknown>[] = [];

          for (let i = 0; i < remainingItems.length; i++) {
            const item = remainingItems[i];
            const embedding = embeddings[i];

            const { data: matches } = await supabase.rpc('match_materials_by_vector', {
              query_embedding: embedding,
              match_threshold: MATCH_THRESHOLD,
              match_count: MATCH_COUNT,
              current_user_id: quote.user_id,
              current_budget_id: budgetId,
            }) as { data: VectorMatch[] | null };

            // Pega o melhor match, descartando materiais excluídos da sessão
            const topMatch = (matches ?? []).find((m) => !sessionExclusions.has(m.id));

            if (topMatch) {
              l2UpdatePromises.push(
                supabase
                  .from('supplier_quote_items')
                  .update({
                    matched_material_id: topMatch.id,
                    conversion_factor: 1,
                    match_status: 'ia_suggested',
                    match_method: 'semantic_ai',
                    match_level: 2,
                    match_confidence: Math.round(topMatch.similarity * 100),
                  })
                  .eq('id', item.id)
              );
              l2Matched++;
            } else {
              semMatchCount++;
            }
          }

          await Promise.all(l2UpdatePromises);
        }
      }
    }

    // ------------------------------------------------------------------
    // 8. Finalizar: atualiza status da cotação para aguardando_revisao
    // ------------------------------------------------------------------
    const { error: finalizeError } = await supabase
      .from('supplier_quotes')
      .update({ status: 'aguardando_revisao' })
      .eq('id', quoteId);

    if (finalizeError) {
      console.error('[match-supplier-quote] erro ao finalizar status:', finalizeError);
      // Não é fatal — o Realtime pode não disparar, mas os itens já foram atualizados
    }

    console.log(
      '[match-supplier-quote] concluído:', quoteId,
      '→ aguardando_revisao |',
      'L1:', l1Updates.length,
      'L2:', l2Matched,
      'sem_match:', semMatchCount
    );

    return new Response(
      JSON.stringify({
        ok: true,
        quote_id: quoteId,
        l1_matched: l1Updates.length,
        l2_matched: l2Matched,
        sem_match: semMatchCount,
      }),
      { status: 200, headers: JSON_HEADERS }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro inesperado na conciliação.';
    console.error('[match-supplier-quote]', quoteId, err);
    if (quoteId) {
      const supabase = createAdminClient();
      await markQuoteError(supabase, quoteId, message);
    }
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: JSON_HEADERS,
    });
  }
});

// ---------------------------------------------------------------------------
// Helper: marca erro na cotação sem propagar exceção
// ---------------------------------------------------------------------------
async function markQuoteError(
  supabase: ReturnType<typeof createAdminClient>,
  quoteId: string,
  errorMessage: string
): Promise<void> {
  try {
    await supabase
      .from('supplier_quotes')
      .update({
        status: 'erro_extracao',
        extraction_error_message: errorMessage,
        extraction_error_at: new Date().toISOString(),
      })
      .eq('id', quoteId);
  } catch (e) {
    console.error('[match-supplier-quote] markQuoteError falhou:', quoteId, e);
  }
}
