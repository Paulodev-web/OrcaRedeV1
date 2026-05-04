'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import * as Popover from '@radix-ui/react-popover';
import { Bell } from 'lucide-react';
import { markNotificationAsRead, markAllNotificationsAsRead } from '@/actions/notifications';
import { formatRelativeTime } from '@/lib/formatRelativeTime';
import type { NotificationRow } from '@/types/works';

interface WorkNotificationsBellProps {
  initialItems: NotificationRow[];
  initialUnreadCount: number;
}

export function WorkNotificationsBell({
  initialItems,
  initialUnreadCount,
}: WorkNotificationsBellProps) {
  const router = useRouter();
  const [items, setItems] = useState<NotificationRow[]>(initialItems);
  const [unread, setUnread] = useState(initialUnreadCount);
  const [open, setOpen] = useState(false);
  const [, startTransition] = useTransition();

  const handleClickItem = (notification: NotificationRow) => {
    setOpen(false);
    if (!notification.isRead) {
      setItems((prev) =>
        prev.map((n) => (n.id === notification.id ? { ...n, isRead: true } : n)),
      );
      setUnread((u) => Math.max(0, u - 1));
      startTransition(async () => {
        await markNotificationAsRead(notification.id);
      });
    }
    if (notification.linkPath) {
      router.push(notification.linkPath);
    }
  };

  const handleMarkAll = () => {
    if (unread === 0) return;
    setItems((prev) => prev.map((n) => ({ ...n, isRead: true })));
    setUnread(0);
    startTransition(async () => {
      await markAllNotificationsAsRead();
    });
  };

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label={`Notificações${unread > 0 ? ` (${unread} não lidas)` : ''}`}
          className="relative inline-flex h-9 w-9 items-center justify-center rounded-full text-gray-600 transition-colors hover:bg-gray-100 hover:text-[#1D3140]"
        >
          <Bell className="h-4.5 w-4.5" />
          {unread > 0 && (
            <span className="absolute -right-0.5 -top-0.5 inline-flex min-w-[1rem] items-center justify-center rounded-full bg-[#64ABDE] px-1 text-[9px] font-semibold text-white ring-2 ring-white">
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={8}
          className="z-50 w-[320px] rounded-xl border border-gray-200 bg-white shadow-lg"
        >
          <header className="flex items-center justify-between gap-2 border-b border-gray-100 px-4 py-3">
            <p className="text-sm font-semibold text-[#1D3140]">Notificações</p>
            <button
              type="button"
              onClick={handleMarkAll}
              disabled={unread === 0}
              className="text-xs font-medium text-[#64ABDE] hover:underline disabled:cursor-not-allowed disabled:opacity-40"
            >
              Marcar todas
            </button>
          </header>
          <div className="max-h-80 overflow-y-auto">
            {items.length === 0 ? (
              <p className="px-4 py-6 text-center text-xs text-gray-400">
                Nenhuma notificação por enquanto.
              </p>
            ) : (
              <ul className="divide-y divide-gray-50">
                {items.slice(0, 5).map((n) => (
                  <li key={n.id}>
                    <button
                      type="button"
                      onClick={() => handleClickItem(n)}
                      className={`flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-gray-50 ${
                        n.isRead ? '' : 'bg-[#64ABDE]/5'
                      }`}
                    >
                      <span
                        className={`mt-1 h-1.5 w-1.5 flex-shrink-0 rounded-full ${
                          n.isRead ? 'bg-transparent' : 'bg-[#64ABDE]'
                        }`}
                        aria-hidden
                      />
                      <div className="min-w-0 flex-1">
                        <p
                          className={`truncate text-xs font-semibold ${
                            n.isRead ? 'text-gray-700' : 'text-[#1D3140]'
                          }`}
                        >
                          {n.title}
                        </p>
                        {n.body && (
                          <p className="mt-0.5 line-clamp-2 text-[11px] text-gray-500">{n.body}</p>
                        )}
                        <p className="mt-1 text-[10px] text-gray-400">
                          {formatRelativeTime(n.createdAt)}
                        </p>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <footer className="border-t border-gray-100 px-4 py-2 text-center">
            <Link
              href="/tools/andamento-obra"
              onClick={() => setOpen(false)}
              className="text-xs font-medium text-[#64ABDE] hover:underline"
            >
              Ver tudo
            </Link>
          </footer>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
