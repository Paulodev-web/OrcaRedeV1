import { pdfjs } from 'react-pdf';
import { calculatePlanFrame } from './planFrame';

export type { RasterImageDimensions } from './rasterPlanGeometry';
export { calculatePlanFrame, buildPlanGeometry } from './planFrame';
export type { PlanFrame, PlanGeometry } from './planFrame';
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
  // Uma implementacao so, compartilhada com a Server Action de importacao e,
  // via `plan_geometry`, com o APK. Ver `planFrame.ts`.
  const frame = calculatePlanFrame(viewportWidth, viewportHeight, renderVersion);
  return { scale: frame.scale, width: frame.width, height: frame.height };
}

/**
 * Indica se o PDF esta sendo renderizado em alta resolucao (V2).
 * Util para variar estilos (sem padding, sem sombra) entre as versoes.
 */
export function isHighResRender(renderVersion: number | null | undefined): boolean {
  return renderVersion === 2;
}
