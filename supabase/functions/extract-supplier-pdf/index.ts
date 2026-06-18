import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { authorizeExtractRequest } from '../_shared/auth.ts';
import { extractSupplierQuoteWithGemini } from '../_shared/geminiExtract.ts';
import { createAdminClient } from '../_shared/supabaseAdmin.ts';

const JSON_HEADERS = { 'Content-Type': 'application/json' };

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
    const body = (await req.json()) as {
      quote_id?: string;
      pdf_path?: string;
    };

    quoteId = body.quote_id?.trim();
    const pdfPath = body.pdf_path?.trim();

    if (!quoteId || typeof quoteId !== 'string') {
      return new Response(
        JSON.stringify({ error: 'quote_id é obrigatório (UUID).' }),
        { status: 400, headers: JSON_HEADERS }
      );
    }

    if (!pdfPath || typeof pdfPath !== 'string') {
      return new Response(
        JSON.stringify({ error: 'pdf_path é obrigatório.' }),
        { status: 400, headers: JSON_HEADERS }
      );
    }

    const supabase = createAdminClient();
    const geminiKeyPass = req.headers.get('x-orcarede-gemini-pass')?.trim();

    // 1. Buscar cotação para validar
    const { data: quote, error: quoteError } = await supabase
      .from('supplier_quotes')
      .select('id, user_id, status, session_id, budget_id')
      .eq('id', quoteId)
      .single();

    if (quoteError || !quote) {
      return new Response(
        JSON.stringify({ error: 'Cotação não encontrada.' }),
        { status: 404, headers: JSON_HEADERS }
      );
    }

    // 2. Idempotência: se já foi processada (não está em processando_ia), retorna ok
    if (quote.status !== 'processando_ia') {
      console.log('[extract-supplier-pdf] quote já processada, status:', quote.status, quoteId);
      return new Response(
        JSON.stringify({ ok: true, quote_id: quoteId, status: quote.status, skipped: true }),
        { status: 200, headers: JSON_HEADERS }
      );
    }

    // 3. Download do PDF do Storage
    const { data: blob, error: downloadError } = await supabase.storage
      .from('fornecedores_pdfs')
      .download(pdfPath);

    if (downloadError || !blob) {
      const msg = `Erro ao baixar o PDF: ${downloadError?.message ?? 'arquivo não encontrado'}`;
      await markQuoteError(supabase, quoteId, msg);
      return new Response(JSON.stringify({ error: msg }), {
        status: 400,
        headers: JSON_HEADERS,
      });
    }

    // 4. Validar integridade do PDF
    const buffer = new Uint8Array(await blob.arrayBuffer());
    if (buffer.length < 200) {
      const msg = 'O arquivo PDF parece estar vazio ou corrompido.';
      await markQuoteError(supabase, quoteId, msg);
      return new Response(JSON.stringify({ error: msg }), {
        status: 400,
        headers: JSON_HEADERS,
      });
    }

    // 5. Extração com Gemini
    console.log('[extract-supplier-pdf] iniciando extração Gemini, quote:', quoteId);
    const gemini = await extractSupplierQuoteWithGemini(buffer, geminiKeyPass);

    if (!gemini.success) {
      await markQuoteError(supabase, quoteId, gemini.error);
      return new Response(JSON.stringify({ error: gemini.error }), {
        status: 500,
        headers: JSON_HEADERS,
      });
    }

    // 6. Montar raw_extraction (JSON bruto para auditoria e futuros processos)
    const rawExtraction = {
      items: gemini.data.items,
      observacoesGerais: gemini.data.observacoesGerais || '',
      quoteDate: gemini.data.quoteDate || null,
      extractedAt: new Date().toISOString(),
      geminiModel: 'gemini-2.5-flash',
    };

    // 7. UPDATE supplier_quotes: raw_extraction + status = pendente_conciliacao
    const { error: updateError } = await supabase
      .from('supplier_quotes')
      .update({
        raw_extraction: rawExtraction,
        observacoes_gerais: gemini.data.observacoesGerais || null,
        quote_date: gemini.data.quoteDate || null,
        status: 'pendente_conciliacao',
        extraction_error_message: null,
        extraction_error_at: null,
      })
      .eq('id', quoteId);

    if (updateError) {
      console.error('[extract-supplier-pdf] erro ao atualizar quote:', updateError);
      await markQuoteError(supabase, quoteId, `Erro ao salvar extração: ${updateError.message}`);
      return new Response(
        JSON.stringify({ error: `Erro ao salvar extração: ${updateError.message}` }),
        { status: 500, headers: JSON_HEADERS }
      );
    }

    console.log(
      '[extract-supplier-pdf] sucesso: quote',
      quoteId,
      '→ pendente_conciliacao,',
      gemini.data.items.length,
      'itens extraídos'
    );

    return new Response(
      JSON.stringify({
        ok: true,
        quote_id: quoteId,
        status: 'pendente_conciliacao',
        items_count: gemini.data.items.length,
      }),
      { status: 200, headers: JSON_HEADERS }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro inesperado na extração.';
    console.error('[extract-supplier-pdf]', quoteId, err);
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
    console.error('[markQuoteError] falha ao marcar erro:', quoteId, e);
  }
}
