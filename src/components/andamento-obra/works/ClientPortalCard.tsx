"use client";

import { useState, useTransition } from 'react';
import { Check, Copy, ExternalLink, RefreshCw } from 'lucide-react';
import { resyncWorkTracking } from '@/actions/workPoleInstallations';

interface ClientPortalCardProps {
  workId: string;
  /** Sufixo do link público (/obra/<publicId>). Null = ainda sem portal. */
  publicId: string | null;
  publicEnabled: boolean;
  polesPublished: number;
  polesPlanned: number;
  /** Obra sem orçamento não tem planta nem postes: não há portal a montar. */
  hasBudget: boolean;
}

/**
 * O acompanhamento que o cliente abre, visto de dentro da obra.
 *
 * Existe porque o engenheiro precisa de duas coisas à mão e nenhuma delas
 * estava aqui: o link para mandar ao cliente, e a conta do que já atravessou
 * (postes publicados sobre postes do projeto). O botão de ressincronizar é
 * caminho de conserto, não de rotina: a publicação normal acontece quando ele
 * aprova o poste no canvas. Serve para obra importada antes desta versão, que
 * nasceu sem portal, e para quando o orçamento ganhou ou perdeu poste.
 */
export function ClientPortalCard({
  workId,
  publicId,
  publicEnabled,
  polesPublished,
  polesPlanned,
  hasBudget,
}: ClientPortalCardProps) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const href = publicId ? `/obra/${publicId}` : null;
  const publicHref = publicEnabled ? href : null;

  function handleCopy() {
    if (!href) return;
    const absolute = `${window.location.origin}${href}`;
    navigator.clipboard.writeText(absolute).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      },
      () => setError('Não foi possível copiar o link.'),
    );
  }

  function handleResync() {
    setError(null);
    startTransition(async () => {
      const result = await resyncWorkTracking(workId);
      if (!result.success) setError(result.error);
    });
  }

  return (
    <section className="rounded-2xl border border-gray-200 bg-surface p-4">
      <h2 className="text-sm font-semibold text-neutral-900">Portal do cliente</h2>

      {!hasBudget ? (
        <p className="mt-2 text-xs text-gray-500">
          Esta obra não veio de um orçamento, então não tem planta nem postes
          para mostrar ao cliente.
        </p>
      ) : !href ? (
        <p className="mt-2 text-xs text-gray-500">
          Esta obra ainda não tem acompanhamento publicado. Se o orçamento já
          tem um acompanhamento antigo, marcado à mão, ele continua sendo o do
          cliente e não é substituído.
        </p>
      ) : !publicEnabled ? (
        <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-2 text-xs text-amber-800">
          Portal despublicado. O endereço foi preservado, mas o cliente não
          consegue abrir enquanto a obra estiver cancelada.
        </p>
      ) : (
        <>
          <p className="mt-2 text-xs text-gray-600">
            <strong className="font-semibold text-neutral-900">
              {polesPublished}
            </strong>{' '}
            de {polesPlanned} postes já aparecem para o cliente.
          </p>

          <div className="mt-3 flex flex-wrap gap-1.5">
            <a
                href={publicHref ?? undefined}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-neutral-900 transition-colors hover:border-neutral-900 hover:bg-gray-50"
            >
              <ExternalLink className="h-3.5 w-3.5 text-gray-500" aria-hidden="true" />
              Abrir
            </a>
            <button
              type="button"
              onClick={handleCopy}
              className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-neutral-900 transition-colors hover:border-neutral-900 hover:bg-gray-50"
            >
              {copied ? (
                <Check className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />
              ) : (
                <Copy className="h-3.5 w-3.5 text-gray-500" aria-hidden="true" />
              )}
              {copied ? 'Copiado' : 'Copiar link'}
            </button>
          </div>
        </>
      )}

      {hasBudget && (
        <button
          type="button"
          onClick={handleResync}
          disabled={isPending}
          className="mt-2 inline-flex items-center gap-1.5 text-[11px] font-medium text-gray-500 transition-colors hover:text-neutral-900 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <RefreshCw
            className={`h-3 w-3 ${isPending ? 'animate-spin' : ''}`}
            aria-hidden="true"
          />
          {isPending ? 'Ressincronizando…' : 'Ressincronizar com o orçamento'}
        </button>
      )}

      {error && (
        <p className="mt-2 rounded-md border border-red-200 bg-red-50 px-2 py-1 text-[11px] text-red-700">
          {error}
        </p>
      )}
    </section>
  );
}
