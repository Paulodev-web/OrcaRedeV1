import { POST_CENTER_OFFSET } from './canvasTokens';
import type { Point } from './coordinates';

export type ConnectionColor = 'blue' | 'green' | null;

/**
 * Calcula o atributo `d` de um <path> SVG correspondente a uma conexao
 * entre dois postes.
 *
 * Replica fielmente a logica de `renderNetworkConnection` em
 * `src/components/CanvasVisual.tsx` (linhas 398-436):
 *   - normaliza a direcao usando ordem lexicografica dos ids para garantir
 *     curvatura estavel mesmo se a conexao for invertida no banco;
 *   - aplica POST_CENTER_OFFSET para alinhar com o centro do icone do poste;
 *   - curvatura sutil (Bezier quadratica) com sinal oposto entre redes
 *     azul (BT) e verde (MT).
 *
 * Conexoes self-loop (fromId === toId) ficam degeneradas. O caller deve
 * detectar e pular silenciosamente (decisao do plano J - edge case).
 */
export function calculateBezierPath(
  from: Point,
  to: Point,
  color: ConnectionColor,
  fromId: string,
  toId: string,
): string {
  const isDirectOrder = fromId <= toId;
  const start = isDirectOrder ? from : to;
  const end = isDirectOrder ? to : from;

  const x1 = start.x + POST_CENTER_OFFSET;
  const y1 = start.y + POST_CENTER_OFFSET;
  const x2 = end.x + POST_CENTER_OFFSET;
  const y2 = end.y + POST_CENTER_OFFSET;

  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = Math.hypot(dx, dy) || 1;
  const midX = (x1 + x2) / 2;
  const midY = (y1 + y2) / 2;

  const baseCurve = Math.min(52, Math.max(16, length * 0.1));
  const curveSign = color === 'green' ? 1 : -1;
  const perpX = (-dy / length) * baseCurve * curveSign;
  const perpY = (dx / length) * baseCurve * curveSign;
  const controlX = midX + perpX;
  const controlY = midY + perpY;

  return `M ${x1} ${y1} Q ${controlX} ${controlY} ${x2} ${y2}`;
}

/** Cor base do stroke por tipo de rede. */
export function strokeForColor(color: ConnectionColor): string {
  return color === 'green' ? '#10B981' : '#3B82F6';
}
