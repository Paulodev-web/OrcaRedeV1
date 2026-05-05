/**
 * Geometria da planta raster no quadro 6000x6000 — sem dependência de react-pdf.
 * Usado em Server Actions (`createWorkFromBudget`) e no cliente (`WorkCanvas`).
 */
import { CANVAS_SIZE, CANVAS_CENTER, IMAGE_MAX_W, IMAGE_MAX_H } from './canvasTokens';

export interface RasterImageDimensions {
  width: number;
  height: number;
}

/**
 * Calcula as dimensoes de renderizacao de uma imagem raster no quadro
 * 6000x6000, replicando o pipeline do CanvasVisual para imagens:
 *   1. Fit-to-box com IMAGE_MAX_W x IMAGE_MAX_H (aspecto mantido)
 *   2. Scale up para caber na largura/altura do CANVAS_SIZE ("contain")
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
 * Transformacao de coordenadas de postes do espaco do CanvasVisual (imagem raster)
 * para o espaco do WorkCanvas (quadro 6000x6000, imagem centralizada).
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
