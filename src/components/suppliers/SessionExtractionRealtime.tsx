'use client';

import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Clock, Eye, FileText, Loader2, XCircle } from 'lucide-react';
import { toast } from 'sonner';
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
      return <Loader2 className="h-4 w-4 animate-spin text-blue-600" />;
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
}: Props) {
  const [jobs, setJobs] = useState<ExtractionJobRow[]>(initialJobs);
  const [quotes, setQuotes] = useState<QuoteRow[]>(initialQuotes);
  const [curationQuoteId, setCurationQuoteId] = useState<string | null>(null);
  const [curationSupplier, setCurationSupplier] = useState('');

  const hadProcessingRef = useRef(false);
  const toastFiredRef = useRef(false);

  const disabled = sessionStatus === 'completed';

  useEffect(() => {
    setJobs(initialJobs);
  }, [initialJobs]);

  useEffect(() => {
    setQuotes(initialQuotes);
  }, [initialQuotes]);

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
  }, [sessionId]);

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
    toast.success('Extração validada com sucesso.');
  };

  const activeJobs = jobs.filter((j) => j.status === 'pending' || j.status === 'processing');
  const finishedJobs = jobs.filter((j) => j.status === 'completed' || j.status === 'error');

  return (
    <div className="space-y-8">
      <BatchDropzoneManager
        sessionId={sessionId}
        disabled={disabled}
        onJobsCreated={() => {}}
      />

      {/* Active processing queue (only shown while there are active jobs) */}
      {activeJobs.length > 0 && (
        <section>
          <h2 className="mb-3 text-base font-semibold text-gray-900">
            Processando ({activeJobs.length})
          </h2>
          <ul className="space-y-2">
            {activeJobs.map((j) => (
              <li
                key={j.id}
                className="flex flex-wrap items-center gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm"
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

      {/* Finished jobs with errors */}
      {finishedJobs.some((j) => j.status === 'error') && (
        <section>
          <h2 className="text-base font-semibold text-red-700 mb-3">Erros de processamento</h2>
          <ul className="space-y-2">
            {finishedJobs
              .filter((j) => j.status === 'error')
              .map((j) => (
                <li
                  key={j.id}
                  className="flex flex-wrap items-center gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm"
                >
                  <XCircle className="h-4 w-4 text-red-500" />
                  <span className="flex-1 min-w-0 font-medium text-gray-800 truncate">
                    {fileLabel(j.file_path)}
                  </span>
                  {j.error_message && (
                    <span className="w-full text-xs text-red-600">{j.error_message}</span>
                  )}
                </li>
              ))}
          </ul>
        </section>
      )}

      {/* Processed PDFs / quotes — primary interaction cards */}
      <section>
        <h2 className="mb-3 text-base font-semibold text-gray-900">
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
                      : 'border-gray-200 bg-white hover:border-blue-300'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
                        validated
                          ? 'bg-green-100 text-green-600'
                          : 'bg-gray-100 text-gray-500 group-hover:bg-blue-100 group-hover:text-blue-600'
                      }`}
                    >
                      <FileText className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-gray-900">
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
                    <Eye className="h-4 w-4 shrink-0 text-gray-300 transition-colors group-hover:text-blue-600" />
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
