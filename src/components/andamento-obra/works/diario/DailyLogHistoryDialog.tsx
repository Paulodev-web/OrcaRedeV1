'use client';

import { useEffect, useState } from 'react';
import { History } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type {
  WorkDailyLogRevision,
  WorkDailyLogWithHistory,
} from '@/types/works';
import { DailyLogMediaGallery } from './DailyLogMediaGallery';

interface DailyLogHistoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dailyLogId: string;
  dateLabel: string;
  /**
   * Loader para buscar o historico via Server Action / fetch. Implementado
   * como prop para evitar acoplar a Dialog ao Server Component diretamente.
   */
  loadHistory: (dailyLogId: string) => Promise<{
    history: WorkDailyLogWithHistory | null;
    signedUrls: Record<string, string>;
  }>;
}

export function DailyLogHistoryDialog({
  open,
  onOpenChange,
  dailyLogId,
  dateLabel,
  loadHistory,
}: DailyLogHistoryDialogProps) {
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<WorkDailyLogWithHistory | null>(null);
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const { history: h, signedUrls: urls } = await loadHistory(dailyLogId);
        setHistory(h);
        setSignedUrls(urls);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Falha ao carregar histórico.');
      } finally {
        setLoading(false);
      }
    })();
  }, [open, dailyLogId, loadHistory]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-4 w-4" /> Histórico de versões — {dateLabel}
          </DialogTitle>
          <DialogDescription>
            Cada versão é uma publicação do gerente. A mais recente está no topo.
          </DialogDescription>
        </DialogHeader>

        <div className="overflow-auto px-6 py-4">
          {loading && (
            <p className="text-sm text-gray-500">Carregando histórico...</p>
          )}
          {error && <p className="text-sm text-red-600">{error}</p>}
          {!loading && !error && history && (
            <ol className="space-y-4">
              {history.revisions.map((rev) => (
                <RevisionItem
                  key={rev.id}
                  revision={rev}
                  isCurrent={rev.id === history.currentRevisionId}
                  signedUrls={signedUrls}
                />
              ))}
            </ol>
          )}
          {!loading && !error && history && history.revisions.length === 0 && (
            <p className="text-sm text-gray-500">Nenhuma revisão encontrada.</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function RevisionItem({
  revision,
  isCurrent,
  signedUrls,
}: {
  revision: WorkDailyLogRevision;
  isCurrent: boolean;
  signedUrls: Record<string, string>;
}) {
  const created = new Date(revision.createdAt);
  return (
    <li className="rounded-lg border border-gray-200 bg-white p-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-sm font-semibold text-[#1D3140]">
          Versão #{revision.revisionNumber}
        </p>
        <div className="flex items-center gap-2 text-[11px]">
          {isCurrent && (
            <span className="rounded-full bg-[#64ABDE]/15 px-2 py-0.5 font-medium text-[#1D3140]">
              Atual
            </span>
          )}
          <span className="text-gray-400">
            {created.toLocaleString('pt-BR')}
          </span>
        </div>
      </div>
      {revision.rejectionReason && (
        <p className="mb-2 rounded-md bg-red-50 px-2 py-1 text-[12px] text-red-700">
          <strong className="font-semibold">Motivo da rejeição:</strong>{' '}
          {revision.rejectionReason}
        </p>
      )}
      <p className="whitespace-pre-wrap text-sm text-gray-700">
        {revision.activities}
      </p>
      {revision.media.length > 0 && (
        <div className="mt-2">
          <DailyLogMediaGallery media={revision.media} signedUrls={signedUrls} />
        </div>
      )}
    </li>
  );
}
