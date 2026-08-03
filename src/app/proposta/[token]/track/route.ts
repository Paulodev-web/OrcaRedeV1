import { createHash } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';

import { createSupabasePublicProposalClient } from '@/lib/supabaseServer';
import type { ProposalViewEventType } from '@/types/proposal';

export const runtime = 'nodejs';

const EVENT_TYPES: ProposalViewEventType[] = [
  'session_start',
  'heartbeat',
  'section_view',
  'pdf_download',
  'whatsapp_click',
];

interface TrackBody {
  sessionId?: unknown;
  eventType?: unknown;
  sectionKey?: unknown;
  totalSeconds?: unknown;
  maxScrollPercent?: unknown;
}

function clampInt(value: unknown, min: number, max: number): number | null {
  const parsed = typeof value === 'number' ? value : Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed)) return null;
  return Math.min(max, Math.max(min, Math.trunc(parsed)));
}

/** Dispositivo, SO e navegador a partir do user agent. Grosso de propósito:
 *  o painel quer "celular Android no Chrome", não a versão exata. */
function parseUserAgent(ua: string): { device: string; os: string; browser: string } {
  const isTablet = /iPad|Tablet/i.test(ua);
  const isMobile = !isTablet && /Mobi|Android|iPhone/i.test(ua);

  const os = /Windows/i.test(ua)
    ? 'Windows'
    : /iPhone|iPad|iPod/i.test(ua)
      ? 'iOS'
      : /Mac OS X/i.test(ua)
        ? 'macOS'
        : /Android/i.test(ua)
          ? 'Android'
          : /Linux/i.test(ua)
            ? 'Linux'
            : 'Desconhecido';

  // Ordem importa: Edge e Opera also se anunciam como Chrome.
  const browser = /Edg\//i.test(ua)
    ? 'Edge'
    : /OPR\//i.test(ua)
      ? 'Opera'
      : /Chrome\//i.test(ua)
        ? 'Chrome'
        : /Safari\//i.test(ua)
          ? 'Safari'
          : /Firefox\//i.test(ua)
            ? 'Firefox'
            : 'Desconhecido';

  return { device: isTablet ? 'tablet' : isMobile ? 'mobile' : 'desktop', os, browser };
}

/**
 * O IP nunca é gravado em claro. O token entra como sal para que o mesmo
 * visitante gere hashes diferentes em propostas diferentes — dá para contar
 * visitantes distintos numa proposta sem permitir correlacionar pessoas entre
 * clientes.
 */
function hashIp(ip: string | null, salt: string): string | null {
  if (!ip) return null;
  return createHash('sha256').update(`${salt}:${ip}`).digest('hex').slice(0, 32);
}

function firstForwardedIp(header: string | null): string | null {
  if (!header) return null;
  const first = header.split(',')[0]?.trim();
  return first && first.length > 0 ? first : null;
}

/** Registra atividade anônima na proposta pública. */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  let body: TrackBody;
  try {
    body = (await request.json()) as TrackBody;
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const sessionId = typeof body.sessionId === 'string' ? body.sessionId.trim() : '';
  const eventType = EVENT_TYPES.includes(body.eventType as ProposalViewEventType)
    ? (body.eventType as ProposalViewEventType)
    : null;

  if (!sessionId || sessionId.length > 100 || !eventType) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const headers = request.headers;
  const userAgent = headers.get('user-agent') ?? '';
  const { device, os, browser } = parseUserAgent(userAgent);
  const ip = firstForwardedIp(headers.get('x-forwarded-for'));

  const supabase = createSupabasePublicProposalClient(token);

  // A sessão é sempre atualizada — inclusive nos eventos —, porque é ela que
  // guarda tempo e rolagem. A RPC faz upsert e valida o token por comparação.
  const viewArgs = {
    p_share_token: token,
    p_session_id: sessionId,
    p_device_type: device,
    p_os: os,
    p_browser: browser,
    p_geo_country: headers.get('x-vercel-ip-country'),
    p_geo_region: headers.get('x-vercel-ip-country-region'),
    p_geo_city: headers.get('x-vercel-ip-city'),
    p_ip_hash: hashIp(ip, token),
    p_referrer: headers.get('referer'),
    p_user_agent: userAgent.slice(0, 500),
    p_total_seconds: clampInt(body.totalSeconds, 0, 86_400),
    p_max_scroll_percent: clampInt(body.maxScrollPercent, 0, 100),
  };

  const { error: viewError } = await supabase.rpc('track_proposal_view', viewArgs);

  // Token inválido, proposta despublicada ou revogada caem aqui. Não é erro do
  // cliente e não vale detalhar: silêncio, sem vazar se a proposta existe.
  if (viewError) {
    return NextResponse.json({ ok: false }, { status: 204 });
  }

  if (eventType !== 'session_start' && eventType !== 'heartbeat') {
    const sectionKey = typeof body.sectionKey === 'string' ? body.sectionKey.slice(0, 60) : null;
    await supabase.rpc('track_proposal_view_event', {
      p_share_token: token,
      p_session_id: sessionId,
      p_event_type: eventType,
      p_section_key: sectionKey,
      p_payload: null,
      p_occurred_at: null,
    });
  }

  return NextResponse.json({ ok: true });
}
