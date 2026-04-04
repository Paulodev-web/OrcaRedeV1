'use server';

import { GoogleGenerativeAI } from '@google/generative-ai';
import PDFParser from 'pdf2json';
import type { Output } from 'pdf2json';
import { createSupabaseServerClient } from '@/lib/supabaseServer';

export type SupplierItem = {
  descricao: string;
  unidade: string;
  quantidade: number;
  preco_unit: number;
  total_item: number;
  ipi_percent: number;
  st_incluso: boolean;
  alerta: boolean;
};

export type ExtractResult =
  | { success: true; items: SupplierItem[]; observacoesGerais: string }
  | { success: false; error: string };

const SYSTEM_PROMPT = `Você é um assistente de suprimentos. A partir do texto bruto do orçamento abaixo, produza APENAS um objeto JSON válido (sem texto ou markdown fora do JSON), com exatamente duas chaves de nível superior:

1) "items": array de objetos, um por linha de item da tabela de produtos/serviços. Campos por item: descricao (string), unidade (string), quantidade (number), preco_unit (number), total_item (number), ipi_percent (number), st_incluso (boolean), alerta (boolean — true se quantidade * preco_unit for diferente de total_item com tolerância razoável).

2) "observacoesGerais": string com um resumo organizado das informações do orçamento que NÃO são linhas da tabela de itens. Inclua quando existirem no texto: prazo de entrega, validade da proposta, frete/entrega, impostos ou totais globais descritos em rodapé, faturamento, condições de pagamento e demais regras gerais. Use quebras de linha (\\n) e, se útil, formatação Markdown (títulos com ##, listas com -) para manter legível. Se não houver nada além dos itens, use string vazia "".

Não inclua chaves extras no JSON.`;

const extractTextFromBuffer = (
  buffer: Buffer
): Promise<{ text: string; numpages: number }> => {
  return new Promise((resolve, reject) => {
    const pdfParser = new PDFParser(null, true);

    pdfParser.on('pdfParser_dataError', (errData) => {
      if (errData && typeof errData === 'object' && 'parserError' in errData && errData.parserError) {
        reject(errData.parserError);
        return;
      }
      reject(errData instanceof Error ? errData : new Error(String(errData)));
    });

    pdfParser.on('pdfParser_dataReady', (pdfData: Output) => {
      try {
        const rawText = pdfParser.getRawTextContent();
        const numpages = Array.isArray(pdfData.Pages) ? pdfData.Pages.length : 0;
        resolve({ text: rawText, numpages });
      } catch (e) {
        reject(e instanceof Error ? e : new Error(String(e)));
      }
    });

    pdfParser.parseBuffer(buffer);
  });
};

export async function extractSupplierDataAction(
  { filePath }: { filePath: string }
): Promise<ExtractResult> {
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
      return { success: false, error: `Erro ao baixar o PDF: ${downloadError?.message ?? 'arquivo não encontrado'}` };
    }

    const buffer = Buffer.from(await blob.arrayBuffer());
    console.log('[supplierIngestion] buffer.length:', buffer.length);

    let pdfText: string;
    try {
      const { text, numpages } = await extractTextFromBuffer(buffer);
      pdfText = text;
      const preview = pdfText.slice(0, 200);
      console.log('[supplierIngestion] pdf2json OK', {
        numpages,
        preview200: preview,
      });
    } catch (parseErr) {
      console.error('[supplierIngestion] pdf2json lançou exceção:', parseErr);
      return { success: false, error: 'Não foi possível extrair o texto do PDF. Verifique se o arquivo não está protegido ou corrompido.' };
    }

    if (!pdfText.trim()) {
      console.error(
        '[supplierIngestion] pdf2json retornou texto vazio (trim) antes de responder ao cliente'
      );
      return { success: false, error: 'O PDF não contém texto legível. O arquivo pode ser baseado em imagens.' };
    }

    console.log('[supplierIngestion] Texto extraído com sucesso; chamando Gemini…');

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return { success: false, error: 'Chave da API Gemini não configurada no servidor.' };
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      generationConfig: {
        responseMimeType: 'application/json',
      },
    });

    const prompt = `${SYSTEM_PROMPT}\n\n---\n\n${pdfText}`;

    const result = await model.generateContent(prompt);
    const responseText = result.response.text();

    let parsed: { items: SupplierItem[]; observacoesGerais?: string };
    try {
      parsed = JSON.parse(responseText);
    } catch {
      return { success: false, error: 'A IA retornou um formato inválido. Tente novamente.' };
    }

    if (!parsed.items || !Array.isArray(parsed.items)) {
      return { success: false, error: 'A resposta da IA não contém a lista de itens esperada.' };
    }

    const observacoesGerais =
      typeof parsed.observacoesGerais === 'string' ? parsed.observacoesGerais : '';

    return { success: true, items: parsed.items, observacoesGerais };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro inesperado ao processar o PDF.';
    return { success: false, error: message };
  }
}
