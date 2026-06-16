'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Eye,
  FileText,
  Loader2,
  Trash2,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { deleteUploadedPdfAction, markExtractionJobsErrorAction } from '@/actions/quotationSessions';
import { supabase } from '@/lib/supabaseClient';
import type { ExtractionJobRow } from '@/actions/quotationSessions';
import BatchDropzoneManager from '@/components/suppliers/BatchDropzoneManager';
import ExtractionCurationModal from '@/components/suppliers/ExtractionCurationModal';
import { getSupplierDisplayName } from '@/lib/supplierDisplay';
import { storageFileNameFromPath } from '@/lib/quoteDisplay';
import { MAX_PDFS_PER_QUOTATION } from '@/lib/suppliesLimits';
import {
  EXTRACT_STUCK_ERROR_MS,
  EXTRACT_UI_STUCK_MS,
  PIPELINE_MAX_RECOVERY_ATTEMPTS,
  PIPELINE_RECOVERY_COOLDOWN_MS,
} from '@/lib/extractionPipelineConfig';

interface QuoteRow {
  id: string;
  supplier_name: string;
  status: string;
  created_at: string;
  extraction_validated_at?: string | null;
}

interface Props {
  sessionId: string;
  sessionStatus: 'active' | 'completed';
  initialJobs: ExtractionJobRow[];
  initialQuotes: QuoteRow[];
  onAllProcessed?: () => void;
  onJobsChange?: (jobs: ExtractionJobRow[]) => void;
}

function fileLabel(path: string): string {
  const label = storageFileNameFromPath(path) || path.split('/').pop() || path;
  return label.length > 48 ? `${label.slice(0, 44)}…` : label;
}

function phaseLabel(phase: string): string {
  switch (phase) {
    case 'extract': return 'extraindo';
    case 'post_extract': return 'pós-extração';
    case 'match': return 'conciliando';
    case 'finalize': return 'finalizando';
    default: return phase;
  }
}

const DELETE_PDF_CONFIRM_MESSAGE =
  'Excluir esta cotação? Serão removidos a cotação, todos os itens extraídos, a conciliação, seleções do cenário ideal e o arquivo. Os cenários A/B serão recalculados sem este fornecedor. Esta ação não pode ser desfeita.';

function JobStatusIcon({ status }: { status: ExtractionJobRow['status'] }) {
  switch (status) {
    case 'pending':
      return <Clock className="h-4 w-4 text-amber-500" />;
    case 'processing':
      return <Loader2 className="h-4 w-4 animate-spin text-[#64ABDE]" />;
    case 'completed':
      return <CheckCircle2 className="h-4 w-4 text-emerald-600" />;
    case 'error':
      return <XCircle className="h-4 w-4 text-red-500" />;
    default:
      return null;
  }
}

export default function SessionExtractionRealtime({
  sessionId,
  sessionStatus,
  initialJobs,
  initialQuotes,
  onAllProcessed,
  onJobsChange,
}: Props) {
  const router = useRouter();
  const [jobs, setJobs] = useState<ExtractionJobRow[]>(initialJobs);
  const [quotes, setQuotes] = useState<QuoteRow[]>(initialQuotes);
  const [curationQuoteId, setCurationQuoteId] = useState<string | null>(null);
  const [curationSupplier, setCurationSupplier] = useState('');
  const [deletingKey, setDeletingKey] = useState<string | null>(null);

  const hadProcessingRef = useRef(false);
  const toastFiredRef = useRef(false);
  const notifiedErrorJobIdsRef = useRef<Set<string>>(new Set());
  const transientErrorTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  // Recovery timers para pipeline travado (post_extract / match).
  // Usa cooldown em vez de bloqueio permanente: permite até MAX tentativas com intervalo entre elas.
  // Isso garante recuperação de cadeia quebrada por timeout do Vercel sem criar loop infinito.
  const postExtractTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const postExtractAttemptsRef = useRef<Map<string, number>>(new Map()); // tentativas por job
  const postExtractLastFireRef = useRef<Map<string, number>>(new Map()); // timestamp da última tentativa
  // Extract-stuck: bloqueio permanente (marcar como erro é idempotente, não cria loop)
  const extractStuckTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const extractStuckAttemptedRef = useRef<Set<string>>(new Set());

  const disabled = sessionStatus === 'completed';

  type TransientProcessingError = { id: string; label: string; message: string };

  const [transientProcessingErrors, setTransientProcessingErrors] = useState<TransientProcessingError[]>(
    [],
  );

  const pushTransientProcessingError = useCallback((id: string, label: string, message: string) => {
    setTransientProcessingErrors((prev) => {
      if (prev.some((e) => e.id === id)) return prev;
      return [...prev, { id, label, message }];
    });
    const existing = transientErrorTimersRef.current.get(id);
    if (existing) clearTimeout(existing);
    const t = setTimeout(() => {
      setTransientProcessingErrors((prev) => prev.filter((e) => e.id !== id));
      transientErrorTimersRef.current.delete(id);
    }, 10000);
    transientErrorTimersRef.current.set(id, t);
  }, []);

  // Cleanup all timers on unmount
  useEffect(() => {
    return () => {
      transientErrorTimersRef.current.forEach((timer) => clearTimeout(timer));
      transientErrorTimersRef.current.clear();
      postExtractTimersRef.current.forEach((timer) => clearTimeout(timer));
      postExtractTimersRef.current.clear();
      postExtractAttemptsRef.current.clear();
      postExtractLastFireRef.current.clear();
      extractStuckTimersRef.current.forEach((timer) => clearTimeout(timer));
      extractStuckTimersRef.current.clear();
    };
  }, []);

  const dismissTransientError = useCallback((id: string) => {
    const timer = transientErrorTimersRef.current.get(id);
    if (timer) clearTimeout(timer);
    transientErrorTimersRef.current.delete(id);
    setTransientProcessingErrors((prev) => prev.filter((e) => e.id !== id));
  }, []);

  useEffect(() => {
    setJobs(initialJobs);
  }, [initialJobs]);

  useEffect(() => {
    setQuotes(initialQuotes);
  }, [initialQuotes]);

  useEffect(() => {
    onJobsChange?.(jobs);
  }, [jobs, onJobsChange]);

  useLayoutEffect(() => {
    initialJobs.forEach((j) => {
      if (j.status === 'error') notifiedErrorJobIdsRef.current.add(j.id);
    });
  }, [initialJobs]);

  useEffect(() => {
    const hasActive = jobs.some((j) => j.status === 'pending' || j.status === 'processing');
    if (hasActive) {
      hadProcessingRef.current = true;
      toastFiredRef.current = false;
    }

    if (hadProcessingRef.current && !hasActive && !toastFiredRef.current && jobs.length > 0) {
      const completedCount = jobs.filter((j) => j.status === 'completed').length;
      const errorCount = jobs.filter((j) => j.status === 'error').length;
      toastFiredRef.current = true;
      hadProcessingRef.current = false;

      if (errorCount === 0) {
        toast.success(`Todos os ${completedCount} PDFs foram processados com sucesso.`);
      } else {
        toast.warning(
          `Processamento concluído: ${completedCount} sucesso, ${errorCount} com erro.`,
        );
      }
      onAllProcessed?.();
    }
  }, [jobs, onAllProcessed]);

  useEffect(() => {
    const channel = supabase
      .channel(`extraction_jobs:${sessionId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'extraction_jobs',
          filter: `session_id=eq.${sessionId}`,
        },
        (payload) => {
          const row = payload.new as ExtractionJobRow | null;
          if (!row || typeof row !== 'object' || !('id' in row)) return;

          console.log('[SessionExtractionRealtime] realtime update', row.id, {
            status: row.status,
            phase: row.pipeline_phase,
            quote_id: row.quote_id ? '[set]' : null,
            error: row.error_message ?? null,
          });

          setJobs((prev) => {
            const idx = prev.findIndex((j) => j.id === row.id);
            const next = [...prev];
            if (idx >= 0) next[idx] = { ...next[idx], ...row };
            else next.unshift(row as ExtractionJobRow);
            return next.sort(
              (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
            );
          });

          if (row.status === 'error') {
            if (!notifiedErrorJobIdsRef.current.has(row.id)) {
              notifiedErrorJobIdsRef.current.add(row.id);
              const label = fileLabel(row.file_path);
              const msg = row.error_message ?? 'Erro ao processar o PDF.';
              pushTransientProcessingError(row.id, label, msg);
              toast.error(`${label}: ${msg}`, { duration: 10000 });
            }
          }

          if (row.status === 'completed' && row.quote_id) {
            void supabase
              .from('supplier_quotes')
              .select('id, supplier_name, supplier_id, suppliers(name), status, created_at, extraction_validated_at')
              .eq('id', row.quote_id)
              .single()
              .then(({ data }) => {
                if (!data) return;
                setQuotes((prev) => {
                  const entry: QuoteRow = {
                    id: data.id,
                    supplier_name: getSupplierDisplayName(
                      data as { supplier_name: string; suppliers?: { name: string } | { name: string }[] | null }
                    ),
                    status: data.status,
                    created_at: data.created_at,
                    extraction_validated_at: data.extraction_validated_at,
                  };
                  if (prev.some((q) => q.id === data.id)) {
                    return prev.map((q) => (q.id === data.id ? entry : q));
                  }
                  return [entry, ...prev];
                });
              });
          }
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [sessionId, pushTransientProcessingError]);

  const continueJob = useCallback(async (jobId: string) => {
    const res = await fetch('/api/process-pdfs/continue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ job_id: jobId }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(body.error ?? `Falha ao retomar job (${res.status}).`);
    }
  }, []);

  // Recovery para pipeline travado (fases post_extract e match).
  // Usa cooldown em vez de bloqueio permanente: permite até PIPELINE_MAX_RECOVERY_ATTEMPTS
  // tentativas, com PIPELINE_RECOVERY_COOLDOWN_MS de intervalo entre elas.
  //
  // Por que cooldown e não bloqueio permanente?
  // A cadeia de /continue pode quebrar por timeout do Vercel (60s) no meio da fase match
  // (24 lotes × ~20s = ~8min). Sem recovery adicional, o job fica preso para sempre.
  // Com cooldown: se a cadeia quebrar, a UI retoma automaticamente após o intervalo.
  useEffect(() => {
    if (disabled) return;

    for (const job of jobs) {
      if (
        job.status !== 'processing' ||
        !job.quote_id ||          // só jobs que já têm cotação criada (post_extract ou match)
        !job.started_at ||
        postExtractTimersRef.current.has(job.id) // timer já pendente
      ) continue;

      const attempts = postExtractAttemptsRef.current.get(job.id) ?? 0;
      const lastFire = postExtractLastFireRef.current.get(job.id) ?? 0;

      if (attempts >= PIPELINE_MAX_RECOVERY_ATTEMPTS) continue; // esgotou as tentativas

      // Cooldown: não reescalonar antes do intervalo mínimo ter passado
      if (lastFire > 0 && Date.now() - lastFire < PIPELINE_RECOVERY_COOLDOWN_MS) continue;

      // Cálculo do delay até a próxima tentativa:
      // - Primeira tentativa: esperar até 3min desde started_at (tempo para a extração terminar)
      // - Tentativas seguintes: cooldown a partir da última tentativa
      let remaining: number;
      if (attempts === 0) {
        const elapsed = Date.now() - new Date(job.started_at).getTime();
        remaining = Math.max(0, EXTRACT_UI_STUCK_MS - elapsed);
      } else {
        remaining = Math.max(0, PIPELINE_RECOVERY_COOLDOWN_MS - (Date.now() - lastFire));
      }

      console.log('[SessionExtractionRealtime] pipeline recovery scheduled', job.id, {
        attempt: attempts + 1,
        remainingSec: Math.round(remaining / 1000),
        phase: job.pipeline_phase,
      });

      const jobId = job.id;
      const timer = setTimeout(() => {
        postExtractTimersRef.current.delete(jobId);
        const nextAttempt = (postExtractAttemptsRef.current.get(jobId) ?? 0) + 1;
        postExtractAttemptsRef.current.set(jobId, nextAttempt);
        postExtractLastFireRef.current.set(jobId, Date.now()); // definir ANTES da chamada async
        console.log('[SessionExtractionRealtime] pipeline recovery: calling /continue', jobId, {
          attempt: nextAttempt,
        });
        void continueJob(jobId).catch((err) => {
          console.warn('[SessionExtractionRealtime] pipeline recovery /continue failed', jobId, err);
        });
      }, remaining);

      postExtractTimersRef.current.set(job.id, timer);
    }

    // Cancelar timers de jobs que concluíram ou erraram antes do timer disparar
    for (const [id, timer] of postExtractTimersRef.current) {
      const job = jobs.find((j) => j.id === id);
      if (!job || job.status !== 'processing' || !job.quote_id) {
        clearTimeout(timer);
        postExtractTimersRef.current.delete(id);
      }
    }
  }, [jobs, disabled, continueJob]);

  // Extract-stuck: job has no quote_id and has been processing for > 10min → mark as error
  // The edge function (Supabase, 150s limit) must have crashed without updating the DB.
  // extractStuckAttemptedRef is NEVER cleared: marcar como erro é idempotente, sem risco de loop.
  useEffect(() => {
    if (disabled) return;

    for (const job of jobs) {
      if (
        job.status !== 'processing' ||
        job.quote_id ||
        !job.started_at ||
        extractStuckAttemptedRef.current.has(job.id) ||
        extractStuckTimersRef.current.has(job.id)
      ) continue;

      const elapsed = Date.now() - new Date(job.started_at).getTime();
      const remaining = Math.max(0, EXTRACT_STUCK_ERROR_MS - elapsed);

      console.log('[SessionExtractionRealtime] extract-stuck timer scheduled', job.id, {
        remainingSec: Math.round(remaining / 1000),
      });

      const timer = setTimeout(() => {
        extractStuckTimersRef.current.delete(job.id);
        extractStuckAttemptedRef.current.add(job.id); // Permanent — no re-scheduling ever
        console.warn('[SessionExtractionRealtime] extract stuck: marking as error', job.id);
        void markExtractionJobsErrorAction(
          [job.id],
          'A extração demorou demais. Por favor, exclua e reimporte o PDF.',
        ).catch((err) => {
          console.warn('[SessionExtractionRealtime] failed to mark stuck job as error:', job.id, err);
        });
      }, remaining);

      extractStuckTimersRef.current.set(job.id, timer);
    }

    // Cancel pending timers for jobs that finished or got quote_id set before the timer fired
    for (const [id, timer] of extractStuckTimersRef.current) {
      const job = jobs.find((j) => j.id === id);
      if (!job || job.status !== 'processing' || job.quote_id) {
        clearTimeout(timer);
        extractStuckTimersRef.current.delete(id);
      }
    }
  }, [jobs, disabled]);

  const openCuration = (q: QuoteRow) => {
    setCurationQuoteId(q.id);
    setCurationSupplier(q.supplier_name);
  };

  const onExtractionValidated = () => {
    if (!curationQuoteId) return;
    setQuotes((prev) =>
      prev.map((q) =>
        q.id === curationQuoteId
          ? { ...q, extraction_validated_at: new Date().toISOString() }
          : q,
      ),
    );
  };

  const handleDeleteQuote = async (quoteId: string, label: string) => {
    if (disabled || deletingKey) return;
    const accepted = confirm(DELETE_PDF_CONFIRM_MESSAGE);
    if (!accepted) return;

    setDeletingKey(quoteId);
    try {
      const result = await deleteUploadedPdfAction({ sessionId, quoteId });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      setQuotes((prev) => prev.filter((q) => q.id !== quoteId));
      setJobs((prev) => prev.filter((j) => j.quote_id !== quoteId));
      if (curationQuoteId === quoteId) setCurationQuoteId(null);
      toast.success(`Cotação "${label}" excluída.`);
      router.refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erro ao excluir cotação.';
      toast.error(message);
    } finally {
      setDeletingKey(null);
    }
  };

  const activeJobs = jobs.filter((j) => j.status === 'pending' || j.status === 'processing');
  const pendingJobs = jobs.filter((j) => j.status === 'pending');
  const processingJobs = jobs.filter((j) => j.status === 'processing');
  const erroredJobs = jobs.filter((j) => j.status === 'error');

  return (
    <div className="space-y-8">
      <BatchDropzoneManager
        sessionId={sessionId}
        disabled={disabled || jobs.length >= MAX_PDFS_PER_QUOTATION}
        existingJobCount={jobs.length}
        onJobsCreated={() => {}}
      />

      {transientProcessingErrors.length > 0 && (
        <div
          role="status"
          className="rounded-xl border border-red-200 bg-red-50/90 p-4 text-sm shadow-sm"
        >
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 font-semibold text-red-900">
              <AlertTriangle className="h-5 w-5 shrink-0" />
              Erro ao processar PDF
              {transientProcessingErrors.length > 1 ? 's' : ''}
            </div>
            <span className="text-xs text-red-700/80">Desaparece em ~10s</span>
          </div>
          <ul className="space-y-2">
            {transientProcessingErrors.map((e) => (
              <li
                key={e.id}
                className="flex flex-wrap items-start justify-between gap-2 rounded-lg border border-red-100 bg-white/80 px-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-gray-900">{e.label}</p>
                  <p className="mt-0.5 text-xs text-red-700">{e.message}</p>
                </div>
                <button
                  type="button"
                  onClick={() => dismissTransientError(e.id)}
                  className="shrink-0 rounded px-2 py-1 text-xs text-red-600 hover:bg-red-100"
                >
                  Fechar
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Active processing queue */}
      {activeJobs.length > 0 && (
        <section>
          <h2 className="mb-3 text-base font-semibold text-[#1D3140]">
            Processando ({activeJobs.length})
          </h2>
          <ul className="space-y-2">
            {processingJobs.map((j) => (
              <li
                key={j.id}
                className="flex flex-wrap items-center gap-3 rounded-lg border border-[#64ABDE]/40 bg-[#64ABDE]/10 px-4 py-3 text-sm"
              >
                <JobStatusIcon status={j.status} />
                <span className="flex-1 min-w-0 font-medium text-gray-800 truncate">
                  {fileLabel(j.file_path)}
                </span>
                <span className="text-xs uppercase text-gray-500">
                  {j.pipeline_phase ? phaseLabel(j.pipeline_phase) : j.status}
                </span>
                {j.estimated_time != null && (
                  <span className="text-xs text-gray-400">~{j.estimated_time}s</span>
                )}
              </li>
            ))}
            {pendingJobs.map((j) => (
              <li
                key={j.id}
                className="flex flex-wrap items-center gap-3 rounded-lg border border-[#64ABDE]/40 bg-[#64ABDE]/10 px-4 py-3 text-sm"
              >
                <JobStatusIcon status={j.status} />
                <span className="flex-1 min-w-0 font-medium text-gray-800 truncate">
                  {fileLabel(j.file_path)}
                </span>
                <span className="text-xs uppercase text-gray-500">{j.status}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Errored jobs — shown for reference, no action buttons */}
      {erroredJobs.length > 0 && (
        <section>
          <h2 className="mb-3 text-base font-semibold text-[#1D3140]">
            Falhas no processamento ({erroredJobs.length})
          </h2>
          <ul className="space-y-2">
            {erroredJobs.map((j) => (
              <li
                key={j.id}
                className="flex flex-wrap items-center gap-3 rounded-lg border border-red-200 bg-red-50/60 px-4 py-3 text-sm"
              >
                <JobStatusIcon status={j.status} />
                <span className="flex-1 min-w-0 font-medium text-gray-800 truncate">
                  {fileLabel(j.file_path)}
                </span>
                <span className="text-xs uppercase text-red-700">erro</span>
                {j.error_message && (
                  <span className="w-full text-xs text-red-700/90">{j.error_message}</span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Processed quotes — primary interaction cards */}
      <section>
        <h2 className="mb-3 text-base font-semibold text-[#1D3140]">
          PDFs processados ({quotes.length})
        </h2>
        {quotes.length === 0 ? (
          <p className="text-sm text-gray-500 rounded-lg border border-dashed border-gray-200 p-8 text-center">
            Nenhuma cotação processada ainda. Importe PDFs acima.
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {quotes.map((q) => {
              const validated = !!q.extraction_validated_at;
              const isDeleting = deletingKey === q.id;
              return (
                <div
                  key={q.id}
                  className={`group rounded-lg border p-4 transition-all hover:shadow-md ${
                    validated
                      ? 'border-green-200 bg-green-50/30'
                      : 'border-gray-200 bg-white hover:border-[#64ABDE]/50'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <button
                      type="button"
                      onClick={() => openCuration(q)}
                      className="flex min-w-0 flex-1 items-start gap-3 text-left"
                    >
                      <div
                        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
                          validated
                            ? 'bg-green-100 text-green-600'
                            : 'bg-gray-100 text-gray-500 group-hover:bg-[#64ABDE]/15 group-hover:text-[#64ABDE]'
                        }`}
                      >
                        <FileText className="h-5 w-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-[#1D3140]">
                          {q.supplier_name}
                        </p>
                        <p className="mt-0.5 text-xs text-gray-500">
                          {validated ? (
                            <span className="font-medium text-green-600">Extração validada</span>
                          ) : (
                            'Clique para revisar extração'
                          )}
                        </p>
                      </div>
                    </button>
                    <div className="relative z-10 flex shrink-0 items-center gap-0.5">
                      <button
                        type="button"
                        title="Revisar extração"
                        onClick={() => openCuration(q)}
                        className="inline-flex items-center justify-center rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-[#64ABDE]/10 hover:text-[#64ABDE]"
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                      {!disabled && (
                        <button
                          type="button"
                          title="Excluir cotação"
                          disabled={isDeleting}
                          onClick={() => void handleDeleteQuote(q.id, q.supplier_name)}
                          className="inline-flex items-center justify-center rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                        >
                          {isDeleting ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {curationQuoteId && (
        <ExtractionCurationModal
          quoteId={curationQuoteId}
          supplierName={curationSupplier}
          open={!!curationQuoteId}
          onOpenChange={(open) => {
            if (!open) setCurationQuoteId(null);
          }}
          onValidated={onExtractionValidated}
        />
      )}
    </div>
  );
}
