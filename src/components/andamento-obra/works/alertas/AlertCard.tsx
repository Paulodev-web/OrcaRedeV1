'use client';

import { useState } from 'react';
import type { WorkAlert } from '@/types/works';
import { ALERT_SEVERITY_LABELS, ALERT_CATEGORY_LABELS, ALERT_STATUS_LABELS } from '@/types/works';
import { AlertSeverityBadge } from './AlertSeverityBadge';
import { AlertStatusBadge } from './AlertStatusBadge';
import { AlertDetailsDrawer } from './AlertDetailsDrawer';

interface Props {
  alert: WorkAlert;
  workId: string;
  role: string;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const hours = Math.floor(diff / (1000 * 60 * 60));
  if (hours < 1) return 'há poucos minutos';
  if (hours < 24) return `há ${hours}h`;
  const days = Math.floor(hours / 24);
  return `há ${days}d`;
}

export function AlertCard({ alert, workId, role }: Props) {
  const [showDrawer, setShowDrawer] = useState(false);

  const severityColors: Record<string, string> = {
    low: 'border-l-gray-400',
    medium: 'border-l-amber-400',
    high: 'border-l-orange-500',
    critical: 'border-l-red-600',
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setShowDrawer(true)}
        className={`w-full rounded-lg border border-gray-200 border-l-4 bg-white p-4 text-left shadow-sm transition-shadow hover:shadow-md ${severityColors[alert.severity] ?? 'border-l-gray-400'}`}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="font-medium text-[#1D3140]">{alert.title}</span>
            <AlertSeverityBadge severity={alert.severity} />
            <AlertStatusBadge status={alert.status} />
          </div>
          <span className="text-xs text-gray-500">{timeAgo(alert.createdAt)}</span>
        </div>
        <p className="mt-1 text-xs text-gray-500">
          {ALERT_CATEGORY_LABELS[alert.category]} · {ALERT_STATUS_LABELS[alert.status]}
        </p>
        <p className="mt-1 line-clamp-2 text-sm text-gray-600">{alert.description}</p>
      </button>

      {showDrawer && (
        <AlertDetailsDrawer
          alertId={alert.id}
          workId={workId}
          role={role}
          onClose={() => setShowDrawer(false)}
        />
      )}
    </>
  );
}
