'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  useRealtimeChannel,
  type RealtimeEventConfig,
  type RealtimeStatus,
} from './useRealtimeChannel';
import type { NotificationRow } from '@/types/works';

interface UseNotificationsRealtimeOptions {
  userId: string;
  initialItems: NotificationRow[];
  initialUnreadCount: number;
}

interface UseNotificationsRealtimeResult {
  items: NotificationRow[];
  unreadCount: number;
  status: RealtimeStatus;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  pulse: boolean;
}

/**
 * Manages notification state with Realtime subscription on
 * user:{userId}:notifications channel. Falls back to polling
 * every 60s if Realtime is disconnected.
 */
export function useNotificationsRealtime({
  userId,
  initialItems,
  initialUnreadCount,
}: UseNotificationsRealtimeOptions): UseNotificationsRealtimeResult {
  const router = useRouter();
  const [items, setItems] = useState<NotificationRow[]>(initialItems);
  const [unreadCount, setUnreadCount] = useState(initialUnreadCount);
  const [pulse, setPulse] = useState(false);
  const pulseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setItems(initialItems);
    setUnreadCount(initialUnreadCount);
  }, [initialItems, initialUnreadCount]);

  const handleInsert = useCallback((payload: unknown) => {
    const row = (payload as { new?: Record<string, unknown> })?.new;
    if (!row?.id) return;

    const newItem: NotificationRow = {
      id: row.id as string,
      userId: row.user_id as string,
      workId: (row.work_id as string | null) ?? null,
      kind: row.kind as NotificationRow['kind'],
      title: row.title as string,
      body: (row.body as string | null) ?? null,
      linkPath: (row.link_path as string | null) ?? null,
      isRead: Boolean(row.is_read),
      createdAt: row.created_at as string,
    };

    setItems((prev) => {
      if (prev.some((n) => n.id === newItem.id)) return prev;
      return [newItem, ...prev];
    });

    if (!newItem.isRead) {
      setUnreadCount((c) => c + 1);
    }

    setPulse(true);
    if (pulseTimer.current) clearTimeout(pulseTimer.current);
    pulseTimer.current = setTimeout(() => setPulse(false), 1500);
  }, []);

  const events: RealtimeEventConfig[] = useMemo(
    () => [
      {
        event: 'INSERT',
        table: 'notifications',
        filter: `user_id=eq.${userId}`,
        callback: handleInsert,
      },
    ],
    [userId, handleInsert],
  );

  const pollingFn = useCallback(() => {
    router.refresh();
  }, [router]);

  const { status } = useRealtimeChannel({
    channelName: `user:${userId}:notifications`,
    events,
    timeoutMs: 10_000,
    pollingFallbackMs: 60_000,
    pollingFn,
  });

  const markAsRead = useCallback((id: string) => {
    setItems((prev) =>
      prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)),
    );
    setUnreadCount((c) => Math.max(0, c - 1));
  }, []);

  const markAllAsRead = useCallback(() => {
    setItems((prev) => prev.map((n) => ({ ...n, isRead: true })));
    setUnreadCount(0);
  }, []);

  useEffect(() => {
    return () => {
      if (pulseTimer.current) clearTimeout(pulseTimer.current);
    };
  }, []);

  return { items, unreadCount, status, markAsRead, markAllAsRead, pulse };
}
