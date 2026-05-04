'use client';

import { useMemo, useState, useTransition } from 'react';
import { Bell, CheckCheck } from 'lucide-react';
import { toast } from 'sonner';
import { NotificationItem } from './NotificationItem';
import { markAllNotificationsAsRead } from '@/actions/notifications';
import { dayBucketLabel } from '@/lib/formatRelativeTime';
import type { NotificationRow } from '@/types/works';

interface NotificationsCenterProps {
  initialItems: NotificationRow[];
}

export function NotificationsCenter({ initialItems }: NotificationsCenterProps) {
  const [items, setItems] = useState<NotificationRow[]>(initialItems);
  const [pending, startTransition] = useTransition();

  const buckets = useMemo(() => {
    const map = new Map<string, NotificationRow[]>();
    for (const item of items) {
      const label = dayBucketLabel(item.createdAt);
      const list = map.get(label);
      if (list) list.push(item);
      else map.set(label, [item]);
    }
    return Array.from(map.entries());
  }, [items]);

  const unreadCount = useMemo(
    () => items.reduce((acc, n) => acc + (n.isRead ? 0 : 1), 0),
    [items],
  );

  const handleMarkRead = (id: string) => {
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)));
  };

  const handleMarkAll = () => {
    if (unreadCount === 0) return;
    startTransition(async () => {
      const result = await markAllNotificationsAsRead();
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      setItems((prev) => prev.map((n) => ({ ...n, isRead: true })));
      toast.success('Todas marcadas como lidas.');
    });
  };

  return (
    <aside
      aria-label="Central de Notificações"
      className="rounded-xl border border-gray-200 bg-white shadow-sm"
    >
      <header className="flex items-center justify-between gap-2 border-b border-gray-100 px-4 py-3">
        <div className="flex items-center gap-2">
          <Bell className="h-4 w-4 text-[#64ABDE]" />
          <h2 className="text-sm font-semibold text-[#1D3140]">Notificações</h2>
          {unreadCount > 0 && (
            <span className="rounded-full bg-[#64ABDE] px-2 py-0.5 text-[10px] font-medium text-white">
              {unreadCount}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={handleMarkAll}
          disabled={unreadCount === 0 || pending}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-gray-500 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <CheckCheck className="h-3.5 w-3.5" />
          Marcar todas
        </button>
      </header>

      <div className="max-h-[70vh] overflow-y-auto p-2">
        {items.length === 0 ? (
          <p className="px-3 py-8 text-center text-xs text-gray-400">
            Nenhuma notificação por enquanto.
          </p>
        ) : (
          <div className="space-y-3">
            {buckets.map(([label, bucketItems]) => (
              <div key={label}>
                <p className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                  {label}
                </p>
                <div className="space-y-0.5">
                  {bucketItems.map((notification) => (
                    <NotificationItem
                      key={notification.id}
                      notification={notification}
                      onRead={handleMarkRead}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}
