import { GoogleGenerativeAI } from '@google/generative-ai';
import type { SupplierExtractItem } from '@/types/supplierExtract';

export type GeminiExtractSuccess = {
  items: SupplierExtractItem[];
  observacoesGerais: string;
};

export type GeminiExtractResult =
  | { success: true; data: GeminiExtractSuccess }
  | { success: false; error: string };

const SYSTEM_PROMPT = `Você é um assistente de suprimentos especializado em engenharia elétrica. Você está recebendo o arquivo PDF original de uma proposta de fornecedor. Analise visualmente a estrutura da tabela.

Extraia os itens associando corretamente a descrição da mesma linha (ou do bloco correspondente) com o preço unitário e a quantidade. Preste atenção especial a tabelas com colunas desalinhadas ou multi-linha.

Produza APENAS um objeto JSON válido (sem texto ou markdown fora do JSON), com exatamente duas chaves de nível superior:

1) "items": array de objetos, um por linha de item da tabela de produtos/serviços. Campos por item: descricao (string), unidade (string), quantidade (number), preco_unit (number), total_item (number), ipi_percent (number), st_incluso (boolean), alerta (boolean — true se quantidade * preco_unit for diferente de total_item com tolerância razoável).

2) "observacoesGerais": string com um resumo organizado das informações do orçamento que NÃO são linhas da tabela de itens. Inclua quando existirem: prazo de entrega, validade da proposta, frete/entrega, impostos ou totais globais descritos em rodapé, faturamento, condições de pagamento e demais regras gerais. Use quebras de linha (\\n) e, se útil, formatação Markdown (títulos com ##, listas com -) para manter legível. Se não houver nada além dos itens, use string vazia "".

Não inclua chaves extras no JSON.`;

export async function extractSupplierQuoteWithGemini(
  pdfBuffer: Buffer
): Promise<GeminiExtractResult> {
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

  const pdfBase64 = pdfBuffer.toString('base64');

  const result = await model.generateContent([
    {
      inlineData: {
        mimeType: 'application/pdf',
        data: pdfBase64,
      },
    },
    { text: SYSTEM_PROMPT },
  ]);
  const responseText = result.response.text();

  let parsed: { items: SupplierExtractItem[]; observacoesGerais?: string };
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

  return {
    success: true,
    data: { items: parsed.items, observacoesGerais },
  };
}
