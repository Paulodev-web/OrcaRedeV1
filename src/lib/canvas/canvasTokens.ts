/**
 * Constantes visuais compartilhadas entre o canvas legado (CanvasVisual) e o
 * canvas read-only do Andamento de Obra (WorkCanvas).
 *
 * Os valores aqui replicam (intencionalmente) constantes inline do
 * `src/components/CanvasVisual.tsx`. Nesta fase aceita-se a duplicação:
 * o original permanece intocado e o WorkCanvas consome a versão extraída.
 * Consolidação futura é dívida técnica.
 */

/** Tamanho do quadro logico do canvas em pixels (eixo X e Y). */
export const CANVAS_SIZE = 6000;

/** Centro logico do quadro 6000x6000 (usado para centralizar o PDF). */
export const CANVAS_CENTER = CANVAS_SIZE / 2;

/** Largura maxima utilizada ao caber uma imagem normal (nao-PDF) no quadro. */
export const IMAGE_MAX_W = 1200;

/** Altura maxima utilizada ao caber uma imagem normal (nao-PDF) no quadro. */
export const IMAGE_MAX_H = 800;

/** Tamanho em pixels do icone do poste original (CanvasVisual / PostIcon). */
export const POST_ICON_SIZE = 40;

/** Raio em pixels do circulo do marcador de poste planejado (read-only). */
export const POST_MARKER_RADIUS = 12;

/**
 * Offset usado pelo CanvasVisual para "centrar" a curva de uma conexao
 * no icone do poste (icone medio = 30px, offset = 15px).
 * Mantido identico ao original para que coordenadas continuem batendo.
 */
export const POST_CENTER_OFFSET = 15;

/** Posicao inicial do TransformWrapper quando nao ha imagem ou ha PDF. */
export const INITIAL_POSITION_X_PDF = -1000;
export const INITIAL_POSITION_Y_PDF = -1200;

/** Escala inicial padrao do TransformWrapper para PDFs / quadro vazio. */
export const INITIAL_SCALE_PDF = 0.5;
export const MIN_SCALE = 0.1;
export const MAX_SCALE = 5;
