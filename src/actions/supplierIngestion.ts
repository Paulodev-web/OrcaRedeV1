'use server';

import { createSupabaseServerClient } from '@/lib/supabaseServer';
import { extractTextFromPdfBuffer } from '@/services/pdf/extractPdfText';
import { extractSupplierQuoteWithGemini } from '@/services/ai/geminiSupplierQuote';
import type { SupplierExtractItem } from '@/types/supplierExtract';

export type SupplierItem = SupplierExtractItem;

export type ExtractResult =
  | { success: true; items: SupplierExtractItem[]; observacoesGerais: string }
  | { success: false; error: string };

export async function extractSupplierDataAction({
  filePath,
}: {
  filePath: string;
}): Promise<ExtractResult> {
  try {
    console.log('[supplierIngestion] filePath recebido:', filePath);

    const supabase = await createSupabaseServerClient();

    const { data: blob, error: downloadError } = await supabase.storage
      .from('fornecedores_pdfs')
      .download(filePath);

    console.log('[supplierIngestion] download Supabase:', {
      downloadError: downloadError ?? null,
      temBlob: Boolean(blob),
    });

    if (downloadError || !blob) {
      return {
        success: false,
        error: `Erro ao baixar o PDF: ${downloadError?.message ?? 'arquivo não encontrado'}`,
      };
    }

    const buffer = Buffer.from(await blob.arrayBuffer());
    console.log('[supplierIngestion] buffer.length:', buffer.length);

    let pdfText: string;
    try {
      const { text, numpages } = await extractTextFromPdfBuffer(buffer);
      pdfText = text;
      const preview = pdfText.slice(0, 200);
      console.log('[supplierIngestion] pdf2json OK', {
        numpages,
        preview200: preview,
      });
    } catch (parseErr) {
      console.error('[supplierIngestion] pdf2json lançou exceção:', parseErr);
      return {
        success: false,
        error:
          'Não foi possível extrair o texto do PDF. Verifique se o arquivo não está protegido ou corrompido.',
      };
    }

    if (!pdfText.trim()) {
      console.error(
        '[supplierIngestion] pdf2json retornou texto vazio (trim) antes de responder ao cliente'
      );
      return {
        success: false,
        error: 'O PDF não contém texto legível. O arquivo pode ser baseado em imagens.',
      };
    }

    console.log('[supplierIngestion] Texto extraído com sucesso; chamando Gemini…');

    const gemini = await extractSupplierQuoteWithGemini(pdfText);
    if (!gemini.success) {
      return { success: false, error: gemini.error };
    }

    return {
      success: true,
      items: gemini.data.items,
      observacoesGerais: gemini.data.observacoesGerais,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro inesperado ao processar o PDF.';
    return { success: false, error: message };
  }
}
