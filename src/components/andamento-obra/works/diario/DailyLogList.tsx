'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ClipboardList } from 'lucide-react';
import { useRealtimeChannel, type RealtimeEventConfig } from '@/lib/hooks/useRealtimeChannel';
import { loadDailyLogHistory, getOlderDailyLogs } from '@/actions/workDailyLogs';
import type {
  WorkDailyLog,
  WorkMemberRole,
  WorkStatus,
} from '@/types/works';
import { LoadMoreButton } from '../shared/LoadMoreButton';
import { RealtimeStatusBanner } from '../shared/RealtimeStatusBanner';
import { DailyLogCard } from './DailyLogCard';
import {
  DailyLogFilters,
  type DailyLogFiltersValue,
} from './DailyLogFilters';

interface DailyLogListProps {
  workId: string;
  workStatus: WorkStatus;
  viewerRole: WorkMemberRole;
  initialItems: WorkDailyLog[];
  initialHasMore: boolean;
  initialSignedUrls: Record<string, string>;
}

export function DailyLogList({
  workId,
  workStatus,
  viewerRole,
  initialItems,
  initialHasMore,
  initialSignedUrls,
}: DailyLogListProps) {
  const router = useRouter();
  const [items, setItems] = useState<WorkDailyLog[]>(initialItems);
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>(initialSignedUrls);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [filters, setFilters] = useState<DailyLogFiltersValue>({
    status: 'all',
    month: null,
  });

  const itemsRef = useRef<WorkDailyLog[]>(initialItems);
  itemsRef.current = items;

  // -------------------------------------------------------------------------
  // Hidrata um diario por id: busca historico (current revision + media) com
  // retry 3x para cobrir gap entre INSERT da revision e INSERT do media batch.
  // -------------------------------------------------------------------------
  const hydrateDailyLog = useCallback(
    async (dailyLogId: string) => {
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const result = await loadDailyLogHistory(dailyLogId);
        if (result.success && result.data) {
          const { history, signedUrls: urls } = result.data;
          // Se a revisao atual nao tem midia mas o historico ainda nao a
          // espelhou, tenta de novo.
          const currentMedia = history.currentRevision?.media ?? [];
          if (
            currentMedia.length === 0
            && history.revisions[0]?.id === history.currentRevisionId
            && attempt < 2
          ) {
            await sleep(250);
            continue;
          }
          setSignedUrls((prev) => ({ ...prev, ...urls }));
          setItems((prev) => {
            const existing = prev.findIndex((i) => i.id === history.id);
            if (existing >= 0) {
              const next = prev.slice();
              next[existing] = {
                id: history.id,
                workId: history.workId,
                logDate: history.logDate,
                publishedBy: history.publishedBy,
                currentRevisionId: history.currentRevisionId,
                status: history.status,
                approvedBy: history.approvedBy,
                approvedAt: history.approvedAt,
                rejectedAt: history.rejectedAt,
                createdAt: history.createdAt,
                updatedAt: history.updatedAt,
                currentRevision: history.currentRevision,
              };
              return next;
            }
            return [
              {
                id: history.id,
                workId: history.workId,
                logDate: history.logDate,
                publishedBy: history.publishedBy,
                currentRevisionId: history.currentRevisionId,
                status: history.status,
                approvedBy: history.approvedBy,
                approvedAt: history.approvedAt,
                rejectedAt: history.rejectedAt,
                createdAt: history.createdAt,
                updatedAt: history.updatedAt,
                currentRevision: history.currentRevision,
              },
              ...prev,
            ].sort((a, b) => b.logDate.localeCompare(a.logDate));
          });
          return;
        }
        if (attempt < 2) await sleep(250);
      }
    },
    [],
  );

  // -------------------------------------------------------------------------
  // Realtime via useRealtimeChannel hook
  // -------------------------------------------------------------------------
  const handleRevisionInsert = useCallback(
    (payload: unknown) => {
      const row = (payload as { new?: { daily_log_id?: string } })?.new;
      if (row?.daily_log_id) void hydrateDailyLog(row.daily_log_id);
    },
    [hydrateDailyLog],
  );

  const handleLogUpdate = useCallback(
    (payload: unknown) => {
      const row = (payload as { new?: { id?: string } })?.new;
      if (row?.id) void hydrateDailyLog(row.id);
    },
    [hydrateDailyLog],
  );

  const realtimeEvents: RealtimeEventConfig[] = useMemo(
    () => [
      {
        event: 'INSERT',
        table: 'work_daily_log_revisions',
        callback: handleRevisionInsert,
      },
      {
        event: 'UPDATE',
        table: 'work_daily_logs',
        filter: `work_id=eq.${workId}`,
        callback: handleLogUpdate,
      },
    ],
    [workId, handleRevisionInsert, handleLogUpdate],
  );

  const { status: realtimeStatus } = useRealtimeChannel({
    channelName: `work:${workId}:events`,
    events: realtimeEvents,
  });

  // -------------------------------------------------------------------------
  // Aplicacao dos filtros (puro client; lista pequena por enquanto)
  // -------------------------------------------------------------------------
  const monthOptions = useMemo(() => {
    const set = new Set<string>();
    const now = new Date();
    // Inclui mes atual + 5 anteriores
    for (let i = 0; i < 6; i += 1) {
      const dt = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
      const y = dt.getUTCFullYear();
      const m = String(dt.getUTCMonth() + 1).padStart(2, '0');
      set.add(`${y}-${m}`);
    }
    // Tambem inclui meses presentes em items.
    for (const it of items) {
      set.add(it.logDate.slice(0, 7));
    }
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [items]);

  const filtered = useMemo(() => {
    return items.filter((i) => {
      if (filters.status !== 'all' && i.status !== filters.status) return false;
      if (filters.month && !i.logDate.startsWith(filters.month)) return false;
      return true;
    });
  }, [items, filters]);

  async function handleLoadOlder() {
    if (loadingOlder || items.length === 0) return;
    const oldest = items[items.length - 1];
    setLoadingOlder(true);
    try {
      const result = await getOlderDailyLogs(workId, oldest.logDate);
      if (result.success && result.data) {
        const { items: olderItems, hasMore: more, signedUrls: urls } = result.data;
        if (olderItems.length > 0) {
          setItems((prev) => {
            const ids = new Set(prev.map((i) => i.id));
            return [...prev, ...olderItems.filter((i) => !ids.has(i.id))].sort(
              (a, b) => b.logDate.localeCompare(a.logDate),
            );
          });
          setSignedUrls((prev) => ({ ...prev, ...urls }));
        }
        setHasMore(more);
      }
    } finally {
      setLoadingOlder(false);
    }
  }

  function onChanged() {
    // Apos approve/reject, recarrega o item via Realtime; tambem revalida
    // a rota para refletir o KPI/header. revalidatePath na action ja cuida
    // do server, mas o router refresh garante UI sincronizada.
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-[#1D3140]">Diário de obra</h1>
          <p className="text-xs text-gray-500">
            Registro diário publicado pelo gerente. O engenheiro aprova ou rejeita.
          </p>
        </div>
      </header>

      <RealtimeStatusBanner status={realtimeStatus} />

      <DailyLogFilters value={filters} onChange={setFilters} monthOptions={monthOptions} />

      {filtered.length === 0 ? (
        <EmptyState />
      ) : (
        <ol className="space-y-3">
          {filtered.map((log) => (
            <li key={log.id}>
              <DailyLogCard
                log={log}
                signedUrls={signedUrls}
                viewerRole={viewerRole}
                workStatusCancelled={workStatus === 'cancelled'}
                onChanged={onChanged}
              />
            </li>
          ))}
        </ol>
      )}

      <LoadMoreButton
        hasMore={hasMore}
        loading={loadingOlder}
        onLoadMore={() => void handleLoadOlder()}
        label="Carregar diários anteriores"
      />

      {process.env.NODE_ENV === 'development' && (
        <DevSimulationHint workId={workId} />
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-xl border border-dashed border-gray-200 bg-white p-8 text-center">
      <ClipboardList className="mx-auto h-8 w-8 text-gray-400" />
      <p className="mt-2 text-sm font-medium text-[#1D3140]">
        Nenhum diário publicado ainda.
      </p>
      <p className="mt-1 text-xs text-gray-500">
        O gerente publicará registros via APK; aprovações e revisões aparecerão aqui.
      </p>
    </div>
  );
}

function DevSimulationHint({ workId }: { workId: string }) {
  return (
    <details className="rounded-md border border-dashed border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
      <summary className="cursor-pointer font-semibold">
        DEV: simular publicação de diário
      </summary>
      <p className="mt-2">
        O gerente real publica via APK (futuro). Para testar este fluxo agora,
        use o helper SQL em{' '}
        <code className="rounded bg-amber-100 px-1">
          supabase/dev-helpers/simulate_manager_daily_log.sql
        </code>{' '}
        substituindo work_id por <code className="rounded bg-amber-100 px-1">{workId}</code>.
      </p>
    </details>
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
