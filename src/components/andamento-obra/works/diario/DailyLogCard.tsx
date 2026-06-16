'use client';

import { useState, useTransition } from 'react';
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  History,
  Users,
  Activity,
  Layers,
  Package,
  AlertCircle,
  XCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { approveDailyLog } from '@/actions/workDailyLogs';
import type {
  WorkDailyLog,
  WorkMemberRole,
} from '@/types/works';
import { DailyLogStatusBadge } from './DailyLogStatusBadge';
import { DailyLogMediaGallery } from './DailyLogMediaGallery';
import { RejectDailyLogDialog } from './RejectDailyLogDialog';
import { DailyLogHistoryDialog } from './DailyLogHistoryDialog';
import { loadDailyLogHistory } from '@/actions/workDailyLogs';

interface DailyLogCardProps {
  log: WorkDailyLog;
  signedUrls: Record<string, string>;
  viewerRole: WorkMemberRole;
  /**
   * Se a obra esta cancelada, esconde acoes mas mantem leitura.
   */
  workStatusCancelled?: boolean;
  onChanged?: () => void;
}

export function DailyLogCard({
  log,
  signedUrls,
  viewerRole,
  workStatusCancelled,
  onChanged,
}: DailyLogCardProps) {
  const [expanded, setExpanded] = useState(log.status === 'pending_approval');
  const [rejectOpen, setRejectOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const rev = log.currentRevision;
  const dateLabel = formatLogDate(log.logDate);
  const totalMeters = rev
    ? rev.metersInstalled.BT + rev.metersInstalled.MT + rev.metersInstalled.rede
    : 0;

  function onApprove() {
    setError(null);
    startTransition(async () => {
      const result = await approveDailyLog({ dailyLogId: log.id });
      if (!result.success) {
        setError(result.error);
        return;
      }
      onChanged?.();
    });
  }

  return (
    <article className="rounded-xl border border-gray-200 bg-white shadow-sm">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-start justify-between gap-3 px-4 py-3 text-left"
        aria-expanded={expanded}
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-[#1D3140]">{dateLabel}</p>
            <DailyLogStatusBadge status={log.status} />
          </div>
          {rev && (
            <p className="mt-1 line-clamp-2 text-xs text-gray-600">
              {rev.activities}
            </p>
          )}
          <p className="mt-1 text-[11px] text-gray-400">
            {rev && rev.postsInstalledCount !== null ? (
              <span>{rev.postsInstalledCount} postes · </span>
            ) : null}
            {rev ? <span>{totalMeters.toFixed(0)} m totais</span> : null}
          </p>
        </div>
        <div className="flex flex-shrink-0 items-center gap-1 text-gray-400">
          {expanded ? (
            <ChevronUp className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
        </div>
      </button>

      {expanded && rev && (
        <div className="border-t border-gray-100 px-4 py-3 text-sm">
          <Section icon={Activity} title="Atividades realizadas">
            <p className="whitespace-pre-wrap text-gray-700">{rev.activities}</p>
          </Section>

          {rev.crewPresent.length > 0 && (
            <Section icon={Users} title={`Equipe presente (${rev.crewPresent.length})`}>
              <p className="text-gray-600">
                {rev.crewPresent.length} pessoa{rev.crewPresent.length !== 1 ? 's' : ''} registrada
                {rev.crewPresent.length !== 1 ? 's' : ''}
              </p>
            </Section>
          )}

          {(rev.metersInstalled.BT > 0
            || rev.metersInstalled.MT > 0
            || rev.metersInstalled.rede > 0
            || rev.postsInstalledCount !== null) && (
            <Section icon={Layers} title="Postes e metragem instalada">
              <ul className="space-y-1 text-gray-700">
                {rev.postsInstalledCount !== null && (
                  <li>{rev.postsInstalledCount} postes</li>
                )}
                {rev.metersInstalled.BT > 0 && <li>BT: {rev.metersInstalled.BT.toFixed(1)} m</li>}
                {rev.metersInstalled.MT > 0 && <li>MT: {rev.metersInstalled.MT.toFixed(1)} m</li>}
                {rev.metersInstalled.rede > 0 && <li>Rede: {rev.metersInstalled.rede.toFixed(1)} m</li>}
              </ul>
            </Section>
          )}

          {rev.materialsConsumed.length > 0 && (
            <Section icon={Package} title="Materiais consumidos">
              <ul className="space-y-1 text-gray-700">
                {rev.materialsConsumed.map((m, i) => (
                  <li key={`${m.name}-${i}`}>
                    {m.name} — {m.quantity} {m.unit}
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {rev.incidents && (
            <Section icon={AlertCircle} title="Intercorrências">
              <p className="whitespace-pre-wrap text-gray-700">{rev.incidents}</p>
            </Section>
          )}

          {rev.media.length > 0 && (
            <div className="mt-3">
              <DailyLogMediaGallery media={rev.media} signedUrls={signedUrls} />
            </div>
          )}

          {rev.rejectionReason && log.status === 'rejected' && (
            <div className="mt-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
              <strong className="font-semibold">Motivo da rejeição:</strong>{' '}
              {rev.rejectionReason}
            </div>
          )}

          {rev.revisionNumber > 1 && (
            <div className="mt-3 flex items-center gap-2 text-[11px] text-gray-500">
              <span>Versão #{rev.revisionNumber}</span>
              <span>·</span>
              <button
                type="button"
                onClick={() => setHistoryOpen(true)}
                className="inline-flex items-center gap-1 text-[#64ABDE] hover:underline"
              >
                <History className="h-3 w-3" /> Ver histórico de versões
              </button>
            </div>
          )}

          {error && (
            <p role="alert" className="mt-3 text-xs text-red-600">
              {error}
            </p>
          )}

          {!workStatusCancelled && (
            <CardFooter
              status={log.status}
              viewerRole={viewerRole}
              isPending={isPending}
              onApprove={onApprove}
              onReject={() => setRejectOpen(true)}
              approvedAt={log.approvedAt}
              rejectedAt={log.rejectedAt}
            />
          )}
        </div>
      )}

      <RejectDailyLogDialog
        open={rejectOpen}
        onOpenChange={setRejectOpen}
        dailyLogId={log.id}
        onRejected={() => onChanged?.()}
      />
      <DailyLogHistoryDialog
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        dailyLogId={log.id}
        dateLabel={dateLabel}
        loadHistory={async (id) => {
          const result = await loadDailyLogHistory(id);
          if (!result.success || !result.data) {
            throw new Error(result.success ? 'Sem dados' : result.error);
          }
          return { history: result.data.history, signedUrls: result.data.signedUrls };
        }}
      />
    </article>
  );
}

function Section({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof CheckCircle2;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-3 first:mt-0">
      <h4 className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
        <Icon className="h-3 w-3" />
        {title}
      </h4>
      <div className="text-xs">{children}</div>
    </div>
  );
}

function CardFooter({
  status,
  viewerRole,
  isPending,
  onApprove,
  onReject,
  approvedAt,
  rejectedAt,
}: {
  status: WorkDailyLog['status'];
  viewerRole: WorkMemberRole;
  isPending: boolean;
  onApprove: () => void;
  onReject: () => void;
  approvedAt: string | null;
  rejectedAt: string | null;
}) {
  if (status === 'approved') {
    return (
      <div className="mt-3 flex items-center gap-2 text-xs text-emerald-700">
        <CheckCircle2 className="h-3.5 w-3.5" />
        <span>
          Aprovado{approvedAt ? ` em ${new Date(approvedAt).toLocaleString('pt-BR')}` : ''}
        </span>
      </div>
    );
  }
  if (status === 'rejected') {
    return (
      <div className="mt-3 flex items-center gap-2 text-xs text-red-700">
        <XCircle className="h-3.5 w-3.5" />
        <span>
          Rejeitado{rejectedAt ? ` em ${new Date(rejectedAt).toLocaleString('pt-BR')}` : ''}
          {viewerRole === 'manager' && ' — aguardando republicação.'}
        </span>
      </div>
    );
  }
  if (viewerRole === 'engineer') {
    return (
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onApprove}
          disabled={isPending}
          className={cn(
            'rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white',
            'hover:bg-emerald-700 disabled:opacity-50',
          )}
        >
          {isPending ? 'Aprovando...' : 'Aprovar'}
        </button>
        <button
          type="button"
          onClick={onReject}
          disabled={isPending}
          className="rounded-md border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
        >
          Rejeitar
        </button>
      </div>
    );
  }
  return (
    <p className="mt-3 text-xs text-gray-500">
      Aguardando aprovação do engenheiro.
    </p>
  );
}

function formatLogDate(d: string): string {
  // d esta em YYYY-MM-DD (DATE no Postgres). Construimos via UTC para evitar
  // shift por timezone e exibimos no locale BR.
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d);
  if (!m) return d;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const da = Number(m[3]);
  const dt = new Date(Date.UTC(y, mo - 1, da));
  return dt.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    weekday: 'short',
    timeZone: 'UTC',
  });
}
