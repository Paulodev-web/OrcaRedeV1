/**
 * Wrapper de chamada ao Gemini para a camada de proposta.
 *
 * Centraliza o que hoje está repetido em `geminiSupplierQuote.ts` e
 * `semanticMatch.ts`: checagem de chave, JSON mode, parse defensivo e retry em
 * falha transitória. Acrescenta duas coisas que aqueles não têm — contabilidade
 * de tokens/latência (para saber o custo por proposta) e conversa multi-turno,
 * necessária para a retentativa informada pelo guardrail.
 */

import {
  GoogleGenerativeAI,
  type Content,
  type ResponseSchema,
} from '@google/generative-ai';
import {
  getProposalAiMaxOutputTokens,
  getProposalAiTemperature,
  getProposalAiTimeoutMs,
  getProposalAiTransportRetry,
} from './config';
import type { ProposalAiUsage } from './types';

export interface GeminiJsonRequest {
  model: string;
  systemInstruction: string;
  /** Turnos do usuário e do modelo. O primeiro é sempre do usuário. */
  turns: { role: 'user' | 'model'; text: string }[];
  schema: ResponseSchema;
  temperature?: number;
  maxOutputTokens?: number;
}

export type GeminiJsonResult =
  | { success: true; raw: string; data: unknown; usage: ProposalAiUsage }
  | { success: false; error: string; usage: ProposalAiUsage };

export function emptyUsage(model: string): ProposalAiUsage {
  return {
    model,
    promptTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    latencyMs: 0,
    calls: 0,
  };
}

function mergeModelLabels(a: ProposalAiUsage, b: ProposalAiUsage): string {
  // Etapas podem rodar em modelos diferentes (pro para texto, flash para tag).
  if (a.calls === 0) return b.calls === 0 ? a.model : b.model;
  if (b.calls === 0 || a.model === b.model) return a.model;
  return `${a.model}+${b.model}`;
}

export function mergeUsage(a: ProposalAiUsage, b: ProposalAiUsage): ProposalAiUsage {
  return {
    model: mergeModelLabels(a, b),
    promptTokens: a.promptTokens + b.promptTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    totalTokens: a.totalTokens + b.totalTokens,
    latencyMs: a.latencyMs + b.latencyMs,
    calls: a.calls + b.calls,
  };
}

function isTransientError(message: string): boolean {
  return /429|500|502|503|504|Too Many Requests|quota|overloaded|deadline|ETIMEDOUT|ECONNRESET|fetch failed/i.test(
    message
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Uma chamada ao Gemini em JSON mode, com retry só para falha de transporte.
 * Falha de conteúdo (guardrail) é tratada uma camada acima, que sabe montar o
 * prompt de correção.
 */
export async function generateJson(
  request: GeminiJsonRequest
): Promise<GeminiJsonResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return {
      success: false,
      error: 'Chave da API Gemini não configurada no servidor (GEMINI_API_KEY).',
      usage: emptyUsage(request.model),
    };
  }

  if (request.turns.length === 0 || request.turns[0].role !== 'user') {
    return {
      success: false,
      error: 'Conversa inválida: o primeiro turno precisa ser do usuário.',
      usage: emptyUsage(request.model),
    };
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel(
    {
      model: request.model,
      systemInstruction: request.systemInstruction,
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: request.schema,
        temperature: request.temperature ?? getProposalAiTemperature(),
        maxOutputTokens: request.maxOutputTokens ?? getProposalAiMaxOutputTokens(),
      },
    },
    { timeout: getProposalAiTimeoutMs() }
  );

  const contents: Content[] = request.turns.map((turn) => ({
    role: turn.role,
    parts: [{ text: turn.text }],
  }));

  const maxAttempts = getProposalAiTransportRetry() + 1;
  const usage = emptyUsage(request.model);
  let lastError = 'Erro desconhecido na chamada ao Gemini.';

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const startedAt = Date.now();
    usage.calls++;

    try {
      const result = await model.generateContent({ contents });
      usage.latencyMs += Date.now() - startedAt;

      const meta = result.response.usageMetadata;
      if (meta) {
        usage.promptTokens += meta.promptTokenCount;
        usage.outputTokens += meta.candidatesTokenCount;
        usage.totalTokens += meta.totalTokenCount;
      }

      const raw = result.response.text();

      try {
        return { success: true, raw, data: JSON.parse(raw), usage };
      } catch {
        // JSON inválido apesar do responseSchema costuma ser truncamento por
        // maxOutputTokens. Repetir a mesma chamada não resolve.
        return {
          success: false,
          error:
            'A IA devolveu JSON inválido — provável truncamento. Aumente PROPOSAL_AI_MAX_OUTPUT_TOKENS ou quebre a etapa.',
          usage,
        };
      }
    } catch (err) {
      usage.latencyMs += Date.now() - startedAt;
      lastError = err instanceof Error ? err.message : String(err);

      if (attempt + 1 < maxAttempts && isTransientError(lastError)) {
        await sleep(1500 * 2 ** attempt);
        continue;
      }
      break;
    }
  }

  return { success: false, error: `Gemini: ${lastError}`, usage };
}
