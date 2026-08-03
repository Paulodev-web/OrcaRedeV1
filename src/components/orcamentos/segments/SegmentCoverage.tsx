"use client";

import { Layers } from 'lucide-react';
import { useApp } from '@/contexts/AppContext';
import { useWorkSegments } from './WorkSegmentsProvider';

/**
 * Quantos postes do orçamento já têm segmento.
 *
 * Só a marcação do poste conta: um override de grupo sem poste marcado
 * segmenta o grupo, não o poste, e a tabela de valores globais por segmento da
 * proposta (§8.3, seção 10) precisa saber o que ficou de fora.
 */
export function SegmentCoverageBadge() {
  const store = useWorkSegments();
  const { budgetDetails } = useApp();

  if (!store || store.segments.length === 0) return null;

  const posts = budgetDetails?.posts ?? [];
  if (posts.length === 0) return null;

  const segmented = posts.filter((post) => Boolean(store.assignments.posts[post.id])).length;
  const complete = segmented === posts.length;

  return (
    <span
      title="Postes com segmento de obra marcado"
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium ${
        complete
          ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
          : 'border-amber-200 bg-amber-50 text-amber-700'
      }`}
    >
      <Layers className="h-3.5 w-3.5" />
      <span className="tabular-nums">
        {segmented}/{posts.length}
      </span>
      <span>{complete ? 'postes segmentados' : 'postes com segmento'}</span>
    </span>
  );
}
