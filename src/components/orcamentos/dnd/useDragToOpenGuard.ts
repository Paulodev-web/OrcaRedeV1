'use client';

import { useCallback, useRef } from 'react';
import { DRAG_ACTIVATION_DISTANCE } from '@/lib/dnd/sensors';

/**
 * Impede que soltar um card depois de arrastá-lo conte como clique.
 *
 * O código anterior resolvia isso com um `useState('isClick')` por cartão,
 * ligado em `onMouseDown` e desligado em `onDragStart` — o que só funcionava
 * porque o HTML5 dispara `dragstart` antes do `click`. Com um motor baseado em
 * ponteiro não há esse evento, então a pergunta certa é geométrica: o ponteiro
 * andou o suficiente para ter sido um arrasto?
 */
export function useDragToOpenGuard(
  onOpen: () => void,
  threshold = DRAG_ACTIVATION_DISTANCE,
) {
  const downAt = useRef<{ x: number; y: number } | null>(null);

  const onPointerDown = useCallback((event: React.PointerEvent) => {
    downAt.current = { x: event.clientX, y: event.clientY };
  }, []);

  const onPointerUp = useCallback(
    (event: React.PointerEvent) => {
      const start = downAt.current;
      downAt.current = null;
      if (!start) return;
      // Clique em botão/menu dentro do cartão não abre o item.
      if ((event.target as HTMLElement).closest('[data-no-open]')) return;
      if (Math.hypot(event.clientX - start.x, event.clientY - start.y) < threshold) onOpen();
    },
    [onOpen, threshold],
  );

  return { onPointerDown, onPointerUp };
}
