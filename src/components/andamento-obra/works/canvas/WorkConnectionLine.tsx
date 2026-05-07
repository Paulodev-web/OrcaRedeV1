"use client";

import { memo } from 'react';
import type { WorkProjectConnection, WorkProjectPost } from '@/types/works';
import {
  calculateBezierPath,
  strokeForColor,
} from '@/lib/canvas/connectionPath';

interface WorkConnectionLineProps {
  connection: WorkProjectConnection;
  fromPost: WorkProjectPost;
  toPost: WorkProjectPost;
}

/**
 * Renderiza uma conexao planejada como elemento <path> de um SVG pai.
 *
 * Estilo "camada de projeto" (read-only):
 *   - cor original (azul para BT, verde para MT) com opacidade reduzida (0.4)
 *   - traco fino (stroke-width 4) com tracejado discreto
 *   - sem area de clique extra (read-only, sem onContextMenu para deletar)
 *
 * Self-loops (from === to) sao filtrados pelo WorkCanvas antes de chegar
 * aqui (decisao do plano, secao J - skip silencioso).
 */
export const WorkConnectionLine = memo(function WorkConnectionLine({
  connection,
  fromPost,
  toPost,
}: WorkConnectionLineProps) {
  const pathD = calculateBezierPath(
    { x: fromPost.xCoord, y: fromPost.yCoord },
    { x: toPost.xCoord, y: toPost.yCoord },
    connection.color,
    connection.fromPostId,
    connection.toPostId,
  );
  const stroke = strokeForColor(connection.color);

  return (
    <path
      d={pathD}
      stroke={stroke}
      strokeWidth={4}
      strokeLinecap="round"
      strokeDasharray="12 6"
      fill="none"
      opacity={0.4}
      style={{ pointerEvents: 'none' }}
      aria-hidden="true"
    />
  );
});
