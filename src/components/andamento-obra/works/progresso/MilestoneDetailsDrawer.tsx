'use client';

import { useEffect, useState, useTransition } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import {
  Activity,
  CheckCircle2,
  Clock,
  History,
  Loader2,
  PlayCircle,
  X,
  XCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  approveMilestone,
  setMilestoneInProgress,
} from '@/actions/workMilestones';
import type {
  MilestoneEventType,
  MilestoneFullHistory,
  WorkMemberRole,
  WorkMilestoneEvent,
  WorkMilestoneWithApproval,
} from '@/types/works';
import { ImageLightbox } from '../shared/ImageLightbox';
import { MilestoneStatusBadge } from './MilestoneStatusBadge';
import { ReportMilestoneDialog } from './ReportMilestoneDialog';
import { RejectMilestoneDialog } from './RejectMilestoneDialog';

interface MilestoneDetailsDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workId: string;
  milestone: WorkMilestoneWithApproval;
  viewerRole: WorkMemberRole;
  workStatusCancelled?: boolean;
  loadHistory: (milestoneId: string) => Promise<{
    history: MilestoneFullHistory | null;
    signedUrls: Record<string, string>;
  }>;
  onChanged?: () => void;
}

export function MilestoneDetailsDrawer({
  open,
  onOpenChange,
  workId,
  milestone,
  viewerRole,
  workStatusCancelled,
  loadHistory,
  onChanged,
}: MilestoneDetailsDrawerProps) {
  const [history, setHistory] = useState<MilestoneFullHistory | null>(null);
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [lightbox, setLightbox] = useState<{ urls: string[]; index: number } | null>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const { history: h, signedUrls: u } = await loadHistory(milestone.id);
        setHistory(h);
        setSignedUrls(u);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Falha ao carregar histórico.');
      } finally {
        setLoading(false);
      }
    })();
  }, [open, milestone.id, loadHistory]);

  function refresh() {
    onChanged?.();
    // recarrega historico inline
    setLoading(true);
    void (async () => {
      try {
        const { history: h, signedUrls: u } = await loadHistory(milestone.id);
        setHistory(h);
        setSignedUrls(u);
      } finally {
        setLoading(false);
      }
    })();
  }

  function onApprove() {
    setError(null);
    startTransition(async () => {
      const result = await approveMilestone({ milestoneId: milestone.id });
      if (!result.success) {
        setError(result.error);
        return;
      }
      refresh();
    });
  }

  function onMarkInProgress() {
    setError(null);
    startTransition(async () => {
      const result = await setMilestoneInProgress({ milestoneId: milestone.id });
      if (!result.success) {
        setError(result.error);
        return;
      }
      refresh();
    });
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40" />
        <Dialog.Content
          className={cn(
            'fixed right-0 top-0 z-50 flex h-full w-full max-w-lg flex-col overflow-hidden bg-white shadow-2xl',
            'border-l border-gray-200',
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=open]:slide-in-from-right data-[state=closed]:slide-out-to-right',
          )}
          aria-describedby={undefined}
        >
          <div className="flex items-start justify-between border-b border-gray-200 px-5 py-4">
            <div>
              <Dialog.Title className="text-lg font-semibold text-[#1D3140]">
                {milestone.name}
              </Dialog.Title>
              <div className="mt-1">
                <MilestoneStatusBadge status={milestone.status} />
              </div>
            </div>
            <Dialog.Close
              aria-label="Fechar"
              className="rounded-md p-1 text-gray-500 hover:bg-gray-100"
            >
              <X className="h-4 w-4" />
            </Dialog.Close>
          </div>

          <div className="flex-1 overflow-auto px-5 py-4">
            {milestone.notes && (
              <Section icon={Activity} title="Observação do gerente">
                <p className="whitespace-pre-wrap text-sm text-gray-700">{milestone.notes}</p>
              </Section>
            )}

            {milestone.rejectionReason && milestone.status === 'rejected' && (
              <div className="mb-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
                <strong className="font-semibold">Motivo da rejeição:</strong>{' '}
                {milestone.rejectionReason}
              </div>
            )}

            <Section icon={History} title="Histórico">
              {loading && (
                <p className="flex items-center gap-2 text-sm text-gray-500">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Carregando...
                </p>
              )}
              {error && <p className="text-sm text-red-600">{error}</p>}
              {!loading && !error && history && history.events.length === 0 && (
                <p className="text-sm text-gray-500">Sem eventos registrados.</p>
              )}
              {!loading && !error && history && history.events.length > 0 && (
                <ol className="space-y-3">
                  {history.events.map((ev) => (
                    <EventItem
                      key={ev.id}
                      event={ev}
                      signedUrls={signedUrls}
                      onOpenLightbox={(urls, index) => setLightbox({ urls, index })}
                    />
                  ))}
                </ol>
              )}
            </Section>
          </div>

          {!workStatusCancelled && (
            <DrawerActions
              status={milestone.status}
              viewerRole={viewerRole}
              isPending={isPending}
              onApprove={onApprove}
              onReject={() => setRejectOpen(true)}
              onReport={() => setReportOpen(true)}
              onMarkInProgress={onMarkInProgress}
              error={error}
            />
          )}
        </Dialog.Content>
      </Dialog.Portal>

      <ReportMilestoneDialog
        open={reportOpen}
        onOpenChange={setReportOpen}
        workId={workId}
        milestoneId={milestone.id}
        milestoneName={milestone.name}
        onReported={refresh}
      />
      <RejectMilestoneDialog
        open={rejectOpen}
        onOpenChange={setRejectOpen}
        milestoneId={milestone.id}
        milestoneName={milestone.name}
        onRejected={refresh}
      />
      {lightbox && (
        <ImageLightbox
          open
          onOpenChange={(o) => !o && setLightbox(null)}
          images={lightbox.urls}
          initialIndex={lightbox.index}
        />
      )}
    </Dialog.Root>
  );
}

function Section({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof Activity;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-4">
      <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
        <Icon className="h-3 w-3" />
        {title}
      </h3>
      {children}
    </div>
  );
}

const EVENT_TYPE_ICON: Record<MilestoneEventType, typeof Clock> = {
  reported: PlayCircle,
  approved: CheckCircle2,
  rejected: XCircle,
  reset: Clock,
};

const EVENT_TYPE_LABEL: Record<MilestoneEventType, string> = {
  reported: 'Reportado',
  approved: 'Aprovado',
  rejected: 'Rejeitado',
  reset: 'Reaberto',
};

function EventItem({
  event,
  signedUrls,
  onOpenLightbox,
}: {
  event: WorkMilestoneEvent;
  signedUrls: Record<string, string>;
  onOpenLightbox: (urls: string[], index: number) => void;
}) {
  const Icon = EVENT_TYPE_ICON[event.eventType];
  const dt = new Date(event.createdAt);
  const images = event.media.filter((m) => m.kind === 'image');
  const imageUrls = images
    .map((m) => signedUrls[m.storagePath])
    .filter((u): u is string => Boolean(u));

  return (
    <li className="rounded-lg border border-gray-200 p-3">
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="inline-flex items-center gap-1 font-medium text-[#1D3140]">
          <Icon className="h-3.5 w-3.5" /> {EVENT_TYPE_LABEL[event.eventType]} ·{' '}
          {event.actorRole === 'engineer' ? 'engenheiro' : 'gerente'}
        </span>
        <span className="text-gray-400">{dt.toLocaleString('pt-BR')}</span>
      </div>
      {event.notes && (
        <p className="whitespace-pre-wrap text-sm text-gray-700">{event.notes}</p>
      )}
      {event.media.length > 0 && (
        <div className="mt-2 grid grid-cols-3 gap-2">
          {event.media.map((m) => {
            const url = signedUrls[m.storagePath];
            if (!url) {
              return (
                <div
                  key={m.id}
                  className="flex aspect-square items-center justify-center rounded-md border border-dashed border-gray-200 bg-gray-50 text-[10px] text-gray-400"
                >
                  Indisponível
                </div>
              );
            }
            if (m.kind === 'image') {
              const idx = images.findIndex((im) => im.id === m.id);
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => onOpenLightbox(imageUrls, idx)}
                  className="aspect-square overflow-hidden rounded-md border border-gray-200 bg-gray-100"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={url}
                    alt="Evidência"
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                </button>
              );
            }
            return (
              <video
                key={m.id}
                controls
                src={url}
                preload="metadata"
                className="aspect-square w-full rounded-md object-cover"
              />
            );
          })}
        </div>
      )}
    </li>
  );
}

function DrawerActions({
  status,
  viewerRole,
  isPending,
  onApprove,
  onReject,
  onReport,
  onMarkInProgress,
  error,
}: {
  status: WorkMilestoneWithApproval['status'];
  viewerRole: WorkMemberRole;
  isPending: boolean;
  onApprove: () => void;
  onReject: () => void;
  onReport: () => void;
  onMarkInProgress: () => void;
  error: string | null;
}) {
  return (
    <footer className="border-t border-gray-200 bg-gray-50 px-5 py-3">
      {error && <p className="mb-2 text-xs text-red-600">{error}</p>}
      <div className="flex flex-wrap items-center gap-2">
        {viewerRole === 'engineer' && status === 'awaiting_approval' && (
          <>
            <button
              type="button"
              onClick={onApprove}
              disabled={isPending}
              className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {isPending ? 'Aprovando...' : 'Aprovar'}
            </button>
            <button
              type="button"
              onClick={onReject}
              disabled={isPending}
              className="rounded-md border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
            >
              Reprovar
            </button>
          </>
        )}
        {viewerRole === 'manager' && (status === 'pending' || status === 'in_progress' || status === 'rejected') && (
          <>
            {status === 'pending' && (
              <button
                type="button"
                onClick={onMarkInProgress}
                disabled={isPending}
                className="rounded-md border border-sky-200 bg-white px-3 py-1.5 text-xs font-semibold text-sky-700 hover:bg-sky-50 disabled:opacity-50"
              >
                {isPending ? 'Atualizando...' : 'Marcar em andamento'}
              </button>
            )}
            <button
              type="button"
              onClick={onReport}
              disabled={isPending}
              className="rounded-md bg-[#64ABDE] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#5599c4] disabled:opacity-50"
            >
              Reportar conclusão
            </button>
          </>
        )}
        {status === 'approved' && (
          <p className="text-xs font-medium text-emerald-700">Marco aprovado.</p>
        )}
        {viewerRole === 'engineer' && status !== 'awaiting_approval' && status !== 'approved' && (
          <p className="text-xs text-gray-500">
            Aguardando o gerente reportar a conclusão.
          </p>
        )}
      </div>
    </footer>
  );
}
