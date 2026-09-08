'use client';

import { useCallback, useEffect, useRef } from 'react';
import {
  calculateScenariosAction,
  getIdealSelectionsAction,
  type ScenariosResult,
  type IdealSelectionRow,
} from '@/actions/supplierQuotes';
import { supabase } from '@/lib/supabaseClient';

const DEBOUNCE_MS = 400;

export interface UseSessionScenariosRefreshOptions {
  budgetId: string;
  sessionId: string;
  onScenarios: (data: ScenariosResult) => void;
  onIdealSelections?: (rows: IdealSelectionRow[]) => void;
  /** IDs de cotações da sessão — filtra eventos em supplier_quote_items */
  quoteIds?: string[];
}

export function useSessionScenariosRefresh({
  budgetId,
  sessionId,
  onScenarios,
  onIdealSelections,
  quoteIds = [],
}: UseSessionScenariosRefreshOptions) {
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refreshInFlightRef = useRef(false);
  const quoteIdsRef = useRef<Set<string>>(new Set(quoteIds));
  /**
   * Itens que esta aba acabou de salvar. O Realtime devolve o UPDATE que a
   * própria pessoa fez, e reagir a ele significava recalcular os cenários mais
   * uma vez logo depois do refresh que o save já disparou.
   */
  const escritasLocaisRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    quoteIdsRef.current = new Set(quoteIds);
  }, [quoteIds]);

  const runRefresh = useCallback(async () => {
    if (refreshInFlightRef.current) return;
    refreshInFlightRef.current = true;
    try {
      const [scenariosRes, idealRes] = await Promise.all([
        calculateScenariosAction(budgetId, sessionId),
        onIdealSelections ? getIdealSelectionsAction(sessionId) : Promise.resolve(null),
      ]);

      if (scenariosRes.success) {
        onScenarios(scenariosRes.data);
        const ids = new Set<string>();
        for (const item of scenariosRes.data.scenarioB.items) {
          for (const offer of item.all_offers) {
            ids.add(offer.quote_id);
          }
        }
        quoteIdsRef.current = ids;
      }

      if (onIdealSelections && idealRes?.success) {
        onIdealSelections(idealRes.data);
      }

      // Não há `router.refresh()` aqui de propósito: `calculateScenariosAction`
      // acabou de devolver os dados novos por `onScenarios`, e o refresh do
      // router mandaria o servidor re-renderizar a página inteira para calcular
      // exatamente a mesma coisa de novo. Era a terceira execução do cálculo
      // mais caro do módulo por save.
    } finally {
      refreshInFlightRef.current = false;
    }
  }, [budgetId, sessionId, onScenarios, onIdealSelections]);

  const scheduleRefresh = useCallback(() => {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    refreshTimerRef.current = setTimeout(() => {
      refreshTimerRef.current = null;
      void runRefresh();
    }, DEBOUNCE_MS);
  }, [runRefresh]);

  const refresh = useCallback(() => {
    if (refreshTimerRef.current) {
      clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = null;
    }
    return runRefresh();
  }, [runRefresh]);

  useEffect(() => {
    const channel = supabase
      .channel(`session_scenarios:${sessionId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'supplier_quotes',
          filter: `session_id=eq.${sessionId}`,
        },
        () => scheduleRefresh()
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'extraction_jobs',
          filter: `session_id=eq.${sessionId}`,
        },
        (payload) => {
          const row = payload.new as { status?: string } | null;
          if (row?.status === 'completed') scheduleRefresh();
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'scenario_ideal_selections',
          filter: `session_id=eq.${sessionId}`,
        },
        () => scheduleRefresh()
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'session_material_stock_inputs',
          filter: `session_id=eq.${sessionId}`,
        },
        () => scheduleRefresh()
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'supplier_quote_items',
        },
        (payload) => {
          const row = (payload.new ?? payload.old) as { id?: string; quote_id?: string } | null;
          const quoteId = row?.quote_id;
          if (!quoteId || !quoteIdsRef.current.has(quoteId)) return;

          // Eco do próprio save: consome a marca e ignora uma vez.
          if (row?.id && escritasLocaisRef.current.has(row.id)) {
            escritasLocaisRef.current.delete(row.id);
            return;
          }

          scheduleRefresh();
        }
      )
      .subscribe();

    return () => {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
      void supabase.removeChannel(channel);
    };
  }, [sessionId, scheduleRefresh]);

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'visible') scheduleRefresh();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [scheduleRefresh]);

  /**
   * Avisa que esta aba está salvando estes itens, para o eco do Realtime não
   * virar um recálculo extra. A marca expira sozinha em 10s caso o evento não
   * chegue (conexão caiu, canal reconectando).
   */
  const markLocalWrite = useCallback((itemIds: string[]) => {
    for (const id of itemIds) {
      escritasLocaisRef.current.add(id);
      setTimeout(() => escritasLocaisRef.current.delete(id), 10_000);
    }
  }, []);

  return { refresh, scheduleRefresh, markLocalWrite };
}
