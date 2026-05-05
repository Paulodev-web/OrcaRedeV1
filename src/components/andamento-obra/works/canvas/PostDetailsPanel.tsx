"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from 'react';
import { ExternalLink, Eye, MapPin, Trash2, Video, X } from 'lucide-react';
import type {
  WorkPoleInstallation,
  WorkProjectPost,
} from '@/types/works';
import { removePoleInstallation } from '@/actions/workPoleInstallations';
import { ImageLightbox } from '../shared/ImageLightbox';

type Selected =
  | { kind: 'planned'; post: WorkProjectPost }
  | { kind: 'installation'; installation: WorkPoleInstallation }
  | null;

interface PostDetailsPanelProps {
  selected: Selected;
  /** Id do usuario logado, usado para mostrar acoes de manager. */
  viewerUserId: string;
  /** Instalacoes proximas ao poste planejado selecionado (heuristica visual). */
  installationsNearSelected: WorkPoleInstallation[];
  /** URLs assinadas das midias de instalacao (path -> url). */
  installationSignedUrls: Record<string, string>;
  /** Nomes dos criadores (user_id -> nome). */
  creatorNames: Record<string, string>;
  onClose: () => void;
  /** Muda o painel para modo "instalacao". */
  onSelectInstallation: (installation: WorkPoleInstallation) => void;
  /** Notifica o canvas que uma instalacao foi removida pelo manager. */
  onInstallationRemoved: (installationId: string) => void;
}

/**
 * Painel lateral (drawer) com dois modos:
 *
 *  - "planned": clica num poste planejado (`WorkPostMarker`). Mostra dados
 *    do snapshot + bloco "Possíveis instalações relacionadas" listando pins
 *    proximos por heuristica visual (raio 100 unidades no espaco 6000x6000
 *    do canvas). E sugestao auxiliar - nao cria vinculo formal entre
 *    instalacao e poste planejado.
 *
 *  - "installation": clica num pin de execucao (`WorkInstallationPin`).
 *    Mostra foto primaria destacada, demais em galeria, GPS com link de
 *    mapa, data/hora, gerente, notas e badge de status. Para o manager
 *    criador, exibe botao "Remover marcação (correção)".
 *
 * Acessibilidade:
 *  - role="dialog" + aria-modal="true"
 *  - foco e movido para o botao X ao abrir
 *  - ESC chama onClose
 *  - Em mobile (<md): bottom sheet (75vh). Em md+: drawer lateral 380px.
 */
export function PostDetailsPanel({
  selected,
  viewerUserId,
  installationsNearSelected,
  installationSignedUrls,
  creatorNames,
  onClose,
  onSelectInstallation,
  onInstallationRemoved,
}: PostDetailsPanelProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const isOpen = selected !== null;

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

  if (!isOpen || !selected) return null;

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
        {selected.kind === 'planned' ? (
          <PlannedHeader post={selected.post} closeRef={closeButtonRef} onClose={onClose} />
        ) : (
          <InstallationHeader
            installation={selected.installation}
            closeRef={closeButtonRef}
            onClose={onClose}
          />
        )}

        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
          {selected.kind === 'planned' ? (
            <PlannedBody
              post={selected.post}
              installationsNear={installationsNearSelected}
              creatorNames={creatorNames}
              onSelectInstallation={onSelectInstallation}
            />
          ) : (
            <InstallationBody
              installation={selected.installation}
              viewerUserId={viewerUserId}
              signedUrls={installationSignedUrls}
              creatorName={
                creatorNames[selected.installation.createdBy] ?? null
              }
              onInstallationRemoved={onInstallationRemoved}
            />
          )}
        </div>
      </aside>
    </div>
  );
}

// =============================================================================
// PLANNED MODE
// =============================================================================

function PlannedHeader({
  post,
  closeRef,
  onClose,
}: {
  post: WorkProjectPost;
  closeRef: React.RefObject<HTMLButtonElement | null>;
  onClose: () => void;
}) {
  const numbering = post.numbering?.trim() ? post.numbering : 'Sem numeração';
  const postType = post.postType?.trim() ? post.postType : 'Tipo não informado';
  return (
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
        ref={closeRef}
        type="button"
        onClick={onClose}
        aria-label="Fechar painel de detalhes do poste"
        className="rounded-md p-1.5 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1D3140]"
      >
        <X className="h-4 w-4" />
      </button>
    </header>
  );
}

function PlannedBody({
  post,
  installationsNear,
  creatorNames,
  onSelectInstallation,
}: {
  post: WorkProjectPost;
  installationsNear: WorkPoleInstallation[];
  creatorNames: Record<string, string>;
  onSelectInstallation: (installation: WorkPoleInstallation) => void;
}) {
  const metadataEntries = Object.entries(post.metadata).filter(
    ([key]) => !!key,
  );
  return (
    <>
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

      <Section title="Possíveis instalações relacionadas">
        {installationsNear.length === 0 ? (
          <p className="rounded-md border border-dashed border-gray-200 bg-gray-50 px-3 py-3 text-[11px] text-gray-500">
            Sem instalações próximas a este ponto. A camada de execução é
            independente do projeto: o gerente marca instalações livremente
            no campo via APK.
          </p>
        ) : (
          <>
            <p className="mb-2 text-[11px] text-gray-500">
              Sugestão visual por proximidade no projeto (raio ~100 unidades).
              Não é vínculo formal.
            </p>
            <ul className="space-y-1.5">
              {installationsNear.map((inst) => {
                const label = inst.numbering?.trim()
                  ? inst.numbering
                  : 'Sem numeração';
                const creator = creatorNames[inst.createdBy] ?? null;
                return (
                  <li key={inst.id}>
                    <button
                      type="button"
                      onClick={() => onSelectInstallation(inst)}
                      className="flex w-full items-center justify-between gap-2 rounded-md border border-gray-200 px-3 py-2 text-left text-xs text-[#1D3140] transition-colors hover:border-[#10B981] hover:bg-emerald-50/50"
                    >
                      <span className="truncate">
                        <span className="font-medium">{label}</span>
                        {creator && (
                          <span className="ml-2 text-[10px] text-gray-500">
                            por {creator}
                          </span>
                        )}
                      </span>
                      <span className="text-[10px] text-gray-400">
                        {formatRelativeShort(inst.installedAt)}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </Section>
    </>
  );
}

// =============================================================================
// INSTALLATION MODE
// =============================================================================

function InstallationHeader({
  installation,
  closeRef,
  onClose,
}: {
  installation: WorkPoleInstallation;
  closeRef: React.RefObject<HTMLButtonElement | null>;
  onClose: () => void;
}) {
  const numbering = installation.numbering?.trim()
    ? installation.numbering
    : 'Sem numeração';
  return (
    <header className="flex items-start justify-between gap-3 border-b border-gray-200 px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-medium uppercase tracking-wide text-emerald-700">
          Instalação em campo
        </p>
        <h2
          id="post-details-title"
          className="mt-0.5 truncate text-base font-semibold text-[#1D3140]"
        >
          {numbering}
        </h2>
        <p className="mt-0.5 truncate text-xs text-gray-500">
          {installation.poleType?.trim() || 'Tipo não informado'}
        </p>
      </div>
      <button
        ref={closeRef}
        type="button"
        onClick={onClose}
        aria-label="Fechar painel de detalhes da instalação"
        className="rounded-md p-1.5 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1D3140]"
      >
        <X className="h-4 w-4" />
      </button>
    </header>
  );
}

function InstallationBody({
  installation,
  viewerUserId,
  signedUrls,
  creatorName,
  onInstallationRemoved,
}: {
  installation: WorkPoleInstallation;
  viewerUserId: string;
  signedUrls: Record<string, string>;
  creatorName: string | null;
  onInstallationRemoved: (installationId: string) => void;
}) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const [isPending, startTransition] = useTransition();

  const orderedMedia = useMemo(() => {
    const arr = installation.media.slice();
    arr.sort((a, b) => {
      if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
      return a.createdAt.localeCompare(b.createdAt);
    });
    return arr;
  }, [installation.media]);

  const images = orderedMedia.filter((m) => m.kind === 'image');
  const imageUrls = images
    .map((m) => signedUrls[m.storagePath])
    .filter((u): u is string => Boolean(u));

  const isCreator = installation.createdBy === viewerUserId;
  const canRemove = isCreator && installation.status === 'installed';

  const dateLabel = new Date(installation.installedAt).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const mapHref =
    installation.gpsLat !== null && installation.gpsLng !== null
      ? `https://www.google.com/maps?q=${installation.gpsLat},${installation.gpsLng}`
      : null;

  function handleRemoveClick() {
    setRemoveError(null);
    if (!confirmingRemove) {
      setConfirmingRemove(true);
      return;
    }
    startTransition(async () => {
      const result = await removePoleInstallation({
        installationId: installation.id,
      });
      if (result.success) {
        onInstallationRemoved(installation.id);
      } else {
        setRemoveError(result.error);
        setConfirmingRemove(false);
      }
    });
  }

  return (
    <>
      <Section title="Foto principal">
        {orderedMedia.length === 0 ? (
          <p className="rounded-md border border-dashed border-gray-200 bg-gray-50 px-3 py-3 text-[11px] text-gray-500">
            Sem foto registrada para esta instalação.
          </p>
        ) : (
          <div className="space-y-2">
            <PrimaryMedia
              media={orderedMedia[0]}
              url={signedUrls[orderedMedia[0].storagePath] ?? null}
              onOpenImage={() => {
                if (orderedMedia[0].kind === 'image') {
                  const idx = images.findIndex(
                    (im) => im.id === orderedMedia[0].id,
                  );
                  setLightboxIndex(idx >= 0 ? idx : 0);
                }
              }}
            />
            {orderedMedia.length > 1 && (
              <div className="grid grid-cols-3 gap-1.5">
                {orderedMedia.slice(1).map((m) => {
                  const url = signedUrls[m.storagePath] ?? null;
                  if (!url) {
                    return (
                      <div
                        key={m.id}
                        className="flex aspect-square items-center justify-center rounded-md border border-dashed border-gray-200 bg-gray-50 text-[10px] text-gray-400"
                      >
                        indisponível
                      </div>
                    );
                  }
                  if (m.kind === 'image') {
                    const idx = images.findIndex((im) => im.id === m.id);
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setLightboxIndex(idx >= 0 ? idx : 0)}
                        className="group relative aspect-square overflow-hidden rounded-md border border-gray-200 bg-gray-100"
                        aria-label="Abrir imagem em tela cheia"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={url}
                          alt="Foto da instalação"
                          className="h-full w-full object-cover"
                          loading="lazy"
                          draggable={false}
                        />
                        <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/0 text-white opacity-0 transition group-hover:bg-black/30 group-hover:opacity-100">
                          <Eye className="h-4 w-4" />
                        </span>
                      </button>
                    );
                  }
                  return (
                    <div
                      key={m.id}
                      className="relative aspect-square overflow-hidden rounded-md border border-gray-200 bg-black"
                    >
                      <video
                        controls
                        src={url}
                        className="h-full w-full object-cover"
                        preload="metadata"
                      />
                      <span className="pointer-events-none absolute left-1 top-1 inline-flex items-center gap-1 rounded-full bg-black/50 px-1 py-0.5 text-[9px] text-white">
                        <Video className="h-2.5 w-2.5" />
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </Section>

      <Section title="Localização">
        <KeyValue label="X (canvas)" value={formatCoord(installation.xCoord)} />
        <KeyValue label="Y (canvas)" value={formatCoord(installation.yCoord)} />
        {mapHref ? (
          <a
            href={mapHref}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-[#64ABDE] hover:underline"
          >
            <MapPin className="h-3 w-3" />
            Abrir no mapa ({installation.gpsLat?.toFixed(5)},{' '}
            {installation.gpsLng?.toFixed(5)})
            <ExternalLink className="h-2.5 w-2.5" />
          </a>
        ) : (
          <p className="mt-1 text-[11px] text-gray-500">GPS não disponível</p>
        )}
        {installation.gpsAccuracyMeters !== null && (
          <p className="text-[10px] text-gray-400">
            Precisão estimada: {Math.round(installation.gpsAccuracyMeters)}m
          </p>
        )}
      </Section>

      <Section title="Registro">
        <KeyValue label="Data/Hora" value={dateLabel} />
        <KeyValue label="Gerente" value={creatorName ?? '—'} />
        <KeyValue
          label="Status"
          value={installation.status === 'installed' ? 'Instalado' : 'Removido'}
        />
        {installation.notes && installation.notes.length > 0 && (
          <p className="mt-1 whitespace-pre-wrap rounded-md bg-gray-50 p-2 text-[11px] text-gray-700">
            {installation.notes}
          </p>
        )}
      </Section>

      {canRemove && (
        <Section title="Correção">
          {removeError && (
            <p className="mb-2 rounded-md border border-red-200 bg-red-50 px-2 py-1 text-[11px] text-red-700">
              {removeError}
            </p>
          )}
          <button
            type="button"
            onClick={handleRemoveClick}
            disabled={isPending}
            className="inline-flex items-center gap-1.5 rounded-md border border-red-300 bg-white px-3 py-1.5 text-xs font-medium text-red-700 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Trash2 className="h-3 w-3" />
            {confirmingRemove
              ? isPending
                ? 'Removendo…'
                : 'Confirmar remoção'
              : 'Remover marcação (correção)'}
          </button>
          {confirmingRemove && !isPending && (
            <p className="mt-1 text-[10px] text-gray-500">
              Esta ação é uma correção. A linha permanece no banco para
              auditoria, mas o pin some do canvas.
            </p>
          )}
        </Section>
      )}

      <ImageLightbox
        open={lightboxIndex !== null}
        onOpenChange={(o) => !o && setLightboxIndex(null)}
        images={imageUrls}
        initialIndex={lightboxIndex ?? 0}
        alt="Foto da instalação"
      />
    </>
  );
}

function PrimaryMedia({
  media,
  url,
  onOpenImage,
}: {
  media: WorkPoleInstallation['media'][number];
  url: string | null;
  onOpenImage: () => void;
}) {
  if (!url) {
    return (
      <div className="flex aspect-video items-center justify-center rounded-md border border-dashed border-gray-200 bg-gray-50 text-[11px] text-gray-400">
        Mídia indisponível
      </div>
    );
  }
  if (media.kind === 'image') {
    return (
      <button
        type="button"
        onClick={onOpenImage}
        className="group relative block aspect-video w-full overflow-hidden rounded-md border border-gray-200 bg-gray-100"
        aria-label="Abrir imagem em tela cheia"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt="Foto principal da instalação"
          className="h-full w-full object-cover"
          loading="lazy"
          draggable={false}
        />
        <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/0 text-white opacity-0 transition group-hover:bg-black/30 group-hover:opacity-100">
          <Eye className="h-5 w-5" />
        </span>
      </button>
    );
  }
  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-md border border-gray-200 bg-black">
      <video
        controls
        src={url}
        className="h-full w-full object-cover"
        preload="metadata"
      />
    </div>
  );
}

// =============================================================================
// Helpers
// =============================================================================

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

function formatRelativeShort(iso: string): string {
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return '—';
  const dd = String(dt.getDate()).padStart(2, '0');
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}`;
}
