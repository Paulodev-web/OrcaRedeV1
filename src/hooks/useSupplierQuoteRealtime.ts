'use client';

import { useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabaseClient';
import type { SupplierQuote } from '@/types';

export interface SupplierQuoteRealtimeListeners {
  onProcessing?: (quote: SupplierQuote) => void;
  onReady?: (quote: SupplierQuote) => void;
  onError?: (quote: SupplierQuote, errorMessage: string) => void;
  /** Disparado quando a Edge Function match-supplier-quote conclui (status → aguardando_revisao). */
  onConciliationReady?: (quote: SupplierQuote) => void;
}

/**
 * Assina mudanças em supplier_quotes via Supabase Realtime.
 * Dispara callbacks para: processando_ia, pendente_conciliacao, erro_extracao, aguardando_revisao.
 */
export function useSupplierQuoteRealtime(listeners: SupplierQuoteRealtimeListeners) {
  // Usa ref para evitar re-subscribe quando os callbacks mudam de referência
  const listenersRef = useRef(listeners);
  listenersRef.current = listeners;

  useEffect(() => {
    const channel = supabase
      .channel('supplier-quotes-async-status')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'supplier_quotes',
        },
        (payload) => {
          const quote = payload.new as SupplierQuote | null;
          if (!quote) return;

          const { onProcessing, onReady, onError, onConciliationReady } = listenersRef.current;

          if (quote.status === 'processando_ia') {
            onProcessing?.(quote);
          } else if (quote.status === 'pendente_conciliacao') {
            onReady?.(quote);
          } else if (quote.status === 'erro_extracao') {
            onError?.(quote, quote.extraction_error_message ?? 'Erro desconhecido na extração.');
          } else if (quote.status === 'aguardando_revisao') {
            onConciliationReady?.(quote);
          }
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, []);
}
