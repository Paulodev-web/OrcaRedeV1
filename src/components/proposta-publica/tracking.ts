import type { ProposalViewEventType } from '@/types/proposal';

const SESSION_STORAGE_KEY = 'orcarede:proposta:sessao';

/**
 * Identificador da sessão de leitura.
 *
 * Fica em `sessionStorage`, não em cookie: é anônimo, não atravessa abas nem
 * sobrevive ao fechamento do navegador, e é o suficiente para o upsert da RPC
 * consolidar tempo e rolagem de uma visita. Reabrir o link conta como visita
 * nova — que é o que o painel quer mostrar.
 */
export function getProposalSessionId(): string {
  if (typeof window === 'undefined') return '';

  try {
    const existing = window.sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (existing) return existing;

    const created =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `s-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    window.sessionStorage.setItem(SESSION_STORAGE_KEY, created);
    return created;
  } catch {
    // Modo privado com storage bloqueado: a visita ainda é registrada, só não
    // consolida entre recarregamentos.
    return `s-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}

export interface TrackPayload {
  eventType: ProposalViewEventType;
  sectionKey?: string | null;
  totalSeconds?: number;
  maxScrollPercent?: number;
}

/**
 * Envia atividade para o endpoint da proposta.
 *
 * Nunca rejeita: analytics não pode derrubar a leitura da proposta. `keepalive`
 * garante entrega quando a aba está sendo fechada.
 */
export async function trackProposalActivity(token: string, payload: TrackPayload): Promise<void> {
  const sessionId = getProposalSessionId();
  if (!sessionId) return;

  try {
    await fetch(`/proposta/${encodeURIComponent(token)}/track`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, ...payload }),
      keepalive: true,
    });
  } catch {
    // Silêncio proposital.
  }
}
