"use client";

import { useState } from 'react';
import { CheckSquare, Layers, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import { useWorkSegments } from './WorkSegmentsProvider';

/**
 * Barra de marcação de segmento em lote da Lista de Postes.
 *
 * A divisão que o campo pede é geográfica ("deste trecho para cá é
 * subterrâneo"), então marcar poste a poste num dropdown é inviável: uma obra
 * de 149 postes viraria 149 decisões, e foi exatamente onde o uso morreu.
 *
 * A seleção conversa com a busca da lista — filtrar "ip" e clicar em
 * "selecionar os N da busca" marca todos os pontos de iluminação de uma vez.
 *
 * Renderiza `null` fora do `WorkSegmentsProvider`, como os outros campos de
 * segmento, o que mantém o OrçaRede legado sem novidade nenhuma.
 */
export function BulkSegmentBar({
  selectedIds,
  filteredCount,
  onSelectAllFiltered,
  onClear,
}: {
  selectedIds: string[];
  /** Quantos postes a busca está mostrando agora. */
  filteredCount: number;
  onSelectAllFiltered: () => void;
  onClear: () => void;
}) {
  const store = useWorkSegments();
  const [pendingSegmentId, setPendingSegmentId] = useState('');

  if (!store || store.segments.length === 0) return null;

  const { segments, updatePostsSegment, isBulkSaving } = store;
  const total = selectedIds.length;

  const aplicar = async (segmentId: string | null, rotulo: string) => {
    const gravados = await updatePostsSegment(selectedIds, segmentId);
    if (gravados === 0) return;

    toast.success(
      `${gravados} ${gravados === 1 ? 'poste marcado' : 'postes marcados'} como ${rotulo}.`
    );
    setPendingSegmentId('');
    onClear();
  };

  if (total === 0) {
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-gray-300 bg-gray-50 px-3 py-2 text-xs text-gray-600">
        <Layers className="h-3.5 w-3.5 shrink-0 text-blue-600" />
        <span>
          Marque as caixas para aplicar o segmento a vários postes de uma vez.
        </span>
        {filteredCount > 0 ? (
          <button
            type="button"
            onClick={onSelectAllFiltered}
            className="inline-flex items-center gap-1 font-medium text-blue-600 hover:text-blue-800"
          >
            <CheckSquare className="h-3.5 w-3.5" />
            Selecionar os {filteredCount} da lista
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2">
      <Layers className="h-4 w-4 shrink-0 text-blue-600" />
      <span className="text-sm font-medium text-gray-800">
        {total} {total === 1 ? 'poste selecionado' : 'postes selecionados'}
      </span>

      {total < filteredCount ? (
        <button
          type="button"
          onClick={onSelectAllFiltered}
          disabled={isBulkSaving}
          className="text-xs font-medium text-blue-600 hover:text-blue-800 disabled:opacity-50"
        >
          selecionar os {filteredCount} da lista
        </button>
      ) : null}

      <span className="ml-auto flex flex-wrap items-center gap-2">
        <select
          value={pendingSegmentId}
          disabled={isBulkSaving}
          onChange={(event) => {
            const value = event.target.value;
            setPendingSegmentId(value);
            if (!value) return;
            const segmento = segments.find((item) => item.id === value);
            void aplicar(value, segmento?.name ?? 'segmento');
          }}
          className="rounded-md border border-gray-300 bg-surface px-2 py-1 text-xs text-gray-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-60"
        >
          <option value="">Aplicar segmento…</option>
          {segments.map((segment) => (
            <option key={segment.id} value={segment.id}>
              {segment.name}
            </option>
          ))}
        </select>

        <button
          type="button"
          onClick={() => void aplicar(null, 'não segmentado')}
          disabled={isBulkSaving}
          className="rounded-md border border-gray-300 bg-surface px-2 py-1 text-xs text-gray-600 hover:bg-gray-100 disabled:opacity-50"
          title="Tirar o segmento dos postes selecionados"
        >
          Limpar segmento
        </button>

        {isBulkSaving ? <Loader2 className="h-4 w-4 animate-spin text-blue-600" /> : null}

        <button
          type="button"
          onClick={onClear}
          disabled={isBulkSaving}
          className="rounded-md p-1 text-gray-500 hover:bg-blue-100 hover:text-gray-800 disabled:opacity-50"
          title="Cancelar seleção"
        >
          <X className="h-4 w-4" />
        </button>
      </span>
    </div>
  );
}
