"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabaseClient';
import {
  EMPTY_SEGMENT_ASSIGNMENTS,
  resolveSegmentId,
  setPostItemGroupSegment,
  setPostSegment,
  type BudgetSegmentAssignments,
  type WorkSegment,
} from '@/services/segments/workSegments';

interface WorkSegmentsContextValue {
  /** Catálogo do usuário, já ordenado. */
  segments: WorkSegment[];
  /** Marcação corrente por poste e por grupo de itens. */
  assignments: BudgetSegmentAssignments;
  /** Nome do segmento, ou `null` quando o id não está mais no catálogo. */
  segmentName: (segmentId: string | null | undefined) => string | null;
  /** Cascata da §7.3: grupo (override) → poste → não segmentado. */
  effectiveSegmentId: (postId: string, postItemGroupId?: string) => string | null;
  /** `true` enquanto a marcação daquele poste/grupo está sendo gravada. */
  isSaving: (id: string) => boolean;
  updatePostSegment: (postId: string, segmentId: string | null) => Promise<void>;
  updateGroupSegment: (postItemGroupId: string, segmentId: string | null) => Promise<void>;
}

const WorkSegmentsContext = createContext<WorkSegmentsContextValue | null>(null);

/**
 * Estado de segmentação do orçamento aberto.
 *
 * Fica fora do `AppContext` de propósito: o contexto legado não seleciona
 * `segment_id` em `fetchBudgetDetails` e sai de cena na Fase 7. Aqui o dado
 * chega pronto do servidor (layout da rota) e as escritas atualizam o estado
 * local — o mesmo padrão otimista que o `AppContext` usa no resto do orçamento.
 *
 * Fora do provider (OrçaRede legado dentro do `AppShell`) os componentes de
 * segmento simplesmente não renderizam nada.
 */
export function WorkSegmentsProvider({
  segments,
  initialAssignments,
  children,
}: {
  segments: WorkSegment[];
  initialAssignments: BudgetSegmentAssignments;
  children: ReactNode;
}) {
  const [assignments, setAssignments] = useState<BudgetSegmentAssignments>(
    initialAssignments ?? EMPTY_SEGMENT_ASSIGNMENTS
  );
  const [savingIds, setSavingIds] = useState<string[]>([]);

  const segmentName = useCallback(
    (segmentId: string | null | undefined) => {
      if (!segmentId) return null;
      return segments.find((segment) => segment.id === segmentId)?.name ?? null;
    },
    [segments]
  );

  const effectiveSegmentId = useCallback(
    (postId: string, postItemGroupId?: string) =>
      resolveSegmentId(assignments, postId, postItemGroupId),
    [assignments]
  );

  const isSaving = useCallback((id: string) => savingIds.includes(id), [savingIds]);

  const persist = useCallback(
    async (
      scope: 'posts' | 'groups',
      id: string,
      segmentId: string | null,
      write: () => Promise<void>
    ) => {
      const previous = assignments[scope][id] ?? null;
      if (previous === segmentId) return;

      setSavingIds((ids) => [...ids, id]);
      setAssignments((current) => ({
        ...current,
        [scope]: { ...current[scope], [id]: segmentId },
      }));

      try {
        await write();
      } catch (error) {
        // Reverte a marcação otimista e devolve o motivo ao usuário.
        setAssignments((current) => ({
          ...current,
          [scope]: { ...current[scope], [id]: previous },
        }));
        const message = error instanceof Error ? error.message : 'Erro desconhecido.';
        toast.error('Não foi possível salvar o segmento.', { description: message });
      } finally {
        setSavingIds((ids) => ids.filter((savingId) => savingId !== id));
      }
    },
    [assignments]
  );

  const updatePostSegment = useCallback(
    (postId: string, segmentId: string | null) =>
      persist('posts', postId, segmentId, () => setPostSegment(supabase, postId, segmentId)),
    [persist]
  );

  const updateGroupSegment = useCallback(
    (postItemGroupId: string, segmentId: string | null) =>
      persist('groups', postItemGroupId, segmentId, () =>
        setPostItemGroupSegment(supabase, postItemGroupId, segmentId)
      ),
    [persist]
  );

  const value = useMemo<WorkSegmentsContextValue>(
    () => ({
      segments,
      assignments,
      segmentName,
      effectiveSegmentId,
      isSaving,
      updatePostSegment,
      updateGroupSegment,
    }),
    [
      segments,
      assignments,
      segmentName,
      effectiveSegmentId,
      isSaving,
      updatePostSegment,
      updateGroupSegment,
    ]
  );

  return <WorkSegmentsContext.Provider value={value}>{children}</WorkSegmentsContext.Provider>;
}

/**
 * Acesso opcional ao estado de segmentação: devolve `null` quando não há
 * provider, que é o caso do OrçaRede legado.
 */
export function useWorkSegments(): WorkSegmentsContextValue | null {
  return useContext(WorkSegmentsContext);
}
