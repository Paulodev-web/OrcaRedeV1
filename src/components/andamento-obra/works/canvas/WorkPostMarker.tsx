"use client";

import { memo } from 'react';
import type { WorkProjectPost } from '@/types/works';
import { POST_ICON_SIZE } from '@/lib/canvas/canvasTokens';

interface WorkPostMarkerProps {
  post: WorkProjectPost;
  selected: boolean;
  onSelect: (post: WorkProjectPost) => void;
}

/**
 * Marcador read-only de um poste planejado no `WorkCanvas`.
 *
 * Versao simplificada do `PostIcon.tsx` legado:
 *   - sem drag, sem context menu, sem modo de conexao
 *   - estilo "planejado" em cinza (opacidade 0.7)
 *   - hover: borda mais escura e opacidade total
 *   - selecionado: ring azul-escuro + opacidade total
 *   - tooltip nativo (`title`) com a numeracao do poste
 *
 * Posicionamento centrado em (x, y) replicando convencao do PostIcon
 * legado: `left = x - SIZE/2`, `top = y - SIZE/2`. Isto garante que as
 * coordenadas do snapshot continuem batendo com as conexoes desenhadas
 * (que usam o mesmo offset interno via `POST_CENTER_OFFSET`).
 *
 * Camada de execucao (Bloco 7): este marcador e' a "ancora visual" -
 * pins coloridos por status serao posicionados no mesmo (x, y) ou com
 * pequeno offset, sobrepostos a este marcador.
 */
export const WorkPostMarker = memo(function WorkPostMarker({
  post,
  selected,
  onSelect,
}: WorkPostMarkerProps) {
  const label = post.numbering?.trim() ? post.numbering : 'Sem numeração';

  return (
    <button
      type="button"
      onClick={() => onSelect(post)}
      title={label}
      aria-label={`Poste ${label}`}
      data-post-id={post.id}
      className={[
        'absolute flex items-center justify-center rounded-full',
        'border-2 transition-all duration-150 ease-out',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1D3140] focus-visible:ring-offset-2',
        selected
          ? 'border-[#1D3140] bg-gray-500 opacity-100 shadow-[0_0_0_4px_rgba(29,49,64,0.18)] scale-110'
          : 'border-gray-500 bg-gray-400 opacity-70 hover:border-gray-700 hover:bg-gray-500 hover:opacity-100 hover:scale-105',
      ].join(' ')}
      style={{
        left: `${post.xCoord - POST_ICON_SIZE / 2}px`,
        top: `${post.yCoord - POST_ICON_SIZE / 2}px`,
        width: `${POST_ICON_SIZE}px`,
        height: `${POST_ICON_SIZE}px`,
        zIndex: selected ? 60 : 50,
      }}
    >
      <span
        className={[
          'rounded-full',
          selected ? 'bg-white' : 'bg-white/85',
        ].join(' ')}
        style={{ width: '10px', height: '10px' }}
        aria-hidden="true"
      />
      {/* Espaco reservado para a camada de execucao (Bloco 7).
          Quando houver work_pole_installations, um pin colorido sera renderizado aqui. */}
    </button>
  );
});
