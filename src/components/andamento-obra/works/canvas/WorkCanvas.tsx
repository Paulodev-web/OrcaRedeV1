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
import { AlertTriangle, FileText, Loader2 } from 'lucide-react';
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
  configurePdfWorker,
  isHighResRender,
} from '@/lib/canvas/pdfRenderConfig';
import { useRealtimeChannel, type RealtimeEventConfig } from '@/lib/hooks/useRealtimeChannel';
import { loadPoleInstallation } from '@/actions/workPoleInstallations';
import { CanvasToolbar } from './CanvasToolbar';
import { WorkPostMarker } from './WorkPostMarker';
import { WorkConnectionLine } from './WorkConnectionLine';
import { WorkInstallationPin } from './WorkInstallationPin';
import { PostDetailsPanel } from './PostDetailsPanel';

configurePdfWorker();

interface WorkCanvasProps {
  workId: string;
  /** Id do usuario logado, usado para mostrar acoes de manager no painel. */
  viewerUserId: string;
  snapshot: WorkProjectSnapshot;
  posts: WorkProjectPost[];
  connections: WorkProjectConnection[];
  pdfSignedUrl: string | null;
  /** Instalacoes ativas (status='installed'). */
  initialInstallations: WorkPoleInstallation[];
  /** URLs assinadas das midias (path -> url). */
  initialInstallationSignedUrls: Record<string, string>;
  /** Nome do criador (perfil) por user_id; usado em tooltip e painel. */
  initialCreatorNames: Record<string, string>;
}

type Selected =
  | { kind: 'planned'; post: WorkProjectPost }
  | { kind: 'installation'; installation: WorkPoleInstallation }
  | null;

/**
 * Tipo do callback `onLoadSuccess` da `<Page>` do react-pdf.
 * O argumento e' um PDFPageProxy aumentado com width/height/originalWidth/
 * originalHeight (ja em pixels CSS). Inferimos o tipo direto do componente
 * Page para evitar `any` e mante-lo aderente a versao instalada.
 */
type LoadedPdfPage = Parameters<
  NonNullable<ComponentProps<typeof Page>['onLoadSuccess']>
>[0];

/**
 * Canvas read-only do Andamento de Obra.
 *
 * Renderiza tres camadas no quadro logico 6000x6000:
 *   1. PDF de fundo (se houver). Posicionado no centro do quadro,
 *      replicando offset (3000, 3000) com translate(-50%, -50%).
 *   2. Camada de projeto: SVG unico com todas as conexoes + marcadores
 *      de postes planejados (cinza, opacidade 0.7).
 *   3. Camada de execucao: pins de instalacao em campo (`WorkInstallationPin`),
 *      verdes, formato gota, posicionados em (x_coord, y_coord) recebidos do
 *      banco. Hidratados em tempo real via canal `work:{workId}:events`.
 *      Cores adicionais por status (amarelo/vermelho) ficam pro Bloco 8 quando
 *      alertas existirem.
 *
 * Pan/zoom via react-zoom-pan-pinch (mesmo wrapper do CanvasVisual
 * legado). Estados visuais (toggle PDF/projeto, post selecionado) sao
 * volateis - nao persistem em URL/query.
 *
 * Edge cases:
 *   - PDF falha ao carregar -> banner de aviso + canvas branco preservado
 *   - Self-loop (from === to) -> conexao ignorada silenciosamente
 *   - Coordenadas fora de 0..6000 -> renderizadas como vieram (clamping
 *     visual e' opcional; o snapshot e' imutavel)
 *   - PDF multi-pagina -> primeira pagina renderizada, banner informativo
 */
export function WorkCanvas({
  workId,
  viewerUserId,
  snapshot,
  posts,
  connections,
  pdfSignedUrl,
  initialInstallations,
  initialInstallationSignedUrls,
  initialCreatorNames,
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
  // Realtime status managed by useRealtimeChannel hook below.

  const installationsRef = useRef<WorkPoleInstallation[]>(initialInstallations);
  installationsRef.current = installations;

  const [pdfNumPages, setPdfNumPages] = useState<number | null>(null);
  const [pdfLoadError, setPdfLoadError] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState<boolean>(!!pdfSignedUrl);
  const [pdfPageDimensions, setPdfPageDimensions] = useState<{
    width: number;
    height: number;
  } | null>(null);

  const hasPdf = pdfSignedUrl !== null && pdfLoadError === null;
  const hasProject = posts.length > 0 || connections.length > 0;

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
    async (installationId: string) => {
      // Retry 3x para cobrir gap entre INSERT da instalacao e INSERT do batch
      // de midia (mesmo padrao do DailyLogList do Bloco 6).
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
          return;
        }
        if (attempt < 2) await sleep(250);
      }
    },
    [],
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

  const showMultiPageBanner =
    hasPdf && pdfNumPages !== null && pdfNumPages > 1;

  // Para o painel em modo "planejado": instalacoes proximas por proximidade
  // visual (raio 100 unidades no espaco logico do canvas). Heuristica
  // documentada no plano (Bloco 7): nao cria vinculo formal, e sugestao.
  const installationsNearSelected = useMemo(() => {
    if (!selected || selected.kind !== 'planned') return [];
    const post = selected.post;
    return installations.filter((inst) => {
      const dx = inst.xCoord - post.xCoord;
      const dy = inst.yCoord - post.yCoord;
      return Math.hypot(dx, dy) < 100;
    });
  }, [selected, installations]);

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white">
      <CanvasToolbar
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onReset={handleResetView}
        showPdf={showPdf}
        onTogglePdf={() => setShowPdf((v) => !v)}
        showProject={showProject}
        onToggleProject={() => setShowProject((v) => !v)}
        hasPdf={hasPdf}
        hasProject={hasProject}
        isLoading={pdfLoading}
      />

      {(pdfLoadError || showMultiPageBanner || realtimeStatus === 'disconnected') && (
        <div className="flex flex-col gap-1 border-b border-gray-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
          {pdfLoadError && (
            <p className="flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
              Não foi possível carregar o PDF do projeto. Continuando com o
              quadro em branco.
            </p>
          )}
          {showMultiPageBanner && (
            <p className="flex items-center gap-1.5">
              <FileText className="h-3.5 w-3.5" aria-hidden="true" />
              PDF tem {pdfNumPages} páginas. Apenas a primeira é exibida nesta
              fase.
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
        {pdfLoading && pdfSignedUrl && !pdfLoadError && (
          <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center bg-white/70 backdrop-blur-[1px]">
            <div className="flex items-center gap-2 rounded-md bg-white px-3 py-2 text-xs text-gray-700 shadow">
              <Loader2 className="h-4 w-4 animate-spin text-[#1D3140]" />
              Carregando PDF do projeto...
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
                        <div className="flex items-center justify-center rounded bg-white p-8 text-[#1D3140]">
                          <Loader2 className="mr-3 h-8 w-8 animate-spin" />
                          <span className="text-lg">Carregando PDF...</span>
                        </div>
                      }
                      error={null}
                    >
                      {pdfNumPages && (
                        <div
                          className="bg-white"
                          style={{ pointerEvents: 'none' }}
                        >
                          <Page
                            pageNumber={1}
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
                      {posts.map((post) => (
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

              {/* Camada 3 - Execucao (Bloco 7): pins de instalacao em campo. */}
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
      </div>

      <PostDetailsPanel
        selected={selected}
        viewerUserId={viewerUserId}
        installationsNearSelected={installationsNearSelected}
        installationSignedUrls={installationSignedUrls}
        creatorNames={creatorNames}
        onClose={() => setSelected(null)}
        onSelectInstallation={(installation) =>
          setSelected({ kind: 'installation', installation })
        }
        onInstallationRemoved={(installationId) => {
          setInstallations((prev) => prev.filter((i) => i.id !== installationId));
          setSelected(null);
        }}
      />
    </div>
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
