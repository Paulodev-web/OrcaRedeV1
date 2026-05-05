"use client";

import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import type { WorkProjectPost } from '@/types/works';

interface PostDetailsPanelProps {
  post: WorkProjectPost | null;
  onClose: () => void;
}

/**
 * Painel lateral (drawer) de detalhes de um poste planejado.
 *
 * Fluxo:
 *   - Aberto quando `post != null`
 *   - Conteudo: numeracao, tipo, coordenadas, metadata key-value, e bloco
 *     placeholder "Execucao em campo" (estrutura preparada para Bloco 7)
 *   - Fechamento: botao X, ESC, clique fora (overlay)
 *
 * Acessibilidade:
 *   - role="dialog" + aria-modal="true"
 *   - foco e movido para o botao X ao abrir
 *   - foco volta para o documento ao fechar (browser default)
 *   - ESC chama onClose
 *
 * Responsivo:
 *   - >=md: drawer lateral direita (largura 360px)
 *   - <md: bottom sheet (altura ~70vh, transicao em translate-y)
 *
 * Estado nao persiste em URL/query: comportamento volatil intencional.
 */
export function PostDetailsPanel({ post, onClose }: PostDetailsPanelProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const isOpen = post !== null;

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (isOpen) {
      const t = setTimeout(() => closeButtonRef.current?.focus(), 50);
      return () => clearTimeout(t);
    }
  }, [isOpen]);

  if (!isOpen || !post) return null;

  const numbering = post.numbering?.trim() ? post.numbering : 'Sem numeração';
  const postType = post.postType?.trim() ? post.postType : 'Tipo não informado';
  const metadataEntries = Object.entries(post.metadata).filter(
    ([key]) => !!key,
  );

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end md:items-stretch md:justify-end"
      role="dialog"
      aria-modal="true"
      aria-labelledby="post-details-title"
    >
      <button
        type="button"
        aria-label="Fechar painel"
        onClick={onClose}
        className="absolute inset-0 bg-black/30 backdrop-blur-[1px] transition-opacity"
      />

      <aside
        className={[
          'relative flex h-[75vh] w-full flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl',
          'md:h-full md:w-[380px] md:rounded-none md:rounded-l-2xl md:border-l md:border-gray-200',
          'animate-in fade-in duration-150',
        ].join(' ')}
      >
        <header className="flex items-start justify-between gap-3 border-b border-gray-200 px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500">
              Poste planejado
            </p>
            <h2
              id="post-details-title"
              className="mt-0.5 truncate text-base font-semibold text-[#1D3140]"
            >
              {numbering}
            </h2>
            <p className="mt-0.5 truncate text-xs text-gray-500">{postType}</p>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="Fechar painel de detalhes do poste"
            className="rounded-md p-1.5 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1D3140]"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
          <Section title="Coordenadas do projeto">
            <KeyValue label="X" value={formatCoord(post.xCoord)} />
            <KeyValue label="Y" value={formatCoord(post.yCoord)} />
          </Section>

          <Section title="Metadata adicional">
            {metadataEntries.length === 0 ? (
              <p className="rounded-md border border-dashed border-gray-200 bg-gray-50 px-3 py-2 text-[11px] text-gray-500">
                Nenhum metadado adicional registrado para este poste.
              </p>
            ) : (
              <ul className="space-y-1">
                {metadataEntries.map(([key, value]) => (
                  <li key={key}>
                    <KeyValue label={formatKey(key)} value={formatValue(value)} />
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title="Execução em campo">
            <div className="rounded-md border border-dashed border-gray-200 bg-gray-50 px-3 py-3">
              <p className="text-xs font-medium text-gray-700">
                Sem instalação registrada ainda
              </p>
              <p className="mt-1 text-[11px] text-gray-500">
                Quando este poste for marcado como instalado em campo, os dados
                aparecerão aqui (status, data, responsável e fotos).
              </p>
            </div>
          </Section>
        </div>
      </aside>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
        {title}
      </h3>
      <div className="space-y-1.5">{children}</div>
    </section>
  );
}

function KeyValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-gray-100 py-1 last:border-b-0">
      <span className="text-[11px] font-medium text-gray-500">{label}</span>
      <span className="truncate text-xs text-[#1D3140]" title={value}>
        {value}
      </span>
    </div>
  );
}

function formatCoord(value: number): string {
  if (!Number.isFinite(value)) return '—';
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function formatKey(key: string): string {
  return key
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'string') return value || '—';
  if (typeof value === 'number') return formatCoord(value);
  if (typeof value === 'boolean') return value ? 'Sim' : 'Não';
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
