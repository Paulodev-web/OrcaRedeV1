"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from 'react';
import {
  CheckCircle2,
  Clock,
  ExternalLink,
  Eye,
  MapPin,
  Trash2,
  Video,
  X,
} from 'lucide-react';
import type {
  WorkPoleInstallation,
  WorkProjectPost,
} from '@/types/works';
import {
  approvePoleInstallations,
  removePoleInstallation,
  unapprovePoleInstallation,
} from '@/actions/workPoleInstallations';
import type { MountedEquipment } from '@/services/works/getWorkExecutionOverlay';
import { ImageLightbox } from '../shared/ImageLightbox';
import { MarkPoleInstalledForm } from './MarkPoleInstalledForm';

type Selected =
  | { kind: 'planned'; post: WorkProjectPost }
  | { kind: 'installation'; installation: WorkPoleInstallation }
  | null;

interface PostDetailsPanelProps {
  selected: Selected;
  /** Obra corrente, necessaria para lancar poste pelo portal. */
  workId: string;
  /** Id do usuario logado, usado para mostrar acoes de quem criou a marcacao. */
  viewerUserId: string;
  /** Papel do usuario nesta obra. So o engenheiro publica e lanca pelo portal. */
  viewerRole: 'engineer' | 'manager';
  /**
   * A instalacao que acendeu o poste planejado selecionado, se houver.
   *
   * Era uma lista de "possiveis instalacoes proximas", por raio de 100 unidades
   * no quadro 6000x6000. A heuristica existia porque nao havia vinculo: o campo
   * criava poste solto e alguem precisava adivinhar a qual poste do projeto ele
   * correspondia. Desde a E3 existe `project_post_id`, e adivinhar virou
   * junção. Um poste de projeto tem no maximo uma instalacao de pe, garantida
   * por indice unico parcial no banco.
   */
  linkedInstallation: WorkPoleInstallation | null;
  /** URLs assinadas das midias de instalacao (path -> url). */
  installationSignedUrls: Record<string, string>;
  /** Nomes dos criadores (user_id -> nome). */
  creatorNames: Record<string, string>;
  onClose: () => void;
  /** Muda o painel para modo "instalacao". */
  onSelectInstallation: (installation: WorkPoleInstallation) => void;
  /** Notifica o canvas que uma instalacao foi removida por quem a criou. */
  onInstallationRemoved: (installationId: string) => void;
  /** Notifica o canvas que o engenheiro acabou de acender um poste. */
  onInstallationCreated: (installationId: string) => void;
  /** Notifica o canvas que a publicacao no portal do cliente mudou. */
  onInstallationApprovalChanged: (
    installationId: string,
    approvedAt: string | null,
  ) => void;
  /** O que o campo montou em cada poste, por id de instalação. */
  mountedByInstallation?: Record<string, MountedEquipment[]>;
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
  workId,
  viewerUserId,
  viewerRole,
  linkedInstallation,
  installationSignedUrls,
  creatorNames,
  onClose,
  onSelectInstallation,
  onInstallationRemoved,
  onInstallationCreated,
  onInstallationApprovalChanged,
  mountedByInstallation = {},
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
          'relative flex h-[75vh] w-full flex-col overflow-hidden rounded-t-2xl bg-surface shadow-2xl',
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
              workId={workId}
              viewerRole={viewerRole}
              linkedInstallation={linkedInstallation}
              creatorNames={creatorNames}
              onSelectInstallation={onSelectInstallation}
              onInstallationCreated={onInstallationCreated}
            />
          ) : (
            <InstallationBody
              installation={selected.installation}
              viewerUserId={viewerUserId}
              viewerRole={viewerRole}
              signedUrls={installationSignedUrls}
              creatorName={
                creatorNames[selected.installation.createdBy] ?? null
              }
              onInstallationRemoved={onInstallationRemoved}
              onInstallationApprovalChanged={onInstallationApprovalChanged}
              mounted={mountedByInstallation[selected.installation.id] ?? []}
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
          className="mt-0.5 truncate text-base font-semibold text-neutral-900"
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
        className="rounded-md p-1.5 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900"
      >
        <X className="h-4 w-4" />
      </button>
    </header>
  );
}

function PlannedBody({
  post,
  workId,
  viewerRole,
  linkedInstallation,
  creatorNames,
  onSelectInstallation,
  onInstallationCreated,
}: {
  post: WorkProjectPost;
  workId: string;
  viewerRole: 'engineer' | 'manager';
  linkedInstallation: WorkPoleInstallation | null;
  creatorNames: Record<string, string>;
  onSelectInstallation: (installation: WorkPoleInstallation) => void;
  onInstallationCreated: (installationId: string) => void;
}) {
  const metadataEntries = Object.entries(post.metadata).filter(
    ([key]) => !!key,
  );

  return (
    <>
      <Section title="Execução">
        {linkedInstallation ? (
          <JaLevantado
            installation={linkedInstallation}
            creatorName={creatorNames[linkedInstallation.createdBy] ?? null}
            onSelectInstallation={onSelectInstallation}
          />
        ) : viewerRole === 'engineer' ? (
          <div className="space-y-2">
            <p className="rounded-md border border-dashed border-gray-200 bg-gray-50 px-3 py-2 text-[11px] text-gray-600">
              Este poste ainda não foi levantado. O gerente acende pelo
              aplicativo; você pode registrar por aqui quando o campo não o
              fizer.
            </p>
            <MarkPoleInstalledForm
              workId={workId}
              post={post}
              onRegistered={onInstallationCreated}
            />
          </div>
        ) : (
          <p className="rounded-md border border-dashed border-gray-200 bg-gray-50 px-3 py-3 text-[11px] text-gray-500">
            Este poste ainda não foi levantado. Toque nele no aplicativo para
            registrar.
          </p>
        )}
      </Section>

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
    </>
  );
}

/**
 * O poste planejado que ja acendeu. Leva para a ficha da execucao, que e onde
 * moram foto, GPS, o que foi montado nele e o botao de publicar.
 */
function JaLevantado({
  installation,
  creatorName,
  onSelectInstallation,
}: {
  installation: WorkPoleInstallation;
  creatorName: string | null;
  onSelectInstallation: (installation: WorkPoleInstallation) => void;
}) {
  const published = installation.approvedAt !== null;
  return (
    <button
      type="button"
      onClick={() => onSelectInstallation(installation)}
      className="w-full rounded-md border border-gray-200 px-3 py-2.5 text-left transition-colors hover:border-emerald-500 hover:bg-emerald-50/50"
    >
      <span className="flex items-center gap-1.5">
        <CheckCircle2
          className={[
            'h-3.5 w-3.5 shrink-0',
            published ? 'text-emerald-600' : 'text-amber-600',
          ].join(' ')}
          aria-hidden="true"
        />
        <span className="text-xs font-medium text-neutral-900">
          Levantado em {formatRelativeShort(installation.installedAt)}
        </span>
      </span>
      {creatorName && (
        <span className="mt-0.5 block text-[10px] text-gray-500">
          por {creatorName}
        </span>
      )}
      <span
        className={[
          'mt-1.5 inline-block rounded-full px-2 py-0.5 text-[10px] font-medium',
          published
            ? 'bg-emerald-50 text-emerald-800'
            : 'bg-amber-50 text-amber-800',
        ].join(' ')}
      >
        {published ? 'No portal do cliente' : 'Aguardando publicação'}
      </span>
      <span className="mt-1.5 block text-[10px] text-gray-400">
        Abrir a ficha da execução
      </span>
    </button>
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
        {/* "Poste levantado" e nao "Instalacao em campo": desde que o
            engenheiro tambem lanca pelo portal, nem toda marcacao nasce no
            canteiro, e o cabecalho nao pode afirmar o que nao sabe. */}
        <p className="text-[11px] font-medium uppercase tracking-wide text-emerald-700">
          Poste levantado
        </p>
        <h2
          id="post-details-title"
          className="mt-0.5 truncate text-base font-semibold text-neutral-900"
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
        className="rounded-md p-1.5 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900"
      >
        <X className="h-4 w-4" />
      </button>
    </header>
  );
}

function InstallationBody({
  installation,
  viewerUserId,
  viewerRole,
  signedUrls,
  creatorName,
  onInstallationRemoved,
  onInstallationApprovalChanged,
  mounted,
}: {
  installation: WorkPoleInstallation;
  viewerUserId: string;
  signedUrls: Record<string, string>;
  creatorName: string | null;
  onInstallationRemoved: (installationId: string) => void;
  onInstallationApprovalChanged: (
    installationId: string,
    approvedAt: string | null,
  ) => void;
  viewerRole: 'engineer' | 'manager';
  /** O que o campo montou neste poste. */
  mounted: MountedEquipment[];
}) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const [approvalError, setApprovalError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isApproving, startApproval] = useTransition();

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

  const published = installation.approvedAt !== null;
  const canPublish = viewerRole === 'engineer' && installation.status === 'installed';

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

  function handlePublishToggle() {
    setApprovalError(null);
    startApproval(async () => {
      const result = published
        ? await unapprovePoleInstallation(installation.id)
        : await approvePoleInstallations({
            workId: installation.workId,
            installationIds: [installation.id],
          });
      if (result.success) {
        onInstallationApprovalChanged(
          installation.id,
          published ? null : new Date().toISOString(),
        );
      } else {
        setApprovalError(result.error);
      }
    });
  }

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
            className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-link hover:underline"
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

      {mounted.length > 0 && (
        <Section title="Montado neste poste">
          <ul className="flex flex-col gap-2">
            {mounted.map((item) => (
              <li
                key={item.id}
                className="flex gap-2 rounded-md bg-gray-50 p-2"
              >
                {item.photoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={item.photoUrl}
                    alt="Foto do equipamento montado"
                    className="h-12 w-12 shrink-0 rounded-md border border-gray-200 object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md border border-dashed border-gray-200 bg-gray-100 text-[9px] text-gray-400">
                    sem foto
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] text-gray-700">
                    {item.notes ?? 'Sem descrição'}
                  </p>
                  <p className="mt-0.5 text-[10px] text-gray-400">
                    {formatRelativeShort(item.installedAt)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section title="Registro">
        <KeyValue label="Data/Hora" value={dateLabel} />
        <KeyValue label="Registrado por" value={creatorName ?? 'n/d'} />
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

      <Section title="Portal do cliente">
        <div
          className={[
            'flex items-start gap-2 rounded-md px-2.5 py-2 text-[11px]',
            published
              ? 'bg-emerald-50 text-emerald-800'
              : 'bg-amber-50 text-amber-800',
          ].join(' ')}
        >
          {published ? (
            <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          ) : (
            <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          )}
          <p>
            {published
              ? 'Publicado. Este poste aparece verde no acompanhamento que o cliente abre.'
              : 'Registrado em campo e visível aqui dentro. Ainda não aparece para o cliente.'}
          </p>
        </div>

        {approvalError && (
          <p className="mt-2 rounded-md border border-red-200 bg-red-50 px-2 py-1 text-[11px] text-red-700">
            {approvalError}
          </p>
        )}

        {canPublish && (
          <button
            type="button"
            onClick={handlePublishToggle}
            disabled={isApproving}
            className={[
              'mt-2 inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60',
              published
                ? 'border border-gray-300 bg-surface text-neutral-900 hover:bg-gray-50'
                : 'bg-emerald-600 text-white hover:bg-emerald-700',
            ].join(' ')}
          >
            {published ? (
              <>
                <Clock className="h-3 w-3" aria-hidden="true" />
                {isApproving ? 'Despublicando…' : 'Tirar do portal'}
              </>
            ) : (
              <>
                <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                {isApproving ? 'Publicando…' : 'Publicar no portal'}
              </>
            )}
          </button>
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
            className="inline-flex items-center gap-1.5 rounded-md border border-red-300 bg-surface px-3 py-1.5 text-xs font-medium text-red-700 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
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
      <span className="truncate text-xs text-neutral-900" title={value}>
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
