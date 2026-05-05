'use client';

import { WifiOff } from 'lucide-react';
import type { RealtimeStatus } from '@/lib/hooks/useRealtimeChannel';

interface RealtimeStatusBannerProps {
  status: RealtimeStatus;
  message?: string;
}

/**
 * Unified banner for Realtime connection issues. Shown inline
 * within the component that owns the subscription. When multiple
 * subscriptions exist on the same page, the layout-level banner
 * can aggregate status from a context.
 */
export function RealtimeStatusBanner({
  status,
  message = 'Tempo real indisponível. Atualize a página para sincronizar.',
}: RealtimeStatusBannerProps) {
  if (status !== 'disconnected') return null;

  return (
    <div
      role="status"
      className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-800"
    >
      <WifiOff className="h-3.5 w-3.5 flex-shrink-0" aria-hidden />
      <span>{message}</span>
    </div>
  );
}
