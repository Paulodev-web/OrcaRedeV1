'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import { AcompanhamentoCenter } from './AcompanhamentoCenter';
import { NotificationsCenter } from './NotificationsCenter';
import { NewWorkDialog } from './NewWorkDialog';
import { EmptyWorksState } from './EmptyWorksState';
import { onPortalPrimaryButtonSmClass } from '@/lib/branding';
import type { ManagerRow } from '@/types/people';
import type { NotificationRow, WorksGrouped } from '@/types/works';

interface WorksHomeViewProps {
  grouped: WorksGrouped;
  notifications: NotificationRow[];
  managers: ManagerRow[];
  hasAnyWork: boolean;
  unreadCountsByWorkId?: Record<string, number>;
}

export function WorksHomeView({
  grouped,
  notifications,
  managers,
  hasAnyWork,
  unreadCountsByWorkId,
}: WorksHomeViewProps) {
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#1D3140]">Andamento de Obra</h1>
          <p className="mt-1 max-w-2xl text-sm text-gray-500">
            Central de Acompanhamento e Notificações das suas obras em campo.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setDialogOpen(true)}
          className={`${onPortalPrimaryButtonSmClass} inline-flex flex-shrink-0 items-center gap-2 rounded-lg px-4 py-2 text-sm`}
        >
          <Plus className="h-4 w-4" />
          Nova Obra
        </button>
      </div>

      {hasAnyWork ? (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,7fr)_minmax(0,3fr)]">
          <AcompanhamentoCenter
            grouped={grouped}
            unreadCountsByWorkId={unreadCountsByWorkId}
          />
          <NotificationsCenter initialItems={notifications} />
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,7fr)_minmax(0,3fr)]">
          <EmptyWorksState onNewWork={() => setDialogOpen(true)} />
          <NotificationsCenter initialItems={notifications} />
        </div>
      )}

      <NewWorkDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        managers={managers}
      />
    </div>
  );
}
