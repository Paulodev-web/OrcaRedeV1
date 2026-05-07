'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock, Eye, FileText, Loader2, RotateCcw, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { retryExtractionJobsAction } from '@/actions/quotationSessions';
import { supabase } from '@/lib/supabaseClient';
import type { ExtractionJobRow } from '@/actions/quotationSessions';
import BatchDropzoneManager from '@/components/suppliers/BatchDropzoneManager';
import ExtractionCurationModal from '@/components/suppliers/ExtractionCurationModal';

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
  const base = path.split('/').pop() ?? path;
  return base.length > 48 ? `${base.slice(0, 44)}…` : base;
}

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
  const [jobs, setJobs] = useState<ExtractionJobRow[]>(initialJobs);
  const [quotes, setQuotes] = useState<QuoteRow[]>(initialQuotes);
  const [curationQuoteId, setCurationQuoteId] = useState<string | null>(null);
  const [curationSupplier, setCurationSupplier] = useState('');
  const [retryingErrors, setRetryingErrors] = useState(false);

  const hadProcessingRef = useRef(false);
  const toastFiredRef = useRef(false);
  /** Evita duplicar banner/toast para o mesmo job (carga inicial + realtime). */
  const notifiedErrorJobIdsRef = useRef<Set<string>>(new Set());
  const transientErrorTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

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

  useEffect(() => {
    return () => {
      transientErrorTimersRef.current.forEach((timer) => clearTimeout(timer));
      transientErrorTimersRef.current.clear();
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

  // Jobs que já estavam em erro no servidor: não mostrar banner ao abrir a página;
  // só avisar quando um job passar a erro em tempo real (após esta marcação).
  useLayoutEffect(() => {
    initialJobs.forEach((j) => {
      if (j.status === 'error') notifiedErrorJobIdsRef.current.add(j.id);
    });
  }, [initialJobs]);

  // Track whether any job was ever processing in this mount cycle
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
              .select('id, supplier_name, status, created_at, extraction_validated_at')
              .eq('id', row.quote_id)
              .single()
              .then(({ data }) => {
                if (!data) return;
                setQuotes((prev) => {
                  const entry: QuoteRow = {
                    id: data.id,
                    supplier_name: data.supplier_name,
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

  const enqueueJob = async (jobId: string) => {
    const res = await fetch('/api/process-pdfs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ job_id: jobId }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(body.error ?? `Falha ao enfileirar job (${res.status}).`);
    }
  };

  const handleRetryErroredJobs = async () => {
    const erroredIds = jobs.filter((j) => j.status === 'error').map((j) => j.id);
    if (erroredIds.length === 0 || retryingErrors) return;

    setRetryingErrors(true);
    try {
      const result = await retryExtractionJobsAction(sessionId);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      await Promise.all(result.data.jobIds.map((jobId) => enqueueJob(jobId)));
      toast.success(
        result.data.jobIds.length === 1
          ? 'Job reenfileirado com sucesso.'
          : `${result.data.jobIds.length} jobs reenfileirados com sucesso.`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erro ao reenfileirar jobs.';
      toast.error(message);
    } finally {
      setRetryingErrors(false);
    }
  };

  const activeJobs = jobs.filter((j) => j.status === 'pending' || j.status === 'processing');
  const erroredJobs = jobs.filter((j) => j.status === 'error');

  return (
    <div className="space-y-8">
      <BatchDropzoneManager
        sessionId={sessionId}
        disabled={disabled}
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

      {/* Active processing queue (only shown while there are active jobs) */}
      {activeJobs.length > 0 && (
        <section>
          <h2 className="mb-3 text-base font-semibold text-[#1D3140]">
            Processando ({activeJobs.length})
          </h2>
          <ul className="space-y-2">
            {activeJobs.map((j) => (
              <li
                key={j.id}
                className="flex flex-wrap items-center gap-3 rounded-lg border border-[#64ABDE]/40 bg-[#64ABDE]/10 px-4 py-3 text-sm"
              >
                <JobStatusIcon status={j.status} />
                <span className="flex-1 min-w-0 font-medium text-gray-800 truncate">
                  {fileLabel(j.file_path)}
                </span>
                <span className="text-xs uppercase text-gray-500">{j.status}</span>
                {j.estimated_time != null && j.status === 'processing' && (
                  <span className="text-xs text-gray-400">~{j.estimated_time}s</span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {erroredJobs.length > 0 && (
        <section>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-semibold text-[#1D3140]">
              Falhas no processamento ({erroredJobs.length})
            </h2>
            {!disabled && (
              <button
                type="button"
                onClick={() => void handleRetryErroredJobs()}
                disabled={retryingErrors}
                className="inline-flex items-center gap-2 rounded-lg border border-red-300 bg-white px-3 py-2 text-sm font-medium text-red-700 transition-colors hover:bg-red-50 disabled:opacity-50"
              >
                {retryingErrors ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RotateCcw className="h-4 w-4" />
                )}
                Tentar processar novamente
              </button>
            )}
          </div>
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

      {/* Processed PDFs / quotes — primary interaction cards */}
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
              return (
                <button
                  key={q.id}
                  type="button"
                  onClick={() => openCuration(q)}
                  className={`group relative rounded-lg border p-4 text-left transition-all hover:shadow-md ${
                    validated
                      ? 'border-green-200 bg-green-50/30'
                      : 'border-gray-200 bg-white hover:border-[#64ABDE]/50'
                  }`}
                >
                  <div className="flex items-start gap-3">
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
                      <p className="text-xs text-gray-500 mt-0.5">
                        {validated ? (
                          <span className="text-green-600 font-medium">Extração validada</span>
                        ) : (
                          'Clique para revisar extração'
                        )}
                      </p>
                    </div>
                    <Eye className="h-4 w-4 shrink-0 text-gray-300 transition-colors group-hover:text-[#64ABDE]" />
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </section>

      {/* Extraction curation modal */}
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
