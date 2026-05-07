import { CANVAS_SIZE } from './canvasTokens';

export interface Point {
  x: number;
  y: number;
}

/**
 * Limita um valor numerico ao intervalo [0, CANVAS_SIZE].
 * Usado apenas para renderizacao defensiva: o valor original no banco
 * permanece preservado.
 */
export function clampToCanvas(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(CANVAS_SIZE, value));
}

/** Retorna true se as coordenadas estao dentro do quadro logico. */
export function isValidCoordinate(x: number, y: number): boolean {
  return (
    Number.isFinite(x) &&
    Number.isFinite(y) &&
    x >= 0 &&
    x <= CANVAS_SIZE &&
    y >= 0 &&
    y <= CANVAS_SIZE
  );
}

/**
 * Retorna {x, y} ja clampado. Em desenvolvimento emite um console.warn quando
 * o valor original estiver fora do intervalo, para facilitar diagnostico de
 * dados legados.
 */
export function clampPoint(point: Point, label?: string): Point {
  const x = clampToCanvas(point.x);
  const y = clampToCanvas(point.y);
  if (
    process.env.NODE_ENV !== 'production' &&
    (x !== point.x || y !== point.y)
  ) {
    console.warn(
      `[canvas] coordenada fora do quadro 0..${CANVAS_SIZE}` +
        (label ? ` (${label})` : '') +
        ` original=(${point.x},${point.y}) clampada=(${x},${y})`,
    );
  }
  return { x, y };
}
