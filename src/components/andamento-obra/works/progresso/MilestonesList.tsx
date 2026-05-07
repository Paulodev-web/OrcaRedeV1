'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronRight, ListChecks, WifiOff } from 'lucide-react';
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
import { loadMilestoneHistory } from '@/actions/workMilestones';

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
  const [milestones] = useState<WorkMilestoneWithApproval[]>(initialMilestones);
  const [openId, setOpenId] = useState<string | null>(null);
  const [realtimeStatus, setRealtimeStatus] = useState<RealtimeStatus>('connecting');

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
      <div className="flex items-center gap-2">
        <ListChecks className="h-4 w-4 text-[#64ABDE]" />
        <h2 className="text-sm font-semibold text-[#1D3140]">Marcos da obra</h2>
      </div>

      {realtimeStatus === 'disconnected' && (
        <div className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] text-amber-800">
          <WifiOff className="h-3 w-3" />
          <span>Tempo real indisponível.</span>
        </div>
      )}

      <ol className="space-y-2">
        {milestones.map((m) => (
          <li key={m.id}>
            <button
              type="button"
              onClick={() => setOpenId(m.id)}
              className={cn(
                'flex w-full items-center justify-between rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-left text-sm shadow-sm transition',
                'hover:border-[#64ABDE]/50 hover:shadow',
              )}
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="inline-flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-gray-100 text-[10px] font-semibold text-gray-600">
                    {m.orderIndex}
                  </span>
                  <span className="truncate font-medium text-[#1D3140]">{m.name}</span>
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
    </section>
  );
}
