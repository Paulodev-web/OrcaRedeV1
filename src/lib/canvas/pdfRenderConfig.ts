import { pdfjs } from 'react-pdf';
import { CANVAS_SIZE } from './canvasTokens';

export type { RasterImageDimensions } from './rasterPlanGeometry';
export {
  calculateRasterImageDimensions,
  computeRasterCoordTransform,
} from './rasterPlanGeometry';

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
