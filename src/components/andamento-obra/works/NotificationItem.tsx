'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  Bell,
  MessageSquare,
  ClipboardCheck,
  AlertTriangle,
  Flag,
  HardHat,
  CheckCircle2,
} from 'lucide-react';
import { markNotificationAsRead } from '@/actions/notifications';
import { formatRelativeTime } from '@/lib/formatRelativeTime';
import type { NotificationKind, NotificationRow } from '@/types/works';

interface NotificationItemProps {
  notification: NotificationRow;
  onRead: (id: string) => void;
}

const ICONS: Record<NotificationKind, typeof Bell> = {
  work_created: HardHat,
  message_received: MessageSquare,
  daily_log_published: ClipboardCheck,
  daily_log_rejected: AlertTriangle,
  checklist_completed: CheckCircle2,
  checklist_returned: AlertTriangle,
  milestone_reported: Flag,
  milestone_approved: CheckCircle2,
  milestone_rejected: AlertTriangle,
  alert_opened: AlertTriangle,
  alert_resolved_in_field: CheckCircle2,
  alert_closed: CheckCircle2,
  pole_installed: HardHat,
};

export function NotificationItem({ notification, onRead }: NotificationItemProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const Icon = ICONS[notification.kind] ?? Bell;

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    if (!notification.isRead) {
      startTransition(async () => {
        await markNotificationAsRead(notification.id);
        onRead(notification.id);
      });
    }
    if (notification.linkPath) {
      router.push(notification.linkPath);
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className={`group flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left transition-colors ${
        notification.isRead ? 'hover:bg-gray-50' : 'bg-[#64ABDE]/5 hover:bg-[#64ABDE]/10'
      }`}
    >
      <div
        className={`mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full ${
          notification.isRead ? 'bg-gray-100 text-gray-500' : 'bg-[#64ABDE]/15 text-[#64ABDE]'
        }`}
      >
        <Icon className="h-3.5 w-3.5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <p
            className={`truncate text-xs font-semibold ${
              notification.isRead ? 'text-gray-700' : 'text-[#1D3140]'
            }`}
          >
            {notification.title}
          </p>
          <span className="flex-shrink-0 text-[10px] text-gray-400">
            {formatRelativeTime(notification.createdAt)}
          </span>
        </div>
        {notification.body && (
          <p className="mt-0.5 line-clamp-2 text-[11px] text-gray-500">{notification.body}</p>
        )}
      </div>
      {!notification.isRead && (
        <span
          className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-[#64ABDE]"
          aria-label="Não lida"
        />
      )}
    </button>
  );
}
