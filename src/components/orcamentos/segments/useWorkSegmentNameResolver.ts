"use client";

import { useCallback } from 'react';
import type { SegmentNameResolver } from '@/services/budgetMaterialAggregation';
import { useWorkSegments } from './WorkSegmentsProvider';

/**
 * Resolve o **nome** do segmento de um poste/grupo pela cascata da §7.3, no
 * formato que as exportações esperam.
 *
 * Fora do `WorkSegmentsProvider` (OrçaRede legado) devolve sempre `null`, e a
 * planilha simplesmente sai com tudo em "Não segmentado" — mesmo critério dos
 * campos de segmento, que também não renderizam nada lá.
 */
export function useWorkSegmentNameResolver(): SegmentNameResolver {
  const store = useWorkSegments();

  return useCallback<SegmentNameResolver>(
    (postId, postItemGroupId) => {
      if (!store) return null;
      return store.segmentName(store.effectiveSegmentId(postId, postItemGroupId));
    },
    [store]
  );
}
