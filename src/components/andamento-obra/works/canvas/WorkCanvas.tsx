"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
} from 'react';
import { Document, Page } from 'react-pdf';
import {
  TransformComponent,
  TransformWrapper,
  type ReactZoomPanPinchRef,
} from 'react-zoom-pan-pinch';
import { AlertTriangle, CheckCircle2, FileText, Loader2 } from 'lucide-react';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

import type {
  WorkPoleInstallation,
  WorkProjectConnection,
  WorkProjectPost,
  WorkProjectSnapshot,
} from '@/types/works';
import {
  CANVAS_CENTER,
  CANVAS_SIZE,
  INITIAL_POSITION_X_PDF,
  INITIAL_POSITION_Y_PDF,
  INITIAL_SCALE_PDF,
  MAX_SCALE,
  MIN_SCALE,
} from '@/lib/canvas/canvasTokens';
import {
  calculatePdfPageDimensions,
  calculateRasterImageDimensions,
  configurePdfWorker,
  isHighResRender,
} from '@/lib/canvas/pdfRenderConfig';
import { useRealtimeChannel, type RealtimeEventConfig } from '@/lib/hooks/useRealtimeChannel';
import {
  approvePoleInstallations,
  loadPoleInstallation,
} from '@/actions/workPoleInstallations';
import { CanvasToolbar } from './CanvasToolbar';
import { CanvasLegend } from './CanvasLegend';
import { WorkPostMarker } from './WorkPostMarker';
import { WorkConnectionLine } from './WorkConnectionLine';
import type { MountedEquipment } from '@/services/works/getWorkExecutionOverlay';
import { WorkInstallationPin } from './WorkInstallationPin';
import { PostDetailsPanel } from './PostDetailsPanel';

configurePdfWorker();

interface WorkCanvasProps {
  workId: string;
  viewerUserId: string;
  /** Papel do usuario nesta obra. So o engenheiro publica no portal. */
  viewerRole: 'engineer' | 'manager';
  snapshot: WorkProjectSnapshot;
  posts: WorkProjectPost[];
  connections: WorkProjectConnection[];
  pdfSignedUrl: string | null;
  /** 'pdf' | 'raster' | null — tipo da planta armazenada no snapshot. */
  planKind?: 'pdf' | 'raster' | null;
  initialInstallations: WorkPoleInstallation[];
  initialInstallationSignedUrls: Record<string, string>;
  initialCreatorNames: Record<string, string>;
  /** O que foi montado em cada poste, para a ficha lateral. */
  mountedByInstallation?: Record<string, MountedEquipment[]>;
}

type Selected =
  | { kind: 'planned'; post: WorkProjectPost }
  | { kind: 'installation'; installation: WorkPoleInstallation }
  | null;

type LoadedPdfPage = Parameters<
  NonNullable<ComponentProps<typeof Page>['onLoadSuccess']>
>[0];

/**
 * Canvas read-only do Andamento de Obra.
 *
 * Renderiza tres camadas no quadro logico 6000x6000:
 *   1. Planta de fundo (PDF ou imagem raster). Centralizada em (3000, 3000).
 *   2. Camada de projeto: SVG com conexoes + marcadores de postes planejados.
 *   3. Camada de execucao: pins de instalacao em campo (WorkInstallationPin).
 *
 * PDFs multipagina possuem navegacao na toolbar. Imagens raster sao
 * escalonadas para preencher o quadro com a mesma logica do import
 * (calculateRasterImageDimensions).
 */
export function WorkCanvas({
  workId,
  viewerUserId,
  viewerRole,
  snapshot,
  posts,
  connections,
  pdfSignedUrl,
  planKind = null,
  initialInstallations,
  initialInstallationSignedUrls,
  initialCreatorNames,
  mountedByInstallation = {},
}: WorkCanvasProps) {
  const transformRef = useRef<ReactZoomPanPinchRef>(null);

  const [showPdf, setShowPdf] = useState(true);
  const [showProject, setShowProject] = useState(true);
  const [selected, setSelected] = useState<Selected>(null);

  const [installations, setInstallations] = useState<WorkPoleInstallation[]>(
    initialInstallations,
  );
  const [installationSignedUrls, setInstallationSignedUrls] = useState<
    Record<string, string>
  >(initialInstallationSignedUrls);
  const [creatorNames, setCreatorNames] =
    useState<Record<string, string>>(initialCreatorNames);

  const installationsRef = useRef<WorkPoleInstallation[]>(initialInstallations);
  installationsRef.current = installations;

  // ---------------------------------------------------------------------------
  // PDF state
  // ---------------------------------------------------------------------------
  const isPdfPlan = planKind === 'pdf';
  const isRasterPlan = planKind === 'raster';

  const [pdfNumPages, setPdfNumPages] = useState<number | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [pdfLoadError, setPdfLoadError] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState<boolean>(isPdfPlan && !!pdfSignedUrl);
  const [pdfPageDimensions, setPdfPageDimensions] = useState<{
    width: number;
    height: number;
  } | null>(null);

  // ---------------------------------------------------------------------------
  // Raster image state
  // ---------------------------------------------------------------------------
  const [rasterDimensions, setRasterDimensions] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const [rasterLoading, setRasterLoading] = useState(isRasterPlan && !!pdfSignedUrl);
  const [rasterError, setRasterError] = useState<string | null>(null);

  useEffect(() => {
    if (!isRasterPlan || !pdfSignedUrl) return;
    setRasterLoading(true);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const dims = calculateRasterImageDimensions(img.naturalWidth, img.naturalHeight);
      setRasterDimensions(dims);
      setRasterLoading(false);
    };
    img.onerror = () => {
      setRasterError('Não foi possível carregar a imagem do projeto.');
      setRasterLoading(false);
    };
    img.src = pdfSignedUrl;
  }, [isRasterPlan, pdfSignedUrl]);

  // ---------------------------------------------------------------------------
  // Derived plan state
  // ---------------------------------------------------------------------------
  const hasPdf = isPdfPlan && pdfSignedUrl !== null && pdfLoadError === null;
  const hasRaster = isRasterPlan && pdfSignedUrl !== null && rasterError === null;
  const hasPlan = hasPdf || hasRaster;
  const planLoading = pdfLoading || rasterLoading;
  const planError = pdfLoadError ?? rasterError;
  const hasProject = posts.length > 0 || connections.length > 0;
  const planLabel = isPdfPlan ? 'PDF' : 'Planta';

  const postsById = useMemo(() => {
    const map = new Map<string, WorkProjectPost>();
    for (const post of posts) map.set(post.id, post);
    return map;
  }, [posts]);

  const renderableConnections = useMemo(() => {
    type Renderable = {
      connection: WorkProjectConnection;
      from: WorkProjectPost;
      to: WorkProjectPost;
    };
    const list: Renderable[] = [];
    for (const c of connections) {
      if (c.fromPostId === c.toPostId) continue;
      const from = postsById.get(c.fromPostId);
      const to = postsById.get(c.toPostId);
      if (!from || !to) continue;
      list.push({ connection: c, from, to });
    }
    return list;
  }, [connections, postsById]);

  // -------------------------------------------------------------------------
  // Hidratacao sob demanda de uma instalacao por id (usada pelo Realtime)
  // -------------------------------------------------------------------------
  const hydrateInstallation = useCallback(
    async (installationId: string): Promise<WorkPoleInstallation | null> => {
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const result = await loadPoleInstallation(installationId);
        if (result.success && result.data) {
          const { installation, signedUrls, creatorName } = result.data;
          if (
            installation.media.length === 0
            && attempt < 2
          ) {
            await sleep(250);
            continue;
          }
          setInstallationSignedUrls((prev) => ({ ...prev, ...signedUrls }));
          if (creatorName) {
            setCreatorNames((prev) =>
              prev[installation.createdBy] === creatorName
                ? prev
                : { ...prev, [installation.createdBy]: creatorName },
            );
          }
          setInstallations((prev) => {
            const idx = prev.findIndex((i) => i.id === installation.id);
            if (idx >= 0) {
              const next = prev.slice();
              next[idx] = installation;
              return next;
            }
            return [installation, ...prev].sort((a, b) =>
              b.installedAt.localeCompare(a.installedAt),
            );
          });
          return installation;
        }
        if (attempt < 2) await sleep(250);
      }
      return null;
    },
    [],
  );

  /**
   * O engenheiro acabou de acender um poste pelo painel. O pin ja vai aparecer
   * sozinho pelo Realtime, mas esperar o round trip deixaria o painel parado
   * num poste que acabou de deixar de ser cinza. Hidrata na hora e troca a
   * ficha para a execucao, que e onde estao foto e o botao de publicar.
   */
  const handleInstallationCreated = useCallback(
    async (installationId: string) => {
      const installation = await hydrateInstallation(installationId);
      if (installation) {
        setSelected({ kind: 'installation', installation });
      } else {
        setSelected(null);
      }
    },
    [hydrateInstallation],
  );

  // -------------------------------------------------------------------------
  // Realtime via useRealtimeChannel hook
  // -------------------------------------------------------------------------
  const handleInstallInsert = useCallback(
    (payload: unknown) => {
      const row = (payload as { new?: { id?: string; status?: string } })?.new;
      if (!row?.id) return;
      if (row.status && row.status !== 'installed') return;
      void hydrateInstallation(row.id);
    },
    [hydrateInstallation],
  );

  const handleInstallUpdate = useCallback(
    (payload: unknown) => {
      const row = (payload as { new?: { id?: string; status?: string } })?.new;
      if (!row?.id) return;
      if (row.status === 'removed') {
        setInstallations((prev) => prev.filter((i) => i.id !== row.id));
        setSelected((current) =>
          current?.kind === 'installation'
          && current.installation.id === row.id
            ? null
            : current,
        );
      } else {
        void hydrateInstallation(row.id);
      }
    },
    [hydrateInstallation],
  );

  const canvasRealtimeEvents: RealtimeEventConfig[] = useMemo(
    () => [
      {
        event: 'INSERT',
        table: 'work_pole_installations',
        filter: `work_id=eq.${workId}`,
        callback: handleInstallInsert,
      },
      {
        event: 'UPDATE',
        table: 'work_pole_installations',
        filter: `work_id=eq.${workId}`,
        callback: handleInstallUpdate,
      },
    ],
    [workId, handleInstallInsert, handleInstallUpdate],
  );

  const { status: realtimeStatus } = useRealtimeChannel({
    channelName: `work:${workId}:events`,
    events: canvasRealtimeEvents,
  });

  const handleSelectPost = useCallback(
    (post: WorkProjectPost) => setSelected({ kind: 'planned', post }),
    [],
  );

  const handleSelectInstallation = useCallback(
    (installation: WorkPoleInstallation) =>
      setSelected({ kind: 'installation', installation }),
    [],
  );

  const handleResetView = () => {
    transformRef.current?.setTransform(
      INITIAL_POSITION_X_PDF,
      INITIAL_POSITION_Y_PDF,
      INITIAL_SCALE_PDF,
      300,
      'easeOutQuad',
    );
  };

  const handleZoomIn = () => transformRef.current?.zoomIn();
  const handleZoomOut = () => transformRef.current?.zoomOut();

  // -------------------------------------------------------------------------
  // PDF callbacks
  // -------------------------------------------------------------------------
  const onDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
    setPdfNumPages(numPages);
    setPdfLoadError(null);
  };

  const onDocumentLoadError = (err: Error) => {
    console.error('[WorkCanvas] erro ao carregar PDF', err);
    setPdfLoading(false);
    setPdfLoadError(err.message || 'Erro ao carregar PDF');
    setPdfNumPages(null);
  };

  const onPageLoadSuccess = (page: LoadedPdfPage) => {
    const dims = calculatePdfPageDimensions(
      page.originalWidth,
      page.originalHeight,
      snapshot.renderVersion,
    );
    setPdfPageDimensions({ width: dims.width, height: dims.height });
    setPdfLoading(false);
  };

  const onPageLoadError = (err: Error) => {
    console.error('[WorkCanvas] erro ao carregar pagina do PDF', err);
    setPdfLoading(false);
    setPdfLoadError(err.message || 'Erro ao renderizar pagina do PDF');
  };

  const handlePageChange = (page: number) => {
    if (page >= 1 && pdfNumPages && page <= pdfNumPages) {
      setPageNumber(page);
    }
  };

  const [bulkApproveError, setBulkApproveError] = useState<string | null>(null);
  const [isBulkApproving, setIsBulkApproving] = useState(false);

  const instalacoesAtivas = useMemo(
    () => installations.filter((i) => i.status === 'installed'),
    [installations],
  );

  // Fila do engenheiro: o que o campo levantou e ainda nao atravessou para o
  // portal do cliente.
  const pendingApproval = useMemo(
    () => instalacoesAtivas.filter((i) => i.approvedAt === null),
    [instalacoesAtivas],
  );

  /** Poste de projeto -> a instalacao que o acendeu. */
  const instalacaoPorPosteDeProjeto = useMemo(() => {
    const map = new Map<string, WorkPoleInstallation>();
    for (const i of instalacoesAtivas) {
      if (i.projectPostId) map.set(i.projectPostId, i);
    }
    return map;
  }, [instalacoesAtivas]);

  // Poste previsto que o campo ainda nao encostou. Conta pelo vinculo, nao
  // pela diferenca de totais: poste levantado fora do projeto entra em
  // `instalacoesAtivas` sem ter um poste previsto correspondente, e subtrair
  // um do outro daria numero negativo numa obra com muitos desses.
  //
  // A mesma lista desenha a camada cinza: poste aceso sai do cinza, senao o
  // circulo cinza e a gota verde ficam empilhados no mesmo ponto e a planta
  // passa a mostrar dois postes onde ha um. O APK ja fazia isso desde a E3; o
  // portal tinha ficado para tras.
  const postesAindaCinzas = useMemo(
    () => posts.filter((p) => !instalacaoPorPosteDeProjeto.has(p.id)),
    [posts, instalacaoPorPosteDeProjeto],
  );

  const handleApprovalChanged = useCallback(
    (installationId: string, approvedAt: string | null) => {
      setInstallations((prev) =>
        prev.map((i) => (i.id === installationId ? { ...i, approvedAt } : i)),
      );
      setSelected((prev) =>
        prev && prev.kind === 'installation' && prev.installation.id === installationId
          ? { kind: 'installation', installation: { ...prev.installation, approvedAt } }
          : prev,
      );
    },
    [],
  );

  const handleApproveAll = useCallback(async () => {
    setBulkApproveError(null);
    setIsBulkApproving(true);
    try {
      const result = await approvePoleInstallations({ workId });
      if (result.success) {
        const now = new Date().toISOString();
        setInstallations((prev) =>
          prev.map((i) =>
            i.status === 'installed' && i.approvedAt === null
              ? { ...i, approvedAt: now }
              : i,
          ),
        );
      } else {
        setBulkApproveError(result.error);
      }
    } finally {
      setIsBulkApproving(false);
    }
  }, [workId]);

  // Antes isto era um raio de 100 unidades em volta do poste selecionado,
  // porque nao havia vinculo e alguem precisava adivinhar qual pin pertencia a
  // qual poste do projeto. Desde a E3 existe `project_post_id`, e adivinhar
  // virou junção.
  const linkedInstallation = useMemo(() => {
    if (!selected || selected.kind !== 'planned') return null;
    return instalacaoPorPosteDeProjeto.get(selected.post.id) ?? null;
  }, [selected, instalacaoPorPosteDeProjeto]);

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-gray-200 bg-surface">
      <CanvasToolbar
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onReset={handleResetView}
        showPdf={showPdf}
        onTogglePdf={() => setShowPdf((v) => !v)}
        showProject={showProject}
        onToggleProject={() => setShowProject((v) => !v)}
        hasPlan={hasPlan}
        hasProject={hasProject}
        isLoading={planLoading}
        planLabel={planLabel}
        pdfNumPages={isPdfPlan ? pdfNumPages : null}
        pdfPageNumber={pageNumber}
        onPageChange={handlePageChange}
      />

      {viewerRole === 'engineer' && pendingApproval.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-200 bg-amber-50 px-3 py-2">
          <p className="text-[11px] text-amber-900">
            <strong className="font-semibold">
              {pendingApproval.length}{' '}
              {pendingApproval.length === 1 ? 'poste' : 'postes'}
            </strong>{' '}
            {pendingApproval.length === 1 ? 'levantado' : 'levantados'} em campo,
            ainda fora do portal do cliente.
          </p>
          <button
            type="button"
            onClick={handleApproveAll}
            disabled={isBulkApproving}
            className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-[11px] font-medium text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
            {isBulkApproving
              ? 'Publicando…'
              : `Publicar ${pendingApproval.length === 1 ? 'o poste' : 'os ' + pendingApproval.length}`}
          </button>
          {bulkApproveError && (
            <p className="w-full text-[11px] text-red-700">{bulkApproveError}</p>
          )}
        </div>
      )}

      {(planError || realtimeStatus === 'disconnected') && (
        <div className="flex flex-col gap-1 border-b border-gray-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
          {planError && (
            <p className="flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
              Não foi possível carregar a planta do projeto. Continuando com o
              quadro em branco.
            </p>
          )}
          {realtimeStatus === 'disconnected' && (
            <p className="flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
              Tempo real indisponível. Atualize a página para ver novas
              instalações.
            </p>
          )}
        </div>
      )}

      <div className="relative min-h-[400px] flex-1 overflow-hidden bg-gray-100">
        {planLoading && pdfSignedUrl && !planError && (
          <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center bg-surface/70 backdrop-blur-[1px]">
            <div className="flex items-center gap-2 rounded-md bg-surface px-3 py-2 text-xs text-gray-700 shadow">
              <Loader2 className="h-4 w-4 animate-spin text-neutral-900" />
              Carregando {planLabel.toLowerCase()} do projeto...
            </div>
          </div>
        )}

        <TransformWrapper
          ref={transformRef}
          minScale={MIN_SCALE}
          maxScale={MAX_SCALE}
          initialScale={INITIAL_SCALE_PDF}
          initialPositionX={INITIAL_POSITION_X_PDF}
          initialPositionY={INITIAL_POSITION_Y_PDF}
          wheel={{ step: 0.1 }}
          panning={{ disabled: false, velocityDisabled: false }}
          doubleClick={{ disabled: false }}
          centerOnInit={false}
          limitToBounds={false}
        >
          <TransformComponent
            wrapperClass="w-full h-full"
            contentClass="w-full h-full"
          >
            <div
              className="relative"
              style={{
                width: `${CANVAS_SIZE}px`,
                height: `${CANVAS_SIZE}px`,
                backgroundColor: 'white',
                border: '1px solid #e5e7eb',
              }}
            >
              {/* Camada 1a — Fundo PDF */}
              {hasPdf && showPdf && pdfSignedUrl && (
                <div
                  style={{
                    position: 'absolute',
                    top: `${CANVAS_CENTER}px`,
                    left: `${CANVAS_CENTER}px`,
                    transform: 'translate(-50%, -50%)',
                    pointerEvents: 'none',
                    zIndex: 10,
                  }}
                >
                  <div
                    style={{
                      backgroundColor: isHighResRender(snapshot.renderVersion)
                        ? 'transparent'
                        : '#f8f9fa',
                      padding: isHighResRender(snapshot.renderVersion)
                        ? '0'
                        : '20px',
                      borderRadius: isHighResRender(snapshot.renderVersion)
                        ? '0'
                        : '8px',
                      border: isHighResRender(snapshot.renderVersion)
                        ? 'none'
                        : '2px solid #dee2e6',
                      pointerEvents: 'none',
                    }}
                  >
                    <Document
                      file={pdfSignedUrl}
                      onLoadSuccess={onDocumentLoadSuccess}
                      onLoadError={onDocumentLoadError}
                      loading={
                        <div className="flex items-center justify-center rounded bg-surface p-8 text-neutral-900">
                          <Loader2 className="mr-3 h-8 w-8 animate-spin" />
                          <span className="text-lg">Carregando PDF...</span>
                        </div>
                      }
                      error={
                        <div className="rounded border-2 border-red-200 bg-red-50 p-8 text-center text-red-600">
                          <p className="text-lg font-medium">Erro ao carregar PDF</p>
                          <p className="mt-2 text-sm">Verifique se o arquivo é válido</p>
                        </div>
                      }
                    >
                      {pdfNumPages && (
                        <div
                          className="bg-surface"
                          style={{ pointerEvents: 'none' }}
                        >
                          <Page
                            pageNumber={pageNumber}
                            renderTextLayer={false}
                            renderAnnotationLayer={false}
                            onLoadSuccess={onPageLoadSuccess}
                            onLoadError={onPageLoadError}
                            width={pdfPageDimensions?.width || 1200}
                            renderMode="canvas"
                            className={
                              isHighResRender(snapshot.renderVersion)
                                ? ''
                                : 'border-2 border-gray-300 shadow-xl'
                            }
                          />
                        </div>
                      )}
                    </Document>
                  </div>
                </div>
              )}

              {/* Camada 1b — Fundo raster */}
              {hasRaster && showPdf && pdfSignedUrl && rasterDimensions && (
                <div
                  style={{
                    position: 'absolute',
                    top: `${CANVAS_CENTER}px`,
                    left: `${CANVAS_CENTER}px`,
                    transform: 'translate(-50%, -50%)',
                    pointerEvents: 'none',
                    zIndex: 10,
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={pdfSignedUrl}
                    alt="Planta do projeto"
                    width={rasterDimensions.width}
                    height={rasterDimensions.height}
                    style={{
                      width: `${rasterDimensions.width}px`,
                      height: `${rasterDimensions.height}px`,
                      pointerEvents: 'none',
                      display: 'block',
                    }}
                  />
                </div>
              )}

              {/* Camada 2 — Projeto (conexoes + postes planejados) */}
              {showProject && hasProject && (
                <>
                  <svg
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: `${CANVAS_SIZE}px`,
                      height: `${CANVAS_SIZE}px`,
                      pointerEvents: 'none',
                      zIndex: 35,
                    }}
                    aria-hidden="true"
                  >
                    {renderableConnections.map(({ connection, from, to }) => (
                      <WorkConnectionLine
                        key={connection.id}
                        connection={connection}
                        fromPost={from}
                        toPost={to}
                      />
                    ))}
                  </svg>

                  <div
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: `${CANVAS_SIZE}px`,
                      height: `${CANVAS_SIZE}px`,
                      pointerEvents: 'none',
                      zIndex: 50,
                    }}
                  >
                    <div
                      style={{
                        position: 'relative',
                        width: '100%',
                        height: '100%',
                        pointerEvents: 'auto',
                      }}
                    >
                      {postesAindaCinzas.map((post) => (
                        <WorkPostMarker
                          key={post.id}
                          post={post}
                          selected={
                            selected?.kind === 'planned'
                            && selected.post.id === post.id
                          }
                          onSelect={handleSelectPost}
                        />
                      ))}
                    </div>
                  </div>
                </>
              )}

              {/* Camada 3 — Execucao: pins de instalacao em campo */}
              <div
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: `${CANVAS_SIZE}px`,
                  height: `${CANVAS_SIZE}px`,
                  pointerEvents: 'none',
                  zIndex: 60,
                }}
              >
                <div
                  style={{
                    position: 'relative',
                    width: '100%',
                    height: '100%',
                    pointerEvents: 'auto',
                  }}
                >
                  {installations.map((installation) => (
                    <WorkInstallationPin
                      key={installation.id}
                      installation={installation}
                      selected={
                        selected?.kind === 'installation'
                        && selected.installation.id === installation.id
                      }
                      onSelect={handleSelectInstallation}
                      creatorName={creatorNames[installation.createdBy] ?? null}
                    />
                  ))}
                </div>
              </div>
            </div>
          </TransformComponent>
        </TransformWrapper>

        {/* Fora do TransformWrapper de proposito: a legenda nao anda nem
            escala com o pan e o zoom. */}
        {hasProject && (
          <CanvasLegend
            previstos={postesAindaCinzas.length}
            aguardando={pendingApproval.length}
            publicados={instalacoesAtivas.length - pendingApproval.length}
          />
        )}
      </div>

      <PostDetailsPanel
        selected={selected}
        workId={workId}
        viewerUserId={viewerUserId}
        viewerRole={viewerRole}
        linkedInstallation={linkedInstallation}
        installationSignedUrls={installationSignedUrls}
        creatorNames={creatorNames}
        onClose={() => setSelected(null)}
        onSelectInstallation={(installation) =>
          setSelected({ kind: 'installation', installation })
        }
        onInstallationCreated={handleInstallationCreated}
        mountedByInstallation={mountedByInstallation}
        onInstallationRemoved={(installationId) => {
          setInstallations((prev) => prev.filter((i) => i.id !== installationId));
          setSelected(null);
        }}
        onInstallationApprovalChanged={handleApprovalChanged}
      />
    </div>
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
