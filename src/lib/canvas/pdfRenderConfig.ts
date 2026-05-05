import { pdfjs } from 'react-pdf';
import { CANVAS_SIZE, CANVAS_CENTER, IMAGE_MAX_W, IMAGE_MAX_H } from './canvasTokens';

/**
 * Worker do pdfjs servido via CDN com a versao instalada do pacote.
 * Mantido identico a configuracao em `src/components/CanvasVisual.tsx`
 * (linha 14) para evitar regressoes na renderizacao de PDFs existentes.
 */
export const PDF_WORKER_SRC = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

/** Configura o worker globalmente. Idempotente; pode ser chamado mais de uma vez. */
export function configurePdfWorker(): void {
  if (pdfjs.GlobalWorkerOptions.workerSrc !== PDF_WORKER_SRC) {
    pdfjs.GlobalWorkerOptions.workerSrc = PDF_WORKER_SRC;
  }
}

export interface PdfPageDimensions {
  width: number;
  height: number;
  scale: number;
}

/**
 * Calcula as dimensoes finais (em pixels logicos no quadro 6000x6000) para
 * renderizar uma pagina de PDF, replicando a logica de `onPageLoadSuccess`
 * em CanvasVisual.tsx (linhas 303-340).
 *
 * - V2 (renderVersion === 2): largura alvo 6000px, altura proporcional.
 *   Orcamentos modernos sao renderizados nativamente em alta resolucao.
 * - V1 (default / legado): scale clamped entre 2 e 4, baseado em
 *   1200 / max(viewport).
 */
export function calculatePdfPageDimensions(
  viewportWidth: number,
  viewportHeight: number,
  renderVersion: number | null | undefined,
): PdfPageDimensions {
  if (renderVersion === 2) {
    const scale = CANVAS_SIZE / viewportWidth;
    return {
      scale,
      width: CANVAS_SIZE,
      height: viewportHeight * scale,
    };
  }
  const minScale = 2;
  const maxScale = 4;
  const scale = Math.max(
    minScale,
    Math.min(maxScale, 1200 / Math.max(viewportWidth, viewportHeight)),
  );
  return {
    scale,
    width: viewportWidth * scale,
    height: viewportHeight * scale,
  };
}

/**
 * Indica se o PDF esta sendo renderizado em alta resolucao (V2).
 * Util para variar estilos (sem padding, sem sombra) entre as versoes.
 */
export function isHighResRender(renderVersion: number | null | undefined): boolean {
  return renderVersion === 2;
}

export interface RasterImageDimensions {
  width: number;
  height: number;
}

/**
 * Calcula as dimensoes de renderizacao de uma imagem raster no quadro
 * 6000x6000, replicando o pipeline do CanvasVisual para imagens:
 *   1. Fit-to-box com IMAGE_MAX_W x IMAGE_MAX_H (aspecto mantido)
 *   2. Scale up para caber na largura/altura do CANVAS_SIZE ("contain")
 *
 * Usado no import (normalizar coordenadas dos postes) e no WorkCanvas
 * (renderizar a imagem de fundo com as mesmas dimensoes).
 */
export function calculateRasterImageDimensions(
  naturalWidth: number,
  naturalHeight: number,
): RasterImageDimensions {
  const aspectRatio = naturalWidth / naturalHeight;
  let displayWidth: number;
  let displayHeight: number;

  if (aspectRatio > IMAGE_MAX_W / IMAGE_MAX_H) {
    displayWidth = IMAGE_MAX_W;
    displayHeight = IMAGE_MAX_W / aspectRatio;
  } else {
    displayHeight = IMAGE_MAX_H;
    displayWidth = IMAGE_MAX_H * aspectRatio;
  }

  const scale = Math.min(
    CANVAS_SIZE / displayWidth,
    CANVAS_SIZE / displayHeight,
  );
  return {
    width: Math.round(displayWidth * scale),
    height: Math.round(displayHeight * scale),
  };
}

/**
 * Calcula a transformacao de coordenadas de postes do espaco do
 * CanvasVisual (imagem raster, max 1200x800) para o espaco do
 * WorkCanvas (quadro 6000x6000, imagem centralizada).
 *
 * Retorna scale uniforme + offsets (x, y) para translate + scale
 * dos pontos.
 */
export function computeRasterCoordTransform(
  naturalWidth: number,
  naturalHeight: number,
): { scale: number; offsetX: number; offsetY: number } {
  const dims = calculateRasterImageDimensions(naturalWidth, naturalHeight);
  const aspectRatio = naturalWidth / naturalHeight;

  let displayWidth: number;
  if (aspectRatio > IMAGE_MAX_W / IMAGE_MAX_H) {
    displayWidth = IMAGE_MAX_W;
  } else {
    displayWidth = IMAGE_MAX_H * aspectRatio;
  }

  const scale = dims.width / displayWidth;
  return {
    scale,
    offsetX: CANVAS_CENTER - dims.width / 2,
    offsetY: CANVAS_CENTER - dims.height / 2,
  };
}
