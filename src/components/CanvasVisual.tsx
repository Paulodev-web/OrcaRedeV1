"use client";
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Upload, Trash2, Loader2, ChevronLeft, ChevronRight, ZoomIn, ZoomOut, RotateCcw, Package, Eye, EyeOff } from 'lucide-react';
import { Document, Page, pdfjs } from 'react-pdf';
import type { PDFPageProxy } from 'pdfjs-dist';
import { TransformWrapper, TransformComponent, ReactZoomPanPinchRef } from 'react-zoom-pan-pinch';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import { Orcamento, Poste, TipoPoste, BudgetPostDetail, BudgetDetails } from '@/types';
import { PostIcon } from './PostIcon';
import { getPostDisplayName } from '@/lib/utils';

// Worker via CDN usando a versão exata do pdfjs-dist instalado
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

interface PostConnection {
  id: string;
  from_post_id: string;
  to_post_id: string;
  connection_type?: 'blue' | 'green';
}

interface CanvasVisualProps {
  orcamento: Orcamento;
  budgetDetails?: BudgetDetails | null;
  selectedPoste: Poste | null;
  selectedPostDetail?: BudgetPostDetail | null;
  onPosteClick: (poste: Poste) => void;
  onPostDetailClick?: (post: BudgetPostDetail) => void;
  onEditPost?: (post: BudgetPostDetail) => void; // Nova prop para editar poste
  onAddPoste: (x: number, y: number, tipo: TipoPoste) => void;
  onUpdatePoste: (posteId: string, updates: Partial<Poste>) => void;
  onUpdatePostCoordinates?: (postId: string, x: number, y: number) => void; // Nova prop para arrastar poste
  onUploadImage: () => void;
  onDeleteImage: () => void;
  onDeletePoste: (posteId: string) => void;
  onRightClick?: (coords: {x: number, y: number}) => void;
  onCanvasCtrlClick?: (coords: {x: number, y: number}) => void;
  capturedPastePoints?: Array<{ x: number; y: number }>;
  loadingUpload?: boolean;
  postConnections?: PostConnection[]; // Nova prop para conexões de rede
  onDeleteConnection?: (connectionId: string) => void;
  onAddConnection?: (fromPostId: string, toPostId: string, connectionType?: 'blue' | 'green') => void;
  /** Ocultar nomes dos postes (ex.: mapa de acompanhamento) */
  hidePostNames?: boolean;
  /** Sempre renderizar ícones verdes (ex.: mapa de acompanhamento) */
  postIconAlwaysGreen?: boolean;
  /** Ocultar título "Planta do Orçamento" e todos os botões (zoom, upload, etc.) */
  hideToolbar?: boolean;
}

export function CanvasVisual({ 
  orcamento, 
  budgetDetails,
  selectedPoste: _selectedPoste, 
  selectedPostDetail,
  onPosteClick: _onPosteClick, 
  onPostDetailClick,
  onEditPost,
  onAddPoste: _onAddPoste, 
  onUpdatePoste,
  onUpdatePostCoordinates,
  onUploadImage,
  onDeleteImage,
  onDeletePoste: _onDeletePoste,
  onRightClick,
  onCanvasCtrlClick,
  capturedPastePoints = [],
  loadingUpload = false,
  postConnections = [],
  onDeleteConnection,
  onAddConnection,
  hidePostNames = false,
  postIconAlwaysGreen = false,
  hideToolbar = false
}: CanvasVisualProps) {

  const containerRef = useRef<HTMLDivElement>(null);
  const transformRef = useRef<ReactZoomPanPinchRef>(null);
  const [imageDimensions, setImageDimensions] = useState<{
    width: number;
    height: number;
    naturalWidth: number;
    naturalHeight: number;
  } | null>(null);
  
  // Estados para PDF
  const [numPages, setNumPages] = useState<number | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [showPdfLayer, setShowPdfLayer] = useState(true);

  // Estado para carregamento de imagem normal
  const [imageLoading, setImageLoading] = useState(false);
  
  // Estados para criação de conexões
  const [connectionMode, setConnectionMode] = useState(false);
  const [connectionStart, setConnectionStart] = useState<string | null>(null);
  const [connectionType, setConnectionType] = useState<'blue' | 'green'>('blue');

  // Estados para drag de postes
  const [isDragging, setIsDragging] = useState(false);
  const [draggedPostId, setDraggedPostId] = useState<string | null>(null);
  const [dragStartMousePos, setDragStartMousePos] = useState({ x: 0, y: 0 });
  const [dragStartPostPos, setDragStartPostPos] = useState({ x: 0, y: 0 });
  const [tempPostPosition, setTempPostPosition] = useState<{ x: number; y: number } | null>(null);
  const canvasLayerRef = useRef<HTMLDivElement>(null);
  
  // Função para criar uma nova conexão
  const handleCreateConnection = (fromPostId: string, toPostId: string) => {
    if (!onAddConnection || fromPostId === toPostId) return;
    
    // Verificar se a conexão já existe (mesmo par E mesmo tipo)
    const exists = postConnections.some(
      (conn) => 
        (conn.connection_type ?? 'blue') === connectionType &&
        ((conn.from_post_id === fromPostId && conn.to_post_id === toPostId) ||
         (conn.from_post_id === toPostId && conn.to_post_id === fromPostId))
    );
    
    if (!exists) {
      onAddConnection(fromPostId, toPostId, connectionType);
      console.log(`🔗 Conexão criada: ${fromPostId} -> ${toPostId} (${connectionType})`);
    }
    
    // Resetar modo de conexão
    setConnectionMode(false);
    setConnectionStart(null);
  };
  
  // Função para alternar modo de conexão
  const toggleConnectionMode = (type: 'blue' | 'green' = 'blue') => {
    setConnectionType(type);
    setConnectionMode(!connectionMode);
    setConnectionStart(null);
    console.log(`🔗 Modo de conexão: ${!connectionMode ? 'ATIVADO' : 'DESATIVADO'} (${type})`);
  };

  // Teclas de atalho para modo de conexão
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!onAddConnection) return;
      
      // C = Conexão azul (BT)
      if (event.key === 'c' || event.key === 'C') {
        event.preventDefault();
        toggleConnectionMode('blue');
      }
      
      // V = Conexão verde (MT)
      if (event.key === 'v' || event.key === 'V') {
        event.preventDefault();
        toggleConnectionMode('green');
      }
      
      // ESC = Cancelar modo de conexão
      if (event.key === 'Escape') {
        setConnectionMode(false);
        setConnectionStart(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- toggleConnectionMode usa connectionMode, adicionar causaria re-registro excessivo
  }, [connectionMode, onAddConnection]);

  // ⚡ OTIMIZAÇÃO: Usar useMemo para valores calculados
  const hasImage = useMemo(() => 
    orcamento.imagemPlanta && orcamento.imagemPlanta.trim() !== '',
    [orcamento.imagemPlanta]
  );
  
  // Configurar dimensões padrão para o quadro branco
  const defaultCanvasDimensions = useMemo(() => ({
    width: 6000,
    height: 6000,
    naturalWidth: 6000,
    naturalHeight: 6000
  }), []);

  // ⚡ OTIMIZAÇÃO: Detectar se é PDF com useMemo
  const isPDF = useMemo(() => 
    hasImage && (
      orcamento.imagemPlanta?.toLowerCase().includes('.pdf') || 
      orcamento.imagemPlanta?.toLowerCase().includes('application/pdf') ||
      orcamento.imagemPlanta?.startsWith('data:application/pdf')
    ),
    [hasImage, orcamento.imagemPlanta]
  );
  
  // Calcular dimensões da imagem quando ela mudar
  useEffect(() => {
    let timeoutId: NodeJS.Timeout | null = null;
    
    if (!hasImage) {
      setImageDimensions(defaultCanvasDimensions);
    } else if (isPDF) {
      setPdfLoading(true);
      setNumPages(null);
      setPageNumber(1);
      setImageDimensions({
        width: 800,
        height: 600,
        naturalWidth: 800,
        naturalHeight: 600
      });

      timeoutId = setTimeout(() => {
        setPdfLoading(false);
      }, 10000);
    } else if (orcamento.imagemPlanta && !isPDF) {
      setImageLoading(true);
      
      const loadImage = () => {
      const img = new Image();
        img.crossOrigin = "anonymous";
        img.src = orcamento.imagemPlanta!;
        
      img.onload = () => {
          const maxWidth = 1200;
          const maxHeight = 800;
          
        const imageAspectRatio = img.width / img.height;

        let width: number;
        let height: number;

          if (imageAspectRatio > maxWidth / maxHeight) {
            width = maxWidth;
            height = maxWidth / imageAspectRatio;
        } else {
            height = maxHeight;
            width = maxHeight * imageAspectRatio;
          }

        setImageDimensions({
          width,
          height,
          naturalWidth: img.width,
          naturalHeight: img.height
        });
          
          setImageLoading(false);
        };
        
        img.onerror = () => {
          setImageDimensions(null);
          setImageLoading(false);
        };
      };
      
      setTimeout(loadImage, 100);
    } else {
      setImageDimensions(null);
    }

    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- defaultCanvasDimensions e imageDimensions intencionalmente omitidos
  }, [orcamento.imagemPlanta, isPDF, hasImage]);

  // useEffect específico para centralizar imagens normais após carregamento
  useEffect(() => {
    if (hasImage && !isPDF && imageDimensions && transformRef.current) {
      const timer = setTimeout(() => {
        if (transformRef.current) {
          transformRef.current.centerView(0.8, 200);
        }
      }, 300);
      
      return () => clearTimeout(timer);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- imageDimensions completo pode causar loop
  }, [hasImage, isPDF, imageDimensions?.width, imageDimensions?.height]);

  useEffect(() => {
    // Sempre exibe o PDF novamente quando o arquivo muda ou deixa de ser PDF.
    setShowPdfLayer(true);
  }, [isPDF, orcamento.imagemPlanta]);


  // Funções para PDF
  const onDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
    setPageNumber(1);
    setPdfLoading(false);
  };

  const onDocumentLoadError = () => {
    setPdfLoading(false);
    setNumPages(null);
    setImageDimensions({
      width: 800,
      height: 600,
      naturalWidth: 800,
      naturalHeight: 600
    });
  };

  const onPageLoadSuccess = (page: PDFPageProxy) => {
    const viewport = page.getViewport({ scale: 1 });
    
    // 🔥 VERSIONAMENTO: Lógica condicional baseada em render_version
    const renderVersion = budgetDetails?.render_version || 1;
    
    let finalWidth: number;
    let finalHeight: number;
    let scale: number;
    
    if (renderVersion === 2) {
      // ✨ VERSÃO 2: Alta resolução - PDF renderizado nativamente em 6000px
      // Calcular scale para que o PDF tenha exatamente 6000px de largura
      const targetWidth = 6000;
      scale = targetWidth / viewport.width;
      
      finalWidth = targetWidth;
      finalHeight = viewport.height * scale;
      
      console.log(`[Render V2] PDF em alta resolução: scale=${scale.toFixed(2)}, width=${finalWidth}px, height=${finalHeight.toFixed(0)}px`);
    } else {
      // 📦 VERSÃO 1 (LEGADO): Lógica original - PDF pequeno + esticamento CSS
      const minScale = 2;
      const maxScale = 4;
      scale = Math.max(minScale, Math.min(maxScale, 1200 / Math.max(viewport.width, viewport.height)));
      
      finalWidth = viewport.width * scale;
      finalHeight = viewport.height * scale;
      
      console.log(`[Render V1] PDF legado: scale=${scale.toFixed(2)}, width=${finalWidth}px, height=${finalHeight}px`);
    }

    setImageDimensions({
      width: finalWidth,
      height: finalHeight,
      naturalWidth: viewport.width,
      naturalHeight: viewport.height
    });
    
    setPdfLoading(false);
  };

  const changePage = (offset: number) => {
    setPageNumber(prevPageNumber => {
      const newPageNumber = prevPageNumber + offset;
      if (newPageNumber >= 1 && numPages && newPageNumber <= numPages) {
        return newPageNumber;
      }
      return prevPageNumber;
    });
  };

  const handleCanvasClick = (_event: React.MouseEvent<HTMLDivElement>) => {
    // Remover a funcionalidade de adicionar poste com clique esquerdo
    // Agora será usado apenas o clique direito
  };

  // Função para centralizar
  const centerOnPDF = () => {
    if (transformRef.current) {
      if (!hasImage || isPDF) {
        transformRef.current.setTransform(-1000, -1200, 0.5, 300, 'easeOutQuad');
      } else {
        transformRef.current.resetTransform();
      }
    }
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (!imageDimensions) return;

    const rect = event.currentTarget.getBoundingClientRect();
    const dropX = event.clientX - rect.left;
    const dropY = event.clientY - rect.top;

    // Calcular coordenadas percentuais para o sistema transformado
    const x = (dropX / rect.width) * 100;
    const y = (dropY / rect.height) * 100;
    
    // Garantir que as coordenadas estejam dentro dos limites
    if (x >= 0 && x <= 100 && y >= 0 && y <= 100) {
      const posteId = event.dataTransfer.getData('text/plain');
      onUpdatePoste(posteId, { x, y });
    }
  };

  // Função helper para obter as coordenadas do poste (temporárias durante drag ou normais)
  const getPostCoordinates = (post: BudgetPostDetail) => {
    if (isDragging && draggedPostId === post.id && tempPostPosition) {
      return { x: tempPostPosition.x, y: tempPostPosition.y };
    }
    return { x: post.x_coord, y: post.y_coord };
  };

  const renderNetworkConnection = (connection: PostConnection) => {
    const fromPost = budgetDetails?.posts?.find((p) => p.id === connection.from_post_id);
    const toPost = budgetDetails?.posts?.find((p) => p.id === connection.to_post_id);
    if (!fromPost || !toPost) return null;

    const fromCoords = getPostCoordinates(fromPost);
    const toCoords = getPostCoordinates(toPost);

    // Normaliza a direção da linha para manter a curvatura consistente
    // mesmo quando a conexão é criada em ordem inversa (A->B ou B->A).
    const isDirectOrder = connection.from_post_id <= connection.to_post_id;
    const start = isDirectOrder ? fromCoords : toCoords;
    const end = isDirectOrder ? toCoords : fromCoords;

    const x1 = start.x + 15;
    const y1 = start.y + 15;
    const x2 = end.x + 15;
    const y2 = end.y + 15;

    const dx = x2 - x1;
    const dy = y2 - y1;
    const length = Math.hypot(dx, dy) || 1;
    const midX = (x1 + x2) / 2;
    const midY = (y1 + y2) / 2;

    // Curvatura sutil com direção oposta para cada tipo de rede
    const baseCurve = Math.min(52, Math.max(16, length * 0.1));
    const curveSign = (connection.connection_type ?? 'blue') === 'green' ? 1 : -1;
    const perpX = (-dy / length) * baseCurve * curveSign;
    const perpY = (dx / length) * baseCurve * curveSign;
    const controlX = midX + perpX;
    const controlY = midY + perpY;

    const stroke = (connection.connection_type ?? 'blue') === 'green' ? '#10B981' : '#3B82F6';
    const shadow = (connection.connection_type ?? 'blue') === 'green'
      ? 'drop-shadow(0px 3px 6px rgba(16, 185, 129, 0.35))'
      : 'drop-shadow(0px 3px 6px rgba(59, 130, 246, 0.35))';

    const pathD = `M ${x1} ${y1} Q ${controlX} ${controlY} ${x2} ${y2}`;
    return (
      <g key={connection.id}>
        {/* Área de clique mais grossa para facilitar excluir com botão direito */}
        <path
          d={pathD}
          stroke="transparent"
          strokeWidth={28}
          fill="none"
          style={{ pointerEvents: 'stroke', cursor: onDeleteConnection ? 'pointer' : 'default' }}
          onContextMenu={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onDeleteConnection?.(connection.id);
          }}
        />
        <path
          d={pathD}
          stroke={stroke}
          strokeWidth={5}
          strokeLinecap="round"
          strokeDasharray="14 8"
          fill="none"
          className="drop-shadow-lg"
          style={{ filter: shadow, pointerEvents: 'none' }}
        />
      </g>
    );
  };

  // Handlers para arrastar postes
  const handlePostDragStart = (postId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    
    const post = budgetDetails?.posts?.find(p => p.id === postId);
    if (!post) return;

    setIsDragging(true);
    setDraggedPostId(postId);
    
    // Armazenar a posição inicial do mouse (coordenadas da tela)
    setDragStartMousePos({ x: e.clientX, y: e.clientY });
    
    // Armazenar a posição inicial do poste
    setDragStartPostPos({ x: post.x_coord, y: post.y_coord });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || !draggedPostId) return;

    e.preventDefault();
    e.stopPropagation();

    // Calcular o delta do movimento do mouse
    const deltaX = e.clientX - dragStartMousePos.x;
    const deltaY = e.clientY - dragStartMousePos.y;
    
    // Obter o scale atual do transform
    const scale = transformRef.current?.instance?.transformState?.scale || 1;
    
    // Calcular o delta ajustado pela escala
    const adjustedDeltaX = deltaX / scale;
    const adjustedDeltaY = deltaY / scale;

    // Calcular a nova posição baseada na posição inicial + delta
    const newX = dragStartPostPos.x + adjustedDeltaX;
    const newY = dragStartPostPos.y + adjustedDeltaY;

    // Atualizar a posição temporária para feedback visual
    setTempPostPosition({ x: Math.max(0, newX), y: Math.max(0, newY) });
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    if (!isDragging || !draggedPostId) return;

    e.preventDefault();
    e.stopPropagation();
    
    // Calcular o delta do movimento do mouse
    const deltaX = e.clientX - dragStartMousePos.x;
    const deltaY = e.clientY - dragStartMousePos.y;

    // Obter o scale atual do transform
    const scale = transformRef.current?.instance?.transformState?.scale || 1;
    
    // Calcular o delta ajustado pela escala
    const adjustedDeltaX = deltaX / scale;
    const adjustedDeltaY = deltaY / scale;

    // Calcular as coordenadas finais
    const finalX = Math.max(0, Math.round(dragStartPostPos.x + adjustedDeltaX));
    const finalY = Math.max(0, Math.round(dragStartPostPos.y + adjustedDeltaY));

    // Atualizar no banco de dados
    if (onUpdatePostCoordinates) {
      onUpdatePostCoordinates(draggedPostId, finalX, finalY);
    }

    // Resetar estados
    setIsDragging(false);
    setDraggedPostId(null);
    setDragStartMousePos({ x: 0, y: 0 });
    setDragStartPostPos({ x: 0, y: 0 });
    setTempPostPosition(null);
  };

  return (
    <div className="h-full flex flex-col">
      {!hideToolbar && (
        <>
          {/* Cabeçalho com título e controles */}
          <div className="bg-gray-50 px-3 py-2 border-b border-gray-200">
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center space-x-2">
                <Package className="h-5 w-5 text-blue-600" />
                <h3 className="text-base font-semibold text-gray-900">Planta do Orçamento</h3>
              </div>
              <div className="flex items-center space-x-2">
                <button
                  onClick={onUploadImage}
                  className="px-3 py-1.5 bg-blue-600 text-white hover:bg-blue-700 rounded-md flex items-center space-x-1.5 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                  disabled={loadingUpload || imageLoading || pdfLoading}
                  title="Fazer upload de nova planta"
                >
                  {loadingUpload ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      <span>Enviando...</span>
                    </>
                  ) : (
                    <>
                      <Upload className="h-3.5 w-3.5" />
                      <span>Nova Imagem/PDF</span>
                    </>
                  )}
                </button>
                <button
                  onClick={onDeleteImage}
                  className="p-1.5 text-red-600 hover:bg-red-50 rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={loadingUpload || imageLoading || pdfLoading}
                  title="Excluir planta"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
            
            {/* Linha de controles */}
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                {/* Controles de Zoom */}
                <div className="flex items-center space-x-0.5 bg-white border border-gray-300 rounded-md">
                  <button
                    onClick={() => transformRef.current?.zoomOut()}
                    disabled={loadingUpload || imageLoading || pdfLoading}
                    className="p-1.5 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed border-r border-gray-300"
                    title="Diminuir zoom"
                  >
                    <ZoomOut className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={centerOnPDF}
                    disabled={loadingUpload || imageLoading || pdfLoading}
                    className="p-1.5 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed border-r border-gray-300"
                    title={!hasImage || isPDF ? "Centrar no quadro" : "Resetar zoom"}
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => transformRef.current?.zoomIn()}
                    disabled={loadingUpload || imageLoading || pdfLoading}
                    className="p-1.5 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Aumentar zoom"
                  >
                    <ZoomIn className="h-3.5 w-3.5" />
                  </button>
                </div>

                {/* Controles de Conexão de Rede */}
                {!hideToolbar && onAddConnection && (
                  <div className="flex items-center space-x-0.5 bg-white border border-gray-300 rounded-md">
                    <button
                      onClick={() => toggleConnectionMode('blue')}
                      disabled={loadingUpload || imageLoading || pdfLoading}
                      className={`p-1.5 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed border-r border-gray-300 ${
                        connectionMode && connectionType === 'blue' ? 'bg-blue-100 text-blue-700' : ''
                      }`}
                      title="Modo conexão azul (BT)"
                    >
                      <div className="h-3.5 w-3.5 rounded-full bg-blue-500"></div>
                    </button>
                    <button
                      onClick={() => toggleConnectionMode('green')}
                      disabled={loadingUpload || imageLoading || pdfLoading}
                      className={`p-1.5 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed ${
                        connectionMode && connectionType === 'green' ? 'bg-green-100 text-green-700' : ''
                      }`}
                      title="Modo conexão verde (MT)"
                    >
                      <div className="h-3.5 w-3.5 rounded-full bg-green-500"></div>
                    </button>
                  </div>
                )}

                {/* Status do modo de conexão */}
                {connectionMode && (
                  <div className="px-2 py-1 bg-yellow-100 border border-yellow-300 rounded-md text-xs text-yellow-800">
                    {connectionStart 
                      ? `Clique no segundo poste (${connectionType}) • ESC para cancelar`
                      : `Clique no primeiro poste (${connectionType}) • C=azul V=verde ESC=sair`
                    }
                  </div>
                )}

                {/* Controles de PDF */}
                {isPDF && numPages && numPages > 1 && (
                  <div className="flex items-center space-x-0.5 bg-white border border-gray-300 rounded-md">
                    <button
                      onClick={() => changePage(-1)}
                      disabled={pageNumber <= 1 || loadingUpload}
                      className="p-1.5 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed border-r border-gray-300"
                      title="Página anterior"
                    >
                      <ChevronLeft className="h-3.5 w-3.5" />
                    </button>
                    <span className="text-xs text-gray-600 px-2 min-w-[60px] text-center">
                      {pageNumber}/{numPages}
                    </span>
                    <button
                      onClick={() => changePage(1)}
                      disabled={pageNumber >= numPages || loadingUpload}
                      className="p-1.5 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed border-l border-gray-300"
                      title="Próxima página"
                    >
                      <ChevronRight className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}

                {isPDF && (
                  <button
                    onClick={() => setShowPdfLayer((prev) => !prev)}
                    disabled={loadingUpload || pdfLoading}
                    className="px-2.5 py-1.5 bg-white border border-gray-300 rounded-md hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-1 text-xs text-gray-700"
                    title={showPdfLayer ? 'Ocultar PDF no canvas' : 'Mostrar PDF no canvas'}
                  >
                    {showPdfLayer ? (
                      <>
                        <EyeOff className="h-3.5 w-3.5" />
                        <span>Ocultar PDF</span>
                      </>
                    ) : (
                      <>
                        <Eye className="h-3.5 w-3.5" />
                        <span>Mostrar PDF</span>
                      </>
                    )}
                  </button>
                )}
              </div>
              
              <div className="text-xs text-gray-500 italic">
                {loadingUpload ? 'Processando...' : 
                 pdfLoading ? 'Carregando PDF...' :
                 imageLoading ? 'Carregando...' :
                 'Clique direito para adicionar poste'}
              </div>
            </div>
          </div>
        </>
      )}

      {/* Container principal com imagem e tabela */}
      <div className="flex-1 flex flex-col">
        {/* Área da imagem com postes */}
        <div 
          ref={containerRef}
          className="flex-1 relative bg-gray-50"
        >
          <TransformWrapper
            key={`transform-${hasImage}-${isPDF}`} // Força re-renderização quando tipo muda
            ref={transformRef}
            minScale={0.1}
            maxScale={5}
            initialScale={hasImage && !isPDF ? 0.8 : 0.5}
            initialPositionX={hasImage && !isPDF ? 0 : -1000}
            initialPositionY={hasImage && !isPDF ? 0 : -1200}
            wheel={{ step: 0.1 }}
            panning={{ disabled: false }}
            doubleClick={{ disabled: false }}
            centerOnInit={false}
            limitToBounds={false}
          >
            {(ref) => {
              const state = ref.instance?.transformState ?? { scale: 1, positionX: 0, positionY: 0 };
              // Função para capturar clique direito no quadro branco (para PDFs e quadro vazio)
              const handleQuadroBrancoRightClick = (event: React.MouseEvent<HTMLDivElement>) => {
                event.preventDefault();

                const rect = event.currentTarget.getBoundingClientRect();
                const clickX = event.clientX - rect.left;
                const clickY = event.clientY - rect.top;
                
                const scale = state.scale || 1;
                const positionX = state.positionX || 0;
                const positionY = state.positionY || 0;
                
                const viewportLeft = -positionX / scale;
                const viewportTop = -positionY / scale;
                const viewportWidth = rect.width / scale;
                const viewportHeight = rect.height / scale;
                
                const x = Math.round(viewportLeft + (clickX / rect.width) * viewportWidth);
                const y = Math.round(viewportTop + (clickY / rect.height) * viewportHeight);
                
                if (x >= 0 && y >= 0 && x <= 6000 && y <= 6000) {
                  if (onRightClick) {
                    onRightClick({ x, y });
                  }
                }
              };

              const handleQuadroBrancoLeftClick = (event: React.MouseEvent<HTMLDivElement>) => {
                if (!event.ctrlKey || !onCanvasCtrlClick) return;
                event.preventDefault();

                const rect = event.currentTarget.getBoundingClientRect();
                const clickX = event.clientX - rect.left;
                const clickY = event.clientY - rect.top;
                
                const scale = state.scale || 1;
                const positionX = state.positionX || 0;
                const positionY = state.positionY || 0;
                
                const viewportLeft = -positionX / scale;
                const viewportTop = -positionY / scale;
                const viewportWidth = rect.width / scale;
                const viewportHeight = rect.height / scale;
                
                const x = Math.round(viewportLeft + (clickX / rect.width) * viewportWidth);
                const y = Math.round(viewportTop + (clickY / rect.height) * viewportHeight);
                
                if (x >= 0 && y >= 0 && x <= 6000 && y <= 6000) {
                  onCanvasCtrlClick({ x, y });
                }
              };

              // Função para imagens normais
              const handleImageRightClick = (event: React.MouseEvent<HTMLDivElement>) => {
                event.preventDefault();
                if (!onRightClick || !imageDimensions) return;

                const rect = event.currentTarget.getBoundingClientRect();
                const clickX = event.clientX - rect.left;
                const clickY = event.clientY - rect.top;
                
                const x = (clickX / rect.width) * imageDimensions.width;
                const y = (clickY / rect.height) * imageDimensions.height;
                
                onRightClick({ x: Math.round(x), y: Math.round(y) });
              };

              const handleImageLeftClick = (event: React.MouseEvent<HTMLDivElement>) => {
                if (!event.ctrlKey || !onCanvasCtrlClick || !imageDimensions) return;
                event.preventDefault();

                const rect = event.currentTarget.getBoundingClientRect();
                const clickX = event.clientX - rect.left;
                const clickY = event.clientY - rect.top;
                
                const x = (clickX / rect.width) * imageDimensions.width;
                const y = (clickY / rect.height) * imageDimensions.height;
                
                onCanvasCtrlClick({ x: Math.round(x), y: Math.round(y) });
              };

              return (
                <TransformComponent
                  wrapperClass="w-full h-full"
                  contentClass={hasImage && !isPDF ? "w-full h-full flex items-center justify-center" : "w-full h-full"}
                >


                  {/* ESTRUTURA CONDICIONAL PRINCIPAL - TRÊS CASOS DISTINTOS */}
                  {!hasImage ? (
                    // === CASO 1: QUADRO BRANCO (6000x6000px) - APENAS quando não há imagem ===
                    <div 
                      ref={canvasLayerRef}
                      className={`relative ${isDragging ? 'cursor-grabbing' : 'cursor-crosshair'}`}
                      onContextMenu={handleQuadroBrancoRightClick}
                      onClick={handleQuadroBrancoLeftClick}
                      onDrop={handleDrop}
                      onDragOver={(e) => e.preventDefault()}
                      onMouseMove={handleMouseMove}
                      onMouseUp={handleMouseUp}
                      onMouseLeave={handleMouseUp}
                      style={{
                        width: '6000px',
                        height: '6000px',
                        backgroundColor: 'white',
                        border: '1px solid #e5e7eb',
                        position: 'relative'
                      }}
                    >
                      {/* Loading de upload */}
                      {loadingUpload && (
                        <div className="absolute inset-0 flex items-center justify-center bg-white bg-opacity-90 z-10">
                          <div className="flex flex-col items-center space-y-2">
                            <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
                            <span className="text-sm text-gray-600">Fazendo upload da planta...</span>
                          </div>
                        </div>
                      )}

                      {/* PDF loading */}
                      {isPDF && pdfLoading && (
                        <div className="absolute inset-0 flex items-center justify-center bg-white bg-opacity-90 z-10">
                          <div className="flex flex-col items-center space-y-2">
                            <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
                            <span className="text-sm text-gray-600">Carregando PDF...</span>
                          </div>
                        </div>
                      )}
                      

                      

                      
                      {/* Mensagem para quadro branco vazio */}
                      {!loadingUpload && (
                        <div className="absolute inset-0 flex items-center justify-center">
                          <div className="text-center text-gray-400">
                            <Upload className="h-12 w-12 mx-auto mb-2" />
                            <p className="text-sm">Clique direito para adicionar postes</p>
                          </div>
                        </div>
                      )}
                      
                      {/* Postes do banco de dados - Para quadro branco vazio */}
                      {/* Pontos capturados para colagem */}
                      {capturedPastePoints.map((point, index) => (
                        <div
                          key={`paste-point-${index}-${point.x}-${point.y}`}
                          className="absolute rounded-full bg-blue-500 border border-white shadow-sm"
                          style={{
                            left: `${point.x - 4}px`,
                            top: `${point.y - 4}px`,
                            width: '8px',
                            height: '8px',
                            zIndex: 40
                          }}
                        />
                      ))}
                      
                      {/* LINHAS DE CONEXÃO DO ENGINEER PORTAL - pointer-events só quando há onDeleteConnection (Portal) */}
                      <svg
                        style={{
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          width: '6000px',
                          height: '6000px',
                          pointerEvents: onDeleteConnection ? 'auto' : 'none',
                          zIndex: 35
                        }}
                      >
                        {postConnections.map((connection) => renderNetworkConnection(connection))}
                      </svg>
                      
                      {budgetDetails?.posts?.map((post) => {
                        const coords = getPostCoordinates(post);
                        const postWithStatus = post as BudgetPostDetail & { status?: string };
                        return (
                          <PostIcon
                            key={post.id}
                            id={post.id}
                            name={hidePostNames ? '' : getPostDisplayName(post)}
                            x={coords.x}  // USAR PIXELS DIRETOS
                            y={coords.y}  // USAR PIXELS DIRETOS
                            isSelected={selectedPostDetail?.id === post.id || (connectionMode && connectionStart === post.id)}
                            isCompleted={postIconAlwaysGreen || postWithStatus.status === 'Concluído'}
                            onLeftClick={(e) => {
                              e.stopPropagation();
                              
                              // Lógica para modo de conexão
                              if (connectionMode) {
                                if (!connectionStart) {
                                  // Primeiro clique - selecionar poste inicial
                                  setConnectionStart(post.id);
                                } else {
                                  // Segundo clique - criar conexão
                                  handleCreateConnection(connectionStart, post.id);
                                }
                                return;
                              }
                              
                              // Lógica normal para edição/seleção
                              if (onPostDetailClick) {
                                onPostDetailClick(post);
                                return;
                              }
                              onEditPost?.(post);
                            }}
                            onContextMenu={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              _onDeletePoste(post.id);
                            }}
                            onDragStart={(e) => handlePostDragStart(post.id, e)}
                            isDragging={isDragging && draggedPostId === post.id}
                          />
                        );
                      })}
                    </div>
                  ) : isPDF ? (
                    // === CASO 2: PDF SIMPLES ===
                    <div 
                      className="relative"
                      style={{
                        width: '6000px',
                        height: '6000px',
                        backgroundColor: 'white',
                        border: '1px solid #e5e7eb',
                        position: 'relative'
                      }}
                    >
                      {/* PDF loading */}
                      {pdfLoading && (
                        <div className="absolute inset-0 flex items-center justify-center bg-white bg-opacity-90 z-10">
                          <div className="flex flex-col items-center space-y-2">
                            <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
                            <span className="text-sm text-gray-600">Carregando PDF...</span>
                          </div>
                        </div>
                      )}
                      
                      {/* PDF renderizado no centro */}
                      {showPdfLayer && (
                        <div
                          style={{
                            position: 'absolute',
                            top: '3000px',
                            left: '3000px',
                            transform: 'translate(-50%, -50%)',
                            display: 'flex',
                            justifyContent: 'center',
                            alignItems: 'center',
                            zIndex: 10,
                            pointerEvents: 'none'
                          }}
                        >
                          <div 
                            style={{
                              backgroundColor: (budgetDetails?.render_version || 1) === 2 ? 'transparent' : '#f8f9fa',
                              padding: (budgetDetails?.render_version || 1) === 2 ? '0' : '20px',
                              borderRadius: (budgetDetails?.render_version || 1) === 2 ? '0' : '8px',
                              border: (budgetDetails?.render_version || 1) === 2 ? 'none' : '2px solid #dee2e6',
                              pointerEvents: 'none'
                          }}
                        >
                          <Document
                            file={orcamento.imagemPlanta}
                              onLoadSuccess={onDocumentLoadSuccess}
                              onLoadError={onDocumentLoadError}
                              loading={
                                <div className="flex items-center justify-center p-8 text-blue-600 bg-white rounded">
                                  <Loader2 className="h-8 w-8 animate-spin mr-3" />
                                  <span className="text-lg">Carregando PDF...</span>
                                </div>
                              }
                            error={
                                <div className="text-center text-red-600 p-8 bg-red-50 rounded border-2 border-red-200">
                                  <p className="font-medium text-lg">Erro ao carregar PDF</p>
                                  <p className="text-sm mt-2">Verifique se o arquivo é válido</p>
                              </div>
                            }
                          >
                              {numPages && (
                                <div className="bg-white" style={{ pointerEvents: 'none' }}>
                            <Page
                              pageNumber={pageNumber}
                              renderTextLayer={false}
                              renderAnnotationLayer={false}
                                    onLoadSuccess={onPageLoadSuccess as any}
                              onLoadError={() => setPdfLoading(false)}
                                    width={imageDimensions?.width || 1200}
                              renderMode="canvas"
                                    className={(budgetDetails?.render_version || 1) === 2 ? "" : "shadow-xl border-2 border-gray-300"}
                            />
                                </div>
                              )}
                          </Document>
                          </div>
                        </div>
                      )}
                      
                      {/* CAMADA TRANSPARENTE 6000x6000 para capturar cliques - NA FRENTE DE TUDO */}
                      <div 
                        ref={canvasLayerRef}
                        className={`absolute top-0 left-0 ${isDragging ? 'cursor-grabbing' : 'cursor-crosshair'}`}
                        onContextMenu={(e) => {
                          e.preventDefault();

                          const clickX = e.nativeEvent.offsetX;
                          const clickY = e.nativeEvent.offsetY;
                          
                          if (onRightClick) {
                            onRightClick({ x: clickX, y: clickY });
                          }
                        }}
                        onClick={(e) => {
                          if (!e.ctrlKey || !onCanvasCtrlClick) return;
                          e.preventDefault();

                          const clickX = e.nativeEvent.offsetX;
                          const clickY = e.nativeEvent.offsetY;
                          
                          onCanvasCtrlClick({ x: Math.round(clickX), y: Math.round(clickY) });
                        }}
                        onDrop={handleDrop}
                        onDragOver={(e) => e.preventDefault()}
                        onMouseMove={handleMouseMove}
                        onMouseUp={handleMouseUp}
                        onMouseLeave={handleMouseUp}
                        style={{
                          width: '6000px',
                          height: '6000px',
                          backgroundColor: 'transparent',
                          zIndex: 100,
                          position: 'absolute'
                        }}
                      >
                        {/* Postes renderizados na camada transparente */}
                      {/* Pontos capturados para colagem */}
                      {capturedPastePoints.map((point, index) => (
                        <div
                          key={`paste-point-${index}-${point.x}-${point.y}`}
                          className="absolute rounded-full bg-blue-500 border border-white shadow-sm"
                          style={{
                            left: `${point.x - 4}px`,
                            top: `${point.y - 4}px`,
                            width: '8px',
                            height: '8px',
                            zIndex: 40
                          }}
                        />
                      ))}
                      
                      {/* LINHAS DE CONEXÃO DO ENGINEER PORTAL - pointer-events só quando há onDeleteConnection (Portal) */}
                      <svg
                        style={{
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          width: '6000px',
                          height: '6000px',
                          pointerEvents: onDeleteConnection ? 'auto' : 'none',
                          zIndex: 35
                        }}
                      >
                        {postConnections.map((connection) => renderNetworkConnection(connection))}
                      </svg>
                      
                      {budgetDetails?.posts?.map((post) => {
                          const coords = getPostCoordinates(post);
                          const postWithStatus = post as BudgetPostDetail & { status?: string };
                          return (
                          <PostIcon
                            key={post.id}
                            id={post.id}
                            name={hidePostNames ? '' : getPostDisplayName(post)}
                            x={coords.x}
                            y={coords.y}
                            isSelected={selectedPostDetail?.id === post.id}
                            isCompleted={postIconAlwaysGreen || postWithStatus.status === 'Concluído'}
                            onLeftClick={(e) => {
                              e.stopPropagation();
                              if (onPostDetailClick) {
                                onPostDetailClick(post);
                                return;
                              }
                              onEditPost?.(post);
                            }}
                            onContextMenu={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              _onDeletePoste(post.id);
                            }}
                            onDragStart={(e) => handlePostDragStart(post.id, e)}
                            isDragging={isDragging && draggedPostId === post.id}
                          />
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    // === CASO 3: IMAGEM NORMAL (LÓGICA ORIGINAL - SEM QUADRO BRANCO) ===
                    <div 
                      ref={canvasLayerRef}
                      className={`relative flex items-center justify-center ${isDragging ? 'cursor-grabbing' : 'cursor-crosshair'}`}
                      onClick={(e) => {
                        handleCanvasClick(e);
                        handleImageLeftClick(e);
                      }}
                      onContextMenu={handleImageRightClick}
                      onDrop={handleDrop}
                      onDragOver={(e) => e.preventDefault()}
                      onMouseMove={handleMouseMove}
                      onMouseUp={handleMouseUp}
                      onMouseLeave={handleMouseUp}
                      style={{
                        width: '100%',
                        height: '100%',
                        minWidth: imageDimensions?.width ?? 'auto',
                        minHeight: imageDimensions?.height ?? 'auto'
                      }}
                    >
                      {/* Loading de imagem normal */}
                      {imageLoading && (
                        <div className="absolute inset-0 flex items-center justify-center bg-white bg-opacity-90 z-10">
                          <div className="flex flex-col items-center space-y-2">
                            <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
                            <span className="text-sm text-gray-600">Carregando imagem...</span>
                          </div>
                        </div>
                      )}
                      

                      
                      {/* Imagem centralizada */}
                      {imageDimensions && !imageLoading && (
                      <div
                        style={{
                            width: imageDimensions.width,
                            height: imageDimensions.height,
                          backgroundImage: `url(${orcamento.imagemPlanta})`,
                          backgroundSize: 'contain',
                          backgroundRepeat: 'no-repeat',
                          backgroundPosition: 'center',
                            border: '2px solid #ccc',
                            borderRadius: '8px'
                          }}
                        />
                      )}
                      {/* Postes do banco de dados - Imagem Normal */}
                      {/* Pontos capturados para colagem */}
                      {capturedPastePoints.map((point, index) => (
                        <div
                          key={`paste-point-${index}-${point.x}-${point.y}`}
                          className="absolute rounded-full bg-blue-500 border border-white shadow-sm"
                          style={{
                            left: `${point.x - 4}px`,
                            top: `${point.y - 4}px`,
                            width: '8px',
                            height: '8px',
                            zIndex: 40
                          }}
                        />
                      ))}
                      
                      {/* LINHAS DE CONEXÃO DO ENGINEER PORTAL - Para imagens dimensionadas */}
                      {imageDimensions && (
                        <svg 
                          style={{ 
                            position: 'absolute', 
                            top: 0, 
                            left: 0, 
                            width: imageDimensions.width, 
                            height: imageDimensions.height, 
                            pointerEvents: onDeleteConnection ? 'auto' : 'none',
                            zIndex: 35
                          }}
                        >
                          {postConnections.map((connection) => renderNetworkConnection(connection))}
                        </svg>
                      )}
                      
                      {budgetDetails?.posts?.map((post) => {
                        const coords = getPostCoordinates(post);
                        const postWithStatus = post as BudgetPostDetail & { status?: string };
                        return (
                          <PostIcon
                            key={post.id}
                            id={post.id}
                            name={hidePostNames ? '' : getPostDisplayName(post)}
                            x={coords.x}
                            y={coords.y}
                            isSelected={selectedPostDetail?.id === post.id}
                            isCompleted={postIconAlwaysGreen || postWithStatus.status === 'Concluído'}
                            onLeftClick={(e) => {
                              e.stopPropagation();
                              if (onPostDetailClick) {
                                onPostDetailClick(post);
                                return;
                              }
                              onEditPost?.(post);
                            }}
                            onContextMenu={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              _onDeletePoste(post.id);
                            }}
                            onDragStart={(e) => handlePostDragStart(post.id, e)}
                            isDragging={isDragging && draggedPostId === post.id}
                          />
                        );
                        })}
                    </div>
                  )}
              </TransformComponent>
            );
            }}
          </TransformWrapper>
        </div>
      </div>
    </div>
  );
};

export default CanvasVisual;
