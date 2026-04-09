'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, Clock, Loader2, XCircle } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import type { ExtractionJobRow } from '@/actions/quotationSessions';
import BatchDropzoneManager from '@/components/suppliers/BatchDropzoneManager';

interface QuoteRow {
  id: string;
  supplier_name: string;
  status: string;
  created_at: string;
}

interface Props {
  sessionId: string;
  sessionStatus: 'active' | 'completed';
  initialJobs: ExtractionJobRow[];
  initialQuotes: QuoteRow[];
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
}: Props) {
  const [jobs, setJobs] = useState<ExtractionJobRow[]>(initialJobs);
  const [quotes, setQuotes] = useState<QuoteRow[]>(initialQuotes);

  const disabled = sessionStatus === 'completed';

  useEffect(() => {
    setJobs(initialJobs);
  }, [initialJobs]);

  useEffect(() => {
    setQuotes(initialQuotes);
  }, [initialQuotes]);

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
              (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
            );
          });

          if (row.status === 'completed' && row.quote_id) {
            void supabase
              .from('supplier_quotes')
              .select('id, supplier_name, status, created_at')
              .eq('id', row.quote_id)
              .single()
              .then(({ data }) => {
                if (!data) return;
                setQuotes((prev) => {
                  if (prev.some((q) => q.id === data.id)) {
                    return prev.map((q) =>
                      q.id === data.id
                        ? {
                            id: data.id,
                            supplier_name: data.supplier_name,
                            status: data.status,
                            created_at: data.created_at,
                          }
                        : q
                    );
                  }
                  return [
                    {
                      id: data.id,
                      supplier_name: data.supplier_name,
                      status: data.status,
                      created_at: data.created_at,
                    },
                    ...prev,
                  ];
                });
              });
          }
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [sessionId]);

  return (
    <div className="space-y-8">
      <BatchDropzoneManager
        sessionId={sessionId}
        disabled={disabled}
        onJobsCreated={() => {
          /* realtime will pick up new rows */
        }}
      />

      <section>
        <h2 className="text-base font-semibold text-[#1D3140] mb-3">Fila de processamento</h2>
        {jobs.length === 0 ? (
          <p className="text-sm text-gray-500 rounded-lg border border-dashed border-gray-200 p-8 text-center">
            Nenhum arquivo na fila ainda.
          </p>
        ) : (
          <ul className="space-y-2">
            {jobs.map((j) => (
              <li
                key={j.id}
                className="flex flex-wrap items-center gap-3 rounded-lg border border-gray-100 bg-white px-4 py-3 text-sm shadow-sm"
              >
                <JobStatusIcon status={j.status} />
                <span className="flex-1 min-w-0 font-medium text-gray-800 truncate">
                  {fileLabel(j.file_path)}
                </span>
                <span className="text-xs uppercase text-gray-500">{j.status}</span>
                {j.estimated_time != null && j.status === 'processing' && (
                  <span className="text-xs text-gray-400">~{j.estimated_time}s</span>
                )}
                {j.status === 'error' && j.error_message && (
                  <span className="w-full text-xs text-red-600">{j.error_message}</span>
                )}
                {j.status === 'completed' && j.quote_id && (
                  <Link
                    href={`/fornecedores/sessao/${sessionId}?tab=conciliar&quoteId=${encodeURIComponent(j.quote_id)}`}
                    className="text-xs font-medium text-[#64ABDE] hover:underline"
                  >
                    Conciliar
                  </Link>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="text-base font-semibold text-[#1D3140] mb-3">Cotações importadas</h2>
        {quotes.length === 0 ? (
          <p className="text-sm text-gray-500">Nenhuma cotação salva nesta sessão.</p>
        ) : (
          <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white">
            {quotes.map((q) => (
              <li key={q.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                <div>
                  <span className="font-medium text-gray-900">{q.supplier_name}</span>
                  <span className="ml-2 text-xs text-gray-500">{q.status}</span>
                </div>
                <Link
                  href={`/fornecedores/sessao/${sessionId}?tab=conciliar&quoteId=${encodeURIComponent(q.id)}`}
                  className="text-[#64ABDE] hover:underline text-sm font-medium"
                >
                  Abrir conciliação
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
