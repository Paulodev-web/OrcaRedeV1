'use client';

import type { ReactNode } from 'react';
import { useDroppable } from '@dnd-kit/react';
import { cn } from '@/lib/utils';
import { dropZoneId } from './dashboardDnd';

interface FolderDropZoneProps {
  /** Distingue duas zonas que apontam para a mesma pasta (cartão, breadcrumb…). */
  zone: string;
  folderId: string | null;
  /** O item em arrasto pode cair aqui? Calculado por quem monta a zona. */
  valid: boolean;
  className?: string;
  activeClassName?: string;
  invalidClassName?: string;
  children: ReactNode | ((state: { isOver: boolean; valid: boolean }) => ReactNode);
}

/**
 * Área que aceita um orçamento ou pasta arrastado.
 *
 * Existe como componente (e não como um punhado de `onDragOver`/`onDrop` no
 * JSX do Dashboard) porque `useDroppable` é um hook: precisa de um componente
 * por zona. Em troca, some o par `handleDragOver`/`handleDragLeave` com o
 * `setTimeout` de 50 ms que existia para contornar o flicker do
 * `dragleave` nativo ao passar por cima de um elemento filho.
 */
export function FolderDropZone({
  zone,
  folderId,
  valid,
  className,
  activeClassName,
  invalidClassName,
  children,
}: FolderDropZoneProps) {
  const { ref, isDropTarget } = useDroppable({
    id: dropZoneId(zone, folderId),
    type: 'folder-zone',
    accept: 'item',
  });

  return (
    <div
      ref={ref}
      className={cn(
        'transition-[background-color,box-shadow,border-color] duration-150',
        className,
        isDropTarget && valid && activeClassName,
        isDropTarget && !valid && invalidClassName,
      )}
    >
      {typeof children === 'function' ? children({ isOver: isDropTarget, valid }) : children}
    </div>
  );
}
