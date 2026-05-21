'use client';

import { useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
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
  const router = useRouter();
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refreshInFlightRef = useRef(false);
  const quoteIdsRef = useRef<Set<string>>(new Set(quoteIds));

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

      router.refresh();
    } finally {
      refreshInFlightRef.current = false;
    }
  }, [budgetId, sessionId, onScenarios, onIdealSelections, router]);

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
          const row = (payload.new ?? payload.old) as { quote_id?: string } | null;
          const quoteId = row?.quote_id;
          if (quoteId && quoteIdsRef.current.has(quoteId)) {
            scheduleRefresh();
          }
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

  return { refresh, scheduleRefresh };
}
