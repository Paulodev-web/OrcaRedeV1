import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { authorizeExtractRequest } from '../_shared/auth.ts';
import { createAdminClient } from '../_shared/supabaseAdmin.ts';

const JSON_HEADERS = { 'Content-Type': 'application/json' };
const GEMINI_MODEL = 'gemini-1.5-flash';
const MIN_CONFIDENCE = 85;

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

interface MaterialRow {
  id: string;
  code: string;
  name: string;
  unit: string;
}

interface GeminiMatch {
  supplier_item_id: string;
  internal_material_id: string;
  confidence_score: number;
  rationale?: string;
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
    return new Response(JSON.stringify({ error: 'Nao autorizado.' }), {
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
        JSON.stringify({ error: 'quote_id e obrigatorio (UUID).' }),
        { status: 400, headers: JSON_HEADERS }
      );
    }

    const supabase = createAdminClient();
    const geminiKeyPass = req.headers.get('x-orcarede-gemini-pass')?.trim();
    const geminiKey = geminiKeyPass || Deno.env.get('GEMINI_API_KEY')?.trim();

    // 1. Buscar cotacao e validar estado
    const { data: quote, error: quoteError } = await supabase
      .from('supplier_quotes')
      .select('id, user_id, status, session_id, budget_id, supplier_name')
      .eq('id', quoteId)
      .single<QuoteRow>();

    if (quoteError || !quote) {
      return new Response(
        JSON.stringify({ error: 'Cotacao nao encontrada.' }),
        { status: 404, headers: JSON_HEADERS }
      );
    }

    if (quote.status !== 'conciliando') {
      console.log('[match-supplier-quote] skipped - status atual:', quote.status, quoteId);
      return new Response(
        JSON.stringify({ ok: true, quote_id: quoteId, status: quote.status, skipped: true }),
        { status: 200, headers: JSON_HEADERS }
      );
    }

    // 2. Resolver budget_id
    let budgetId: string | null = quote.budget_id ?? null;
    if (!budgetId && quote.session_id) {
      const { data: session } = await supabase
        .from('quotation_sessions')
        .select('budget_id')
        .eq('id', quote.session_id)
        .single<{ budget_id: string | null }>();
      budgetId = session?.budget_id ?? null;
    }

    // 3. Carregar itens sem match
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
      return new Response(
        JSON.stringify({ ok: true, quote_id: quoteId, l1_matched: 0, l2_matched: 0, sem_match: 0 }),
        { status: 200, headers: JSON_HEADERS }
      );
    }

    console.log('[match-supplier-quote] processando', items.length, 'itens - quote:', quoteId, '- budget:', budgetId ?? 'sem budget');

    // 4. Carregar exclusoes de sessao
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

    // 5. L1: Memoria Exata
    const { data: mappings } = await supabase
      .from('supplier_material_mappings')
      .select('supplier_material_name, internal_material_id, conversion_factor')
      .eq('user_id', quote.user_id)
      .eq('supplier_name', quote.supplier_name)
      .returns<MappingRow[]>();

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
      if (!mapping) { remainingItems.push(item); continue; }
      const matId = mapping.internal_material_id;
      if (!sessionExclusions.has(matId)) {
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

    if (l1Updates.length > 0) {
      await Promise.all(
        l1Updates.map((u) =>
          supabase.from('supplier_quote_items').update({
            matched_material_id: u.matched_material_id,
            conversion_factor: u.conversion_factor,
            match_status: 'automatico',
            match_method: 'exact_memory',
            match_level: 1,
            match_confidence: 100,
          }).eq('id', u.id)
        )
      );
      const usedNames = [...new Set(l1Updates.map((u) => u.original_mapping_name))];
      await supabase
        .from('supplier_material_mappings')
        .update({ last_seen_at: new Date().toISOString() })
        .eq('user_id', quote.user_id)
        .eq('supplier_name', quote.supplier_name)
        .in('supplier_material_name', usedNames);
    }

    console.log('[match-supplier-quote] L1:', l1Updates.length, 'matched |', remainingItems.length, 'para L2');

    // 6. L2: Gemini LLM De-Para (contexto fechado: apenas materiais do orcamento)
    let l2Matched = 0;
    let semMatchCount = remainingItems.length;

    if (remainingItems.length > 0 && budgetId && geminiKey) {
      const { data: scopeRows } = await supabase.rpc('get_budget_material_ids', {
        p_budget_id: budgetId,
      }) as { data: { material_id: string }[] | null };

      const validIds = (scopeRows ?? [])
        .map((r) => r.material_id)
        .filter((id) => !sessionExclusions.has(id));

      if (validIds.length > 0) {
        const { data: catalogMaterials } = await supabase
          .from('materials')
          .select('id, code, name, unit')
          .in('id', validIds)
          .returns<MaterialRow[]>();

        const catalog = catalogMaterials ?? [];

        if (catalog.length > 0) {
          const geminiMatches = await callGeminiForMatching(geminiKey, catalog, remainingItems);

          if (geminiMatches.length > 0) {
            const validCatalogIds = new Set(catalog.map((m) => m.id));
            const validItemIds = new Set(remainingItems.map((i) => i.id));

            const confirmed = geminiMatches.filter(
              (m) =>
                validItemIds.has(m.supplier_item_id) &&
                validCatalogIds.has(m.internal_material_id) &&
                m.confidence_score >= MIN_CONFIDENCE,
            );

            if (confirmed.length > 0) {
              await Promise.all(
                confirmed.map((m) =>
                  supabase.from('supplier_quote_items').update({
                    matched_material_id: m.internal_material_id,
                    conversion_factor: 1,
                    match_status: 'ia_suggested',
                    match_method: 'semantic_ai',
                    match_level: 2,
                    match_confidence: m.confidence_score,
                  }).eq('id', m.supplier_item_id)
                )
              );
              l2Matched = confirmed.length;
              semMatchCount = remainingItems.length - l2Matched;
            }
          }
        }
      }
    } else if (remainingItems.length > 0 && !budgetId) {
      console.warn('[match-supplier-quote] L2 pulado - sem budget_id (contexto fechado obrigatorio)');
    } else if (remainingItems.length > 0 && !geminiKey) {
      console.warn('[match-supplier-quote] L2 pulado - GEMINI_API_KEY ausente');
    }

    // 7. Finalizar
    await supabase.from('supplier_quotes').update({ status: 'aguardando_revisao' }).eq('id', quoteId);

    console.log('[match-supplier-quote] concluido:', quoteId, '-> aguardando_revisao | L1:', l1Updates.length, 'L2:', l2Matched, 'sem_match:', semMatchCount);

    return new Response(
      JSON.stringify({ ok: true, quote_id: quoteId, l1_matched: l1Updates.length, l2_matched: l2Matched, sem_match: semMatchCount }),
      { status: 200, headers: JSON_HEADERS }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro inesperado na conciliacao.';
    console.error('[match-supplier-quote]', quoteId, err);
    if (quoteId) {
      const supabase = createAdminClient();
      await markQuoteError(supabase, quoteId, message);
    }
    return new Response(JSON.stringify({ error: message }), { status: 500, headers: JSON_HEADERS });
  }
});

// ---------------------------------------------------------------------------
// Gemini LLM: De-Para estruturado com JSON Schema
// ---------------------------------------------------------------------------
async function callGeminiForMatching(
  apiKey: string,
  catalog: MaterialRow[],
  supplierItems: ItemRow[],
): Promise<GeminiMatch[]> {
  const systemInstruction =
    'Voce e um orcamentista de engenharia eletrica especializado. ' +
    'Sua tarefa e fazer o "De-Para" entre os itens do fornecedor e os materiais do catalogo do orcamento. ' +
    'Considere abreviacoes tecnicas, variacoes de nomenclatura e jargoes do setor eletrico. ' +
    'Retorne APENAS correspondencias com alta confianca (confidence_score >= 85). ' +
    'Nao inclua matches duvidosos - e melhor deixar sem match do que vincular errado.';

  const userPrompt = JSON.stringify({
    catalogo_orcamento: catalog.map((m) => ({ id: m.id, code: m.code, name: m.name, unit: m.unit })),
    itens_fornecedor: supplierItems.map((i) => ({ id: i.id, descricao: i.descricao, unidade: i.unidade })),
  });

  const responseSchema = {
    type: 'ARRAY',
    items: {
      type: 'OBJECT',
      properties: {
        supplier_item_id: { type: 'STRING' },
        internal_material_id: { type: 'STRING' },
        confidence_score: { type: 'INTEGER' },
        rationale: { type: 'STRING' },
      },
      required: ['supplier_item_id', 'internal_material_id', 'confidence_score'],
    },
  };

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemInstruction }] },
        contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
        generationConfig: {
          response_mime_type: 'application/json',
          response_schema: responseSchema,
          temperature: 0.1,
        },
      }),
    },
  );

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Gemini generateContent [${res.status}]: ${body.slice(0, 400)}`);
  }

  const data = await res.json() as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };

  const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  if (!text) {
    console.warn('[match-supplier-quote] Gemini retornou resposta vazia');
    return [];
  }

  try {
    const parsed = JSON.parse(text) as GeminiMatch[];
    return Array.isArray(parsed) ? parsed : [];
  } catch (parseErr) {
    console.error('[match-supplier-quote] Falha ao parsear JSON do Gemini:', parseErr, text.slice(0, 200));
    return [];
  }
}

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------
async function markQuoteError(
  supabase: ReturnType<typeof createAdminClient>,
  quoteId: string,
  errorMessage: string
): Promise<void> {
  try {
    await supabase.from('supplier_quotes').update({
      status: 'erro_extracao',
      extraction_error_message: errorMessage,
      extraction_error_at: new Date().toISOString(),
    }).eq('id', quoteId);
  } catch (e) {
    console.error('[match-supplier-quote] markQuoteError falhou:', quoteId, e);
  }
}
