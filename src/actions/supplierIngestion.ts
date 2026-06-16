'use server';

import { createSupabaseServerClient } from '@/lib/supabaseServer';
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

    if (downloadError || !blob) {
      return {
        success: false,
        error: `Erro ao baixar o PDF: ${downloadError?.message ?? 'arquivo não encontrado'}`,
      };
    }

    const buffer = Buffer.from(await blob.arrayBuffer());

    if (buffer.length < 200) {
      return {
        success: false,
        error: 'O arquivo PDF parece estar vazio ou corrompido.',
      };
    }

    console.log('[supplierIngestion] buffer.length:', buffer.length, '— chamando Gemini multimodal…');

    const gemini = await extractSupplierQuoteWithGemini(buffer);
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
