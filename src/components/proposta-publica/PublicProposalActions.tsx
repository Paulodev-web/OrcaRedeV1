"use client";

import { Download, MessageCircle } from 'lucide-react';

import { trackProposalActivity } from './tracking';

interface PublicProposalActionsProps {
  token: string;
  whatsappNumber: string;
  /** Mensagem já contextualizada com projeto e número da proposta. */
  whatsappMessage: string;
  /** `true` no rodapé claro; o padrão assume a capa escura. */
  compact?: boolean;
}

/** Só dígitos: wa.me recusa máscara. */
function toWaNumber(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (!digits) return '';
  // Número nacional sem DDI recebe o do Brasil.
  return digits.length <= 11 ? `55${digits}` : digits;
}

/**
 * Baixar PDF e falar no WhatsApp — as duas únicas ações do cliente na peça
 * pública (§9.2). Ambas registram evento antes de sair da página.
 */
export function PublicProposalActions({
  token,
  whatsappNumber,
  whatsappMessage,
  compact = false,
}: PublicProposalActionsProps) {
  const waNumber = toWaNumber(whatsappNumber);
  const waHref = waNumber
    ? `https://wa.me/${waNumber}?text=${encodeURIComponent(whatsappMessage)}`
    : null;

  const base =
    'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition text-sm ' +
    (compact ? 'px-3 py-2' : 'px-4 py-2.5');

  const pdfTone = compact
    ? 'border border-slate-300 bg-surface text-brand-navy hover:bg-slate-50'
    : 'border border-white/30 bg-white/10 text-white hover:bg-white/20';

  return (
    <div className="flex flex-wrap items-center gap-2">
      <a
        href={`/proposta/${encodeURIComponent(token)}/pdf`}
        onClick={() => void trackProposalActivity(token, { eventType: 'pdf_download' })}
        className={`${base} ${pdfTone}`}
      >
        <Download className="h-4 w-4" />
        Baixar PDF
      </a>

      {waHref && (
        <a
          href={waHref}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => void trackProposalActivity(token, { eventType: 'whatsapp_click' })}
          className={`${base} bg-[#25D366] text-white hover:brightness-95`}
        >
          <MessageCircle className="h-4 w-4" />
          Falar no WhatsApp
        </a>
      )}
    </div>
  );
}
