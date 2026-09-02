"use client";

import { Layers } from 'lucide-react';
import { useWorkSegments } from './WorkSegmentsProvider';

const UNSEGMENTED_VALUE = '';

/**
 * Escolha do segmento no modal de criação do poste.
 *
 * O poste já nasce marcado, em vez de nascer solto e o usuário voltar depois
 * para etiquetar. Como a divisão é geográfica, quem está lançando um trecho
 * cria vários postes seguidos no mesmo segmento, então o campo já vem
 * preenchido com o último escolhido.
 *
 * Renderiza `null` fora do `WorkSegmentsProvider` (OrçaRede legado) e quando
 * não há catálogo cadastrado, como os demais campos de segmento.
 */
export function NewPostSegmentField({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (segmentId: string) => void;
  disabled?: boolean;
}) {
  const store = useWorkSegments();
  if (!store || store.segments.length === 0) return null;

  return (
    <div>
      <label
        htmlFor="postSegment"
        className="mb-1 flex items-center gap-1.5 text-sm font-medium text-gray-700"
      >
        <Layers className="h-4 w-4 text-blue-600" />
        Segmento da obra
      </label>
      <select
        id="postSegment"
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-md border border-gray-300 bg-surface px-3 py-2 text-gray-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60"
      >
        <option value={UNSEGMENTED_VALUE}>Não segmentado</option>
        {store.segments.map((segment) => (
          <option key={segment.id} value={segment.id}>
            {segment.name}
          </option>
        ))}
      </select>
      <p className="mt-1 text-xs text-gray-500">
        Fica lembrado para o próximo poste, então dá para lançar um trecho inteiro
        sem reescolher.
      </p>
    </div>
  );
}
