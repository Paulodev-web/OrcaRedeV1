"use client";

import { Layers, Loader2 } from 'lucide-react';
import { useWorkSegments } from './WorkSegmentsProvider';

const UNSEGMENTED_VALUE = '';

const selectClass =
  'rounded-md border border-gray-300 bg-surface px-2 py-1 text-xs text-gray-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-60';

/**
 * Marcação de segmento do poste — nível intermediário da cascata (§7.3).
 *
 * Renderiza `null` fora do `WorkSegmentsProvider`, o que mantém o OrçaRede
 * legado exatamente como estava.
 */
export function PostSegmentField({ postId }: { postId: string }) {
  const store = useWorkSegments();
  if (!store) return null;

  const { segments, assignments, isSaving, updatePostSegment } = store;
  const value = assignments.posts[postId] ?? null;
  const saving = isSaving(postId);

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
      <Layers className="h-4 w-4 shrink-0 text-blue-600" />
      <label
        htmlFor={`segmento-poste-${postId}`}
        className="text-sm font-medium text-gray-700"
      >
        Segmento da obra
      </label>

      {segments.length === 0 ? (
        <span className="text-xs text-gray-500">
          Nenhum segmento cadastrado — crie o catálogo em Configurações.
        </span>
      ) : (
        <>
          <select
            id={`segmento-poste-${postId}`}
            value={value ?? UNSEGMENTED_VALUE}
            disabled={saving}
            onChange={(event) => {
              void updatePostSegment(postId, event.target.value || null);
            }}
            className={selectClass}
          >
            <option value={UNSEGMENTED_VALUE}>Não segmentado</option>
            {segments.map((segment) => (
              <option key={segment.id} value={segment.id}>
                {segment.name}
              </option>
            ))}
          </select>
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-600" /> : null}
          <span className="text-xs text-gray-500">
            Vale para os grupos deste poste, salvo override.
          </span>
        </>
      )}
    </div>
  );
}

/**
 * Override do segmento no grupo de itens — o topo da cascata. Vazio, o grupo
 * herda o segmento do poste.
 */
export function PostItemGroupSegmentField({
  postId,
  postItemGroupId,
}: {
  postId: string;
  postItemGroupId: string;
}) {
  const store = useWorkSegments();
  if (!store) return null;

  const { segments, assignments, segmentName, isSaving, updateGroupSegment } = store;
  if (segments.length === 0) return null;

  const value = assignments.groups[postItemGroupId] ?? null;
  const inherited = segmentName(assignments.posts[postId] ?? null);
  const saving = isSaving(postItemGroupId);

  return (
    <div className="flex flex-wrap items-center gap-2 pb-2">
      <label
        htmlFor={`segmento-grupo-${postItemGroupId}`}
        className="text-xs font-medium text-gray-600"
      >
        Segmento
      </label>
      <select
        id={`segmento-grupo-${postItemGroupId}`}
        value={value ?? UNSEGMENTED_VALUE}
        disabled={saving}
        onChange={(event) => {
          void updateGroupSegment(postItemGroupId, event.target.value || null);
        }}
        className={selectClass}
      >
        <option value={UNSEGMENTED_VALUE}>
          {inherited ? `Herda do poste (${inherited})` : 'Herda do poste (não segmentado)'}
        </option>
        {segments.map((segment) => (
          <option key={segment.id} value={segment.id}>
            {segment.name}
          </option>
        ))}
      </select>
      {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-600" /> : null}
    </div>
  );
}

/** Chip com o segmento resolvido, para leitura rápida na lista de postes. */
export function PostSegmentBadge({ postId }: { postId: string }) {
  const store = useWorkSegments();
  if (!store) return null;

  const name = store.segmentName(store.assignments.posts[postId] ?? null);
  if (!name) return null;

  return (
    <span className="inline-flex max-w-[10rem] items-center gap-1 truncate rounded-full border border-brand-blue/40 bg-brand-blue/15 px-2 py-0.5 text-[11px] font-medium text-brand-navy">
      <Layers className="h-3 w-3 shrink-0" />
      <span className="truncate">{name}</span>
    </span>
  );
}
