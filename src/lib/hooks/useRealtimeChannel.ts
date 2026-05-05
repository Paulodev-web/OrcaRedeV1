'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase as supabaseBrowser } from '@/lib/supabaseClient';
import type { RealtimeChannel } from '@supabase/supabase-js';

export type RealtimeStatus = 'connecting' | 'connected' | 'disconnected';

export interface RealtimeEventConfig {
  event: 'INSERT' | 'UPDATE' | 'DELETE' | '*';
  schema?: string;
  table: string;
  filter?: string;
  callback: (payload: unknown) => void;
}

export interface UseRealtimeChannelOptions {
  channelName: string;
  events: RealtimeEventConfig[];
  timeoutMs?: number;
  pollingFallbackMs?: number;
  pollingFn?: () => void | Promise<void>;
  enabled?: boolean;
}

export interface UseRealtimeChannelResult {
  status: RealtimeStatus;
  reconnect: () => void;
}

/**
 * Encapsulates Supabase Realtime subscription with timeout detection,
 * automatic cleanup, and optional polling fallback.
 *
 * Each mount creates one channel. On unmount the channel is removed.
 * If subscription doesn't confirm within `timeoutMs` (default 10s)
 * the status flips to `disconnected` and optional polling kicks in.
 */
export function useRealtimeChannel({
  channelName,
  events,
  timeoutMs = 10_000,
  pollingFallbackMs,
  pollingFn,
  enabled = true,
}: UseRealtimeChannelOptions): UseRealtimeChannelResult {
  const [status, setStatus] = useState<RealtimeStatus>('connecting');
  const channelRef = useRef<RealtimeChannel | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const eventsRef = useRef(events);
  eventsRef.current = events;

  const pollingFnRef = useRef(pollingFn);
  pollingFnRef.current = pollingFn;

  const subscribe = useCallback(() => {
    if (channelRef.current) {
      void supabaseBrowser.removeChannel(channelRef.current);
      channelRef.current = null;
    }
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }

    setStatus('connecting');
    let cancelled = false;

    const subscribeTimeout = setTimeout(() => {
      if (!cancelled) {
        setStatus((current) =>
          current === 'connected' ? current : 'disconnected',
        );
      }
    }, timeoutMs);

    let channel = supabaseBrowser.channel(channelName);

    for (const evt of eventsRef.current) {
      channel = channel.on(
        'postgres_changes' as never,
        {
          event: evt.event,
          schema: evt.schema ?? 'public',
          table: evt.table,
          ...(evt.filter ? { filter: evt.filter } : {}),
        } as never,
        evt.callback as never,
      );
    }

    channel.subscribe((subStatus) => {
      if (cancelled) return;
      if (subStatus === 'SUBSCRIBED') {
        setStatus('connected');
        clearTimeout(subscribeTimeout);
        if (pollingRef.current) {
          clearInterval(pollingRef.current);
          pollingRef.current = null;
        }
      } else if (
        subStatus === 'CHANNEL_ERROR'
        || subStatus === 'TIMED_OUT'
        || subStatus === 'CLOSED'
      ) {
        setStatus('disconnected');
      }
    });

    channelRef.current = channel;

    return () => {
      cancelled = true;
      clearTimeout(subscribeTimeout);
    };
  }, [channelName, timeoutMs]);

  useEffect(() => {
    if (!enabled) {
      setStatus('connecting');
      return;
    }

    const cleanup = subscribe();

    return () => {
      cleanup();
      if (channelRef.current) {
        void supabaseBrowser.removeChannel(channelRef.current);
        channelRef.current = null;
      }
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [subscribe, enabled]);

  useEffect(() => {
    if (
      status === 'disconnected'
      && pollingFallbackMs
      && pollingFallbackMs > 0
      && pollingFnRef.current
      && !pollingRef.current
    ) {
      pollingRef.current = setInterval(() => {
        void pollingFnRef.current?.();
      }, pollingFallbackMs);
    }

    if (status === 'connected' && pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [status, pollingFallbackMs]);

  const reconnect = useCallback(() => {
    subscribe();
  }, [subscribe]);

  return { status, reconnect };
}
