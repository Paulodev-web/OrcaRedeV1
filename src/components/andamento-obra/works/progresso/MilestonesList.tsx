'use client';

import { useCallback, useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ChevronRight, ListChecks, Pencil, Plus, Trash2, WifiOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase as supabaseBrowser } from '@/lib/supabaseClient';
import type {
  MilestoneFullHistory,
  WorkMemberRole,
  WorkMilestoneWithApproval,
  WorkStatus,
} from '@/types/works';
import { MilestoneStatusBadge } from './MilestoneStatusBadge';
import { MilestoneDetailsDrawer } from './MilestoneDetailsDrawer';
import { MilestoneFormDialog } from './MilestoneFormDialog';
import { deleteWorkMilestone, loadMilestoneHistory } from '@/actions/workMilestones';

interface MilestonesListProps {
  workId: string;
  workStatus: WorkStatus;
  viewerRole: WorkMemberRole;
  initialMilestones: WorkMilestoneWithApproval[];
}

type RealtimeStatus = 'connecting' | 'connected' | 'disconnected';

export function MilestonesList({
  workId,
  workStatus,
  viewerRole,
  initialMilestones,
}: MilestonesListProps) {
  const router = useRouter();
  // Nao usar useState(initialMilestones): mudar a prop nao reinicializa state
  // em re-renders, entao criar/excluir marco (e ate updates via realtime)
  // ficariam invisiveis ate um reload manual.
  const milestones = initialMilestones;
  const [openId, setOpenId] = useState<string | null>(null);
  const [realtimeStatus, setRealtimeStatus] = useState<RealtimeStatus>('connecting');
  const [formDialog, setFormDialog] = useState<
    { mode: 'create' } | { mode: 'edit'; milestone: { id: string; name: string } } | null
  >(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [, startDeleteTransition] = useTransition();
  const canManage = viewerRole === 'engineer';

  function handleDelete(milestoneId: string, name: string) {
    const confirmed = confirm(`Excluir o marco "${name}"? Essa ação não pode ser desfeita.`);
    if (!confirmed) return;

    setDeletingId(milestoneId);
    startDeleteTransition(async () => {
      const result = await deleteWorkMilestone({ milestoneId });
      setDeletingId(null);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success('Marco excluído.');
      router.refresh();
    });
  }

  const loadHistory = useCallback(
    async (milestoneId: string): Promise<{
      history: MilestoneFullHistory | null;
      signedUrls: Record<string, string>;
    }> => {
      const result = await loadMilestoneHistory(milestoneId);
      if (!result.success || !result.data) {
        throw new Error(result.success ? 'Sem dados' : result.error);
      }
      return { history: result.data.history, signedUrls: result.data.signedUrls };
    },
    [],
  );

  useEffect(() => {
    let cancelled = false;
    const subscribeTimeout = setTimeout(() => {
      if (!cancelled && realtimeStatus !== 'connected') {
        setRealtimeStatus('disconnected');
      }
    }, 10000);

    const channel = supabaseBrowser
      .channel(`work:${workId}:events:milestones`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'work_milestones',
          filter: `work_id=eq.${workId}`,
        },
        () => {
          // Mais simples: forca refresh do server component
          router.refresh();
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'work_milestone_events',
          filter: `work_id=eq.${workId}`,
        },
        () => {
          router.refresh();
        },
      )
      .subscribe((status) => {
        if (cancelled) return;
        if (status === 'SUBSCRIBED') {
          setRealtimeStatus('connected');
          clearTimeout(subscribeTimeout);
        } else if (
          status === 'CHANNEL_ERROR'
          || status === 'TIMED_OUT'
          || status === 'CLOSED'
        ) {
          setRealtimeStatus('disconnected');
        }
      });

    return () => {
      cancelled = true;
      clearTimeout(subscribeTimeout);
      void supabaseBrowser.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workId]);

  const openMilestone = openId
    ? milestones.find((m) => m.id === openId) ?? null
    : null;

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <ListChecks className="h-4 w-4 text-link" />
          <h2 className="text-sm font-semibold text-neutral-900">Marcos da obra</h2>
        </div>
        {canManage && (
          <button
            type="button"
            onClick={() => setFormDialog({ mode: 'create' })}
            className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-surface px-2 py-1 text-xs font-medium text-neutral-900 hover:bg-gray-50"
          >
            <Plus className="h-3.5 w-3.5" />
            Adicionar
          </button>
        )}
      </div>

      {realtimeStatus === 'disconnected' && (
        <div className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] text-amber-800">
          <WifiOff className="h-3 w-3" />
          <span>Tempo real indisponível.</span>
        </div>
      )}

      <ol className="space-y-2">
        {milestones.map((m) => (
          <li key={m.id} className="flex items-stretch gap-1.5">
            <button
              type="button"
              onClick={() => setOpenId(m.id)}
              className={cn(
                'flex flex-1 items-center justify-between rounded-lg border border-gray-200 bg-surface px-3 py-2.5 text-left text-sm shadow-sm transition',
                'hover:border-accent-500/50 hover:shadow',
              )}
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="inline-flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-gray-100 text-[10px] font-semibold text-gray-600">
                    {m.orderIndex}
                  </span>
                  <span className="truncate font-medium text-neutral-900">{m.name}</span>
                </div>
                <div className="mt-1 flex items-center gap-2">
                  <MilestoneStatusBadge status={m.status} />
                  {m.eventsCount > 0 && (
                    <span className="text-[11px] text-gray-400">
                      {m.eventsCount} evento{m.eventsCount !== 1 ? 's' : ''}
                    </span>
                  )}
                </div>
              </div>
              <ChevronRight className="h-4 w-4 flex-shrink-0 text-gray-400" />
            </button>

            {canManage && (
              <div className="flex flex-shrink-0 items-center gap-1">
                <button
                  type="button"
                  title="Renomear marco"
                  onClick={() => setFormDialog({ mode: 'edit', milestone: { id: m.id, name: m.name } })}
                  className="rounded-md border border-gray-200 bg-surface p-2 text-gray-500 transition hover:bg-gray-50 hover:text-neutral-900"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                {m.status === 'pending' && (
                  <button
                    type="button"
                    title="Excluir marco"
                    disabled={deletingId === m.id}
                    onClick={() => handleDelete(m.id, m.name)}
                    className="rounded-md border border-gray-200 bg-surface p-2 text-gray-500 transition hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            )}
          </li>
        ))}
      </ol>

      {openMilestone && (
        <MilestoneDetailsDrawer
          open={openId !== null}
          onOpenChange={(o) => !o && setOpenId(null)}
          workId={workId}
          milestone={openMilestone}
          viewerRole={viewerRole}
          workStatusCancelled={workStatus === 'cancelled'}
          loadHistory={loadHistory}
          onChanged={() => router.refresh()}
        />
      )}

      {canManage && (
        <MilestoneFormDialog
          open={formDialog !== null}
          onOpenChange={(open) => {
            if (!open) setFormDialog(null);
          }}
          workId={workId}
          milestone={formDialog?.mode === 'edit' ? formDialog.milestone : null}
          onSaved={() => router.refresh()}
        />
      )}
    </section>
  );
}
