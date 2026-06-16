'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  acknowledgeAlert,
  closeAlert,
  reopenAlert,
  addAlertComment,
} from '@/actions/workAlerts';
import type { WorkAlertWithHistory } from '@/types/works';
import { ALERT_SEVERITY_LABELS, ALERT_CATEGORY_LABELS, ALERT_STATUS_LABELS } from '@/types/works';
import { AlertSeverityBadge } from './AlertSeverityBadge';
import { AlertStatusBadge } from './AlertStatusBadge';

interface Props {
  alertId: string;
  workId: string;
  role: string;
  onClose: () => void;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const hours = Math.floor(diff / (1000 * 60 * 60));
  if (hours < 1) return 'há poucos minutos';
  if (hours < 24) return `há ${hours}h`;
  const days = Math.floor(hours / 24);
  return `há ${days}d`;
}

const UPDATE_TYPE_LABELS: Record<string, string> = {
  opened: 'Alerta aberto',
  in_progress: 'Reconhecido pelo engenheiro',
  resolved_in_field: 'Resolvido em campo',
  reopened: 'Reaberto',
  closed: 'Encerrado',
  comment: 'Comentário',
};

export function AlertDetailsDrawer({ alertId, workId, role, onClose }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [data, setData] = useState<{ alert: WorkAlertWithHistory; signedUrls: Record<string, string> } | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionError, setActionError] = useState<string | null>(null);
  const [commentText, setCommentText] = useState('');
  const [closureNotes, setClosureNotes] = useState('');
  const [reopenReason, setReopenReason] = useState('');
  const [showCloseForm, setShowCloseForm] = useState(false);
  const [showReopenForm, setShowReopenForm] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/alert-details?alertId=${alertId}&workId=${workId}`);
        if (!res.ok) throw new Error('Falha ao carregar');
        const json = await res.json();
        if (!cancelled) setData(json);
      } catch {
        if (!cancelled) setData(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [alertId, workId]);

  const handleAcknowledge = () => {
    setActionError(null);
    startTransition(async () => {
      const result = await acknowledgeAlert({ alertId });
      if (!result.success) setActionError(result.error ?? 'Erro.');
      else { onClose(); router.refresh(); }
    });
  };

  const handleClose = () => {
    setActionError(null);
    if (closureNotes.trim().length < 5) {
      setActionError('Notas de encerramento obrigatórias (mínimo 5 caracteres).');
      return;
    }
    startTransition(async () => {
      const result = await closeAlert({ alertId, closureNotes: closureNotes.trim() });
      if (!result.success) setActionError(result.error ?? 'Erro.');
      else { onClose(); router.refresh(); }
    });
  };

  const handleReopen = () => {
    setActionError(null);
    if (reopenReason.trim().length < 5) {
      setActionError('Motivo obrigatório (mínimo 5 caracteres).');
      return;
    }
    startTransition(async () => {
      const result = await reopenAlert({ alertId, reason: reopenReason.trim() });
      if (!result.success) setActionError(result.error ?? 'Erro.');
      else { onClose(); router.refresh(); }
    });
  };

  const handleComment = () => {
    setActionError(null);
    if (!commentText.trim()) return;
    startTransition(async () => {
      const result = await addAlertComment({ alertId, notes: commentText.trim() });
      if (!result.success) setActionError(result.error ?? 'Erro.');
      else { setCommentText(''); router.refresh(); onClose(); }
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-end">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative h-full w-full max-w-lg overflow-y-auto bg-white shadow-xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-200 bg-white px-6 py-4">
          <h2 className="text-lg font-semibold text-[#1D3140]">Detalhes do Alerta</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            aria-label="Fechar"
          >
            ✕
          </button>
        </div>

        <div className="px-6 py-4">
          {loading && <p className="text-sm text-gray-500">Carregando...</p>}

          {!loading && !data && (
            <p className="text-sm text-red-600">Falha ao carregar detalhes do alerta.</p>
          )}

          {!loading && data && (
            <div className="space-y-4">
              <div>
                <h3 className="text-base font-semibold text-[#1D3140]">{data.alert.title}</h3>
                <div className="mt-1 flex items-center gap-2">
                  <AlertSeverityBadge severity={data.alert.severity} />
                  <AlertStatusBadge status={data.alert.status} />
                  <span className="text-xs text-gray-500">{timeAgo(data.alert.createdAt)}</span>
                </div>
                <p className="mt-1 text-xs text-gray-500">
                  {ALERT_CATEGORY_LABELS[data.alert.category]}
                </p>
              </div>

              <p className="text-sm text-gray-700">{data.alert.description}</p>

              {data.alert.gpsLat && data.alert.gpsLng && (
                <a
                  href={`https://maps.google.com/?q=${data.alert.gpsLat},${data.alert.gpsLng}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-[#64ABDE] hover:underline"
                >
                  Abrir no mapa
                </a>
              )}

              {data.alert.media.length > 0 && (
                <div>
                  <p className="mb-1 text-xs font-medium text-gray-500">Fotos da abertura</p>
                  <div className="flex flex-wrap gap-2">
                    {data.alert.media.map((m) => (
                      <div key={m.id} className="h-16 w-16 rounded bg-gray-200 text-[10px] text-gray-400 flex items-center justify-center">
                        {m.kind === 'image' ? '📷' : '🎬'}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <h4 className="mb-2 text-sm font-semibold text-gray-700">Timeline</h4>
                <div className="space-y-2">
                  {data.alert.updates.map((u) => (
                    <div key={u.id} className="rounded border border-gray-100 bg-gray-50 p-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-[#1D3140]">
                          {UPDATE_TYPE_LABELS[u.updateType] ?? u.updateType}
                        </span>
                        <span className="text-[10px] text-gray-400">
                          {new Date(u.createdAt).toLocaleString('pt-BR')}
                        </span>
                      </div>
                      {u.notes && <p className="mt-1 text-xs text-gray-600">{u.notes}</p>}
                      {u.media.length > 0 && (
                        <p className="mt-1 text-[10px] text-gray-400">
                          {u.media.length} {u.media.length === 1 ? 'anexo' : 'anexos'}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {actionError && <p className="text-sm text-red-600">{actionError}</p>}

              <div className="space-y-2 border-t border-gray-200 pt-3">
                {role === 'engineer' && data.alert.status === 'open' && (
                  <button
                    type="button"
                    onClick={handleAcknowledge}
                    disabled={pending}
                    className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    Reconhecer
                  </button>
                )}

                {role === 'engineer' && data.alert.status === 'resolved_in_field' && !showCloseForm && !showReopenForm && (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setShowCloseForm(true)}
                      className="flex-1 rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700"
                    >
                      Confirmar encerramento
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowReopenForm(true)}
                      className="flex-1 rounded-md border border-red-200 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
                    >
                      Reabrir
                    </button>
                  </div>
                )}

                {role === 'engineer' && data.alert.status === 'closed' && !showReopenForm && (
                  <button
                    type="button"
                    onClick={() => setShowReopenForm(true)}
                    className="w-full rounded-md border border-red-200 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
                  >
                    Reabrir
                  </button>
                )}

                {showCloseForm && (
                  <div className="space-y-2 rounded border border-gray-200 p-3">
                    <label className="block text-xs font-medium text-gray-700">Notas de encerramento *</label>
                    <textarea
                      rows={2}
                      value={closureNotes}
                      onChange={(e) => setClosureNotes(e.target.value)}
                      className="block w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
                    />
                    <div className="flex gap-2">
                      <button type="button" onClick={handleClose} disabled={pending} className="rounded bg-green-600 px-3 py-1.5 text-xs text-white disabled:opacity-50">Encerrar</button>
                      <button type="button" onClick={() => setShowCloseForm(false)} className="rounded border px-3 py-1.5 text-xs">Cancelar</button>
                    </div>
                  </div>
                )}

                {showReopenForm && (
                  <div className="space-y-2 rounded border border-gray-200 p-3">
                    <label className="block text-xs font-medium text-gray-700">Motivo da reabertura *</label>
                    <textarea
                      rows={2}
                      value={reopenReason}
                      onChange={(e) => setReopenReason(e.target.value)}
                      className="block w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
                    />
                    <div className="flex gap-2">
                      <button type="button" onClick={handleReopen} disabled={pending} className="rounded bg-red-600 px-3 py-1.5 text-xs text-white disabled:opacity-50">Reabrir</button>
                      <button type="button" onClick={() => setShowReopenForm(false)} className="rounded border px-3 py-1.5 text-xs">Cancelar</button>
                    </div>
                  </div>
                )}

                <div className="flex gap-2">
                  <input
                    type="text"
                    value={commentText}
                    onChange={(e) => setCommentText(e.target.value)}
                    placeholder="Adicionar comentário..."
                    className="flex-1 rounded border border-gray-300 px-3 py-1.5 text-sm"
                  />
                  <button
                    type="button"
                    onClick={handleComment}
                    disabled={pending || !commentText.trim()}
                    className="rounded bg-[#1D3140] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                  >
                    Enviar
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
