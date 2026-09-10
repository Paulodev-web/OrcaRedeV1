"use client";

import { memo } from 'react';
import type { WorkProjectPost } from '@/types/works';
import type { ExecutedSpan } from '@/services/works/getWorkExecutionOverlay';
import { calculateBezierPath } from '@/lib/canvas/connectionPath';

interface Props {
  span: ExecutedSpan;
  fromPost: WorkProjectPost;
  toPost: WorkProjectPost;
}

/**
 * O cabo que já foi lançado.
 *
 * O vão previsto é tracejado e translúcido (WorkConnectionLine). Este é cheio e
 * opaco, e desenha por cima. A diferença é de FORMA, não só de cor: o
 * engenheiro precisa distinguir os dois numa planta cheia, às vezes num
 * monitor ruim, e cor sozinha não resolve isso para quem não distingue verde de
 * cinza.
 */
export const WorkExecutedSpanLine = memo(function WorkExecutedSpanLine({
  span,
  fromPost,
  toPost,
}: Props) {
  const pathD = calculateBezierPath(
    { x: fromPost.xCoord, y: fromPost.yCoord },
    { x: toPost.xCoord, y: toPost.yCoord },
    span.category === 'MT' ? 'green' : 'blue',
    span.fromPostId ?? fromPost.id,
    span.toPostId ?? toPost.id,
  );

  return (
    <path
      d={pathD}
      stroke="#357d49"
      strokeWidth={7}
      strokeLinecap="round"
      fill="none"
      style={{ pointerEvents: 'none' }}
      aria-hidden="true"
    />
  );
});
