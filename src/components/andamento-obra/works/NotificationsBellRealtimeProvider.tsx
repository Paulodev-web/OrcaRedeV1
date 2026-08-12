'use client';

import { createContext, useContext, type ReactNode } from 'react';
import {
  useNotificationsRealtime,
} from '@/lib/hooks/useNotificationsRealtime';
import type { RealtimeStatus } from '@/lib/hooks/useRealtimeChannel';
import type { NotificationRow } from '@/types/works';

interface NotificationsContextValue {
  items: NotificationRow[];
  unreadCount: number;
  status: RealtimeStatus;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  pulse: boolean;
}

const NotificationsContext = createContext<NotificationsContextValue | null>(null);

export function useNotificationsContext() {
  const ctx = useContext(NotificationsContext);
  if (!ctx) {
    throw new Error(
      'useNotificationsContext must be used within NotificationsBellRealtimeProvider',
    );
  }
  return ctx;
}

interface ProviderProps {
  userId: string;
  initialItems: NotificationRow[];
  initialUnreadCount: number;
  /** Ver `useNotificationsRealtime` — escopa o INSERT ao vivo por module_key. */
  moduleKey?: string;
  children: ReactNode;
}

export function NotificationsBellRealtimeProvider({
  userId,
  initialItems,
  initialUnreadCount,
  moduleKey,
  children,
}: ProviderProps) {
  const value = useNotificationsRealtime({
    userId,
    initialItems,
    initialUnreadCount,
    moduleKey,
  });

  return (
    <NotificationsContext.Provider value={value}>
      {children}
    </NotificationsContext.Provider>
  );
}
