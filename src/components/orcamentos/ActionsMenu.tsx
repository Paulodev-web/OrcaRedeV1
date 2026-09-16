'use client';

import type { ReactNode } from 'react';
import { Folder, Home } from 'lucide-react';

export interface MoveTarget {
  id: string | null;
  name: string;
  color?: string;
}

/**
 * Dropdown de ações compartilhado pelo cartão e pela linha.
 *
 * Card e Row mostram exatamente o mesmo menu — deixar o JSX duplicado nos dois
 * significaria que toda ação nova precisa ser adicionada em dois lugares, e a
 * primeira vez que alguém esquecer um deles as duas views divergem sem que
 * nada quebre visivelmente.
 */
export function ActionsMenu({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  return (
    <>
      {/* Captura o clique fora para fechar, sem depender de listener global. */}
      <div className="fixed inset-0 z-20" onClick={onClose} />

      <div className="absolute right-0 top-10 z-30 w-60 overflow-hidden rounded-xl border border-gray-100 bg-surface py-1.5 shadow-xl ring-1 ring-black/5 duration-100 animate-in fade-in-0 zoom-in-95">
        {children}
      </div>
    </>
  );
}

export function ActionsMenuItem({
  onClick,
  icon,
  label,
  disabled,
  tone = 'default',
}: {
  onClick: () => void;
  icon: ReactNode;
  label: string;
  disabled?: boolean;
  tone?: 'default' | 'accent' | 'danger';
}) {
  const toneClass =
    tone === 'danger'
      ? 'text-red-600 hover:bg-red-50'
      : tone === 'accent'
        ? 'text-neutral-900 hover:bg-accent-500/10'
        : 'text-gray-700 hover:bg-gray-50';

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`mx-1 flex w-[calc(100%-8px)] items-center space-x-2.5 rounded-lg px-3 py-2 text-left text-sm disabled:opacity-50 ${toneClass}`}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

export function ActionsMenuSeparator() {
  return <div className="my-1 border-t border-gray-100" />;
}

/** Lista de pastas de destino do submenu "Mover para pasta…". */
export function MoveTargetList({
  targets,
  onMoveTo,
}: {
  targets: MoveTarget[];
  onMoveTo: (targetFolderId: string | null) => void;
}) {
  return (
    <div className="mx-1 mb-1 max-h-40 overflow-y-auto rounded-lg bg-gray-50">
      {targets.map((target) => (
        <button
          key={String(target.id)}
          onClick={() => onMoveTo(target.id)}
          className="flex w-full items-center space-x-2 rounded-lg px-3 py-1.5 text-left text-sm text-gray-600 hover:bg-gray-100"
        >
          {target.id === null ? (
            <Home className="h-3.5 w-3.5" />
          ) : (
            <Folder className="h-3.5 w-3.5" style={{ color: target.color || '#6B7280' }} />
          )}
          <span className="truncate">{target.name}</span>
        </button>
      ))}
    </div>
  );
}
