'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { formatRelativeTime } from '@/lib/formatRelativeTime';
import {
  markNotificationAsRead,
  markAllNotificationsAsRead,
  getOlderNotifications,
} from '@/actions/notifications';
import { LoadMoreButton } from '@/components/andamento-obra/works/shared/LoadMoreButton';
import type { NotificationRow } from '@/types/works';

interface Props {
  initialItems: NotificationRow[];
  initialHasMore: boolean;
}

export function NotificationsFullList({ initialItems, initialHasMore }: Props) {
  const router = useRouter();
  const [items, setItems] = useState<NotificationRow[]>(initialItems);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [filterUnread, setFilterUnread] = useState(false);
  const [, startTransition] = useTransition();

  async function handleLoadMore() {
    if (loadingOlder || items.length === 0) return;
    const oldest = items[items.length - 1];
    setLoadingOlder(true);
    try {
      const result = await getOlderNotifications(oldest.createdAt, filterUnread);
      if (result.success && result.data) {
        setItems((prev) => {
          const ids = new Set(prev.map((n) => n.id));
          return [...prev, ...result.data!.items.filter((n) => !ids.has(n.id))];
        });
        setHasMore(result.data.hasMore);
      }
    } finally {
      setLoadingOlder(false);
    }
  }

  function handleClick(notification: NotificationRow) {
    if (!notification.isRead) {
      setItems((prev) =>
        prev.map((n) => (n.id === notification.id ? { ...n, isRead: true } : n)),
      );
      startTransition(async () => {
        await markNotificationAsRead(notification.id);
      });
    }
    if (notification.linkPath) {
      router.push(notification.linkPath);
    }
  }

  function handleMarkAll() {
    setItems((prev) => prev.map((n) => ({ ...n, isRead: true })));
    startTransition(async () => {
      await markAllNotificationsAsRead();
    });
  }

  const visible = filterUnread ? items.filter((n) => !n.isRead) : items;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setFilterUnread(false)}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              !filterUnread ? 'bg-[#1D3140] text-white' : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            Todas
          </button>
          <button
            type="button"
            onClick={() => setFilterUnread(true)}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              filterUnread ? 'bg-[#1D3140] text-white' : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            Não lidas
          </button>
        </div>
        <button
          type="button"
          onClick={handleMarkAll}
          className="text-xs font-medium text-[#64ABDE] hover:underline"
        >
          Marcar todas como lidas
        </button>
      </div>

      {visible.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-200 p-8 text-center">
          <p className="text-sm text-gray-500">
            {filterUnread ? 'Nenhuma notificação não lida.' : 'Nenhuma notificação ainda.'}
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-gray-100 overflow-hidden rounded-xl border border-gray-200 bg-white">
          {visible.map((n) => (
            <li key={n.id}>
              <button
                type="button"
                onClick={() => handleClick(n)}
                className={`flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-gray-50 ${
                  n.isRead ? '' : 'bg-[#64ABDE]/5'
                }`}
              >
                <span
                  className={`mt-1.5 h-2 w-2 flex-shrink-0 rounded-full ${
                    n.isRead ? 'bg-transparent' : 'bg-[#64ABDE]'
                  }`}
                  aria-hidden
                />
                <div className="min-w-0 flex-1">
                  <p
                    className={`text-sm font-semibold ${
                      n.isRead ? 'text-gray-700' : 'text-[#1D3140]'
                    }`}
                  >
                    {n.title}
                  </p>
                  {n.body && (
                    <p className="mt-0.5 text-xs text-gray-500 line-clamp-2">{n.body}</p>
                  )}
                  <p className="mt-1 text-[11px] text-gray-400">
                    {formatRelativeTime(n.createdAt)}
                  </p>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}

      <LoadMoreButton
        hasMore={hasMore}
        loading={loadingOlder}
        onLoadMore={() => void handleLoadMore()}
        label="Carregar notificações anteriores"
      />
    </div>
  );
}
