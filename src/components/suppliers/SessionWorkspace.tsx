'use client';

import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { AlertTriangle, ArrowRight, BarChart3, CheckCircle2, Clock, GitMerge, Loader2, Sparkles } from 'lucide-react';
import SessionExtractionRealtime from '@/components/suppliers/SessionExtractionRealtime';
import type { ExtractionJobRow } from '@/actions/quotationSessions';
import { processarConciliacaoAction } from '@/actions/supplierQuotes';
import { onPortalPrimaryButtonSmClass } from '@/lib/branding';

type QuoteSummary = {
  id: string;
  supplier_name: string;
  status: string;
  item_count: number;
  matched_count: number;
  budget_id: string | null;
};

interface QuoteRow {
  id: string;
  supplier_name: string;
  status: string;
  created_at: string;
}

interface Props {
  sessionId: string;
  sessionStatus: 'active' | 'completed';
  budgetId: string | null;
  initialJobs: ExtractionJobRow[];
  initialQuotes: QuoteRow[];
  conciliationQuotes: QuoteSummary[];
}

export default function SessionWorkspace({
  sessionId,
  sessionStatus,
  budgetId,
  initialJobs,
  initialQuotes,
  conciliationQuotes,
}: Props) {
  const [jobs, setJobs] = useState<ExtractionJobRow[]>(initialJobs);
  const [processingQuoteId, setProcessingQuoteId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const hasQuotes = conciliationQuotes.length > 0;
  const totalItems = conciliationQuotes.reduce((s, q) => s + q.item_count, 0);
  const totalMatched = conciliationQuotes.reduce((s, q) => s + q.matched_count, 0);
  const progressPct = totalItems > 0 ? Math.round((totalMatched / totalItems) * 100) : 0;
  const jobsSummary = useMemo(() => {
    const summary = { pending: 0, processing: 0, completed: 0, error: 0 };
    for (const job of jobs) {
      summary[job.status] += 1;
    }
    return summary;
  }, [jobs]);
  const totalJobs = jobs.length;
  const finalizedJobs = jobsSummary.completed + jobsSummary.error;
  const processingPct = totalJobs > 0 ? Math.round((finalizedJobs / totalJobs) * 100) : 0;
  const hasActiveJobs = jobsSummary.pending + jobsSummary.processing > 0;
  const hasErroredJobs = jobsSummary.error > 0;
  function handleProcessarConciliacao(quoteId: string) {
    setProcessingQuoteId(quoteId);
    startTransition(async () => {
      await processarConciliacaoAction(quoteId);
      // O status real virá via Realtime; não resetamos o ID aqui para manter o spinner
    });
  }

  const canOpenConciliation = hasQuotes && !hasActiveJobs && !hasErroredJobs;
  const conciliationBlockReason = hasActiveJobs
    ? 'Aguarde o processamento da IA terminar para abrir a conciliação.'
    : hasErroredJobs
      ? 'Há falhas em PDFs. Reprocesse os erros para liberar a conciliação.'
      : null;

  return (
    <div className="space-y-8">
      {/* Upload + fila + PDFs processados */}
      <SessionExtractionRealtime
        sessionId={sessionId}
        sessionStatus={sessionStatus}
        initialJobs={initialJobs}
        initialQuotes={initialQuotes}
        onJobsChange={setJobs}
      />

      {/* Conciliation CTA */}
      {hasQuotes && (
        <section className="rounded-2xl border border-[#64ABDE]/40 bg-white p-6 shadow-md">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-[#1D3140]">Conciliação de materiais</h2>
              <p className="mt-0.5 text-sm text-slate-500">
                {conciliationQuotes.length} proposta{conciliationQuotes.length > 1 ? 's' : ''} &middot;{' '}
                {totalMatched} de {totalItems} itens validados ({progressPct}%)
              </p>
              <div className="mt-2 h-2 w-64 rounded-full bg-slate-200">
                <div
                  className={`h-2 rounded-full transition-all duration-500 ${
                    progressPct === 100 ? 'bg-green-500' : 'bg-[#64ABDE]'
                  }`}
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            </div>

            <div className="flex items-center gap-3">
              {canOpenConciliation ? (
                <Link
                  href={`/fornecedores/sessao/${sessionId}/conciliacao`}
                  className={`inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm ${onPortalPrimaryButtonSmClass}`}
                >
                  <GitMerge className="h-4 w-4" />
                  Abrir conciliação
                </Link>
              ) : (
                <button
                  type="button"
                  disabled
                  className="inline-flex cursor-not-allowed items-center gap-2 rounded-xl bg-gray-200 px-5 py-2.5 text-sm font-medium text-gray-500"
                  title={conciliationBlockReason ?? 'Conciliação indisponível'}
                >
                  {hasActiveJobs ? <Loader2 className="h-4 w-4 animate-spin" /> : <AlertTriangle className="h-4 w-4" />}
                  Abrir conciliação
                </button>
              )}

              {budgetId && (
                <Link
                  href={`/fornecedores/sessao/${sessionId}/cenarios`}
                  className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-green-600 to-emerald-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm hover:from-green-700 hover:to-emerald-700 transition-all"
                >
                  <BarChart3 className="h-4 w-4" />
                  Ver Cenários
                  <ArrowRight className="h-4 w-4" />
                </Link>
              )}
            </div>
          </div>
          {/* Status individual por cotação + botão "Processar Conciliação" */}
          <div className="mt-4 divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
            {conciliationQuotes.map((q) => {
              const isThisProcessing =
                (processingQuoteId === q.id && isPending) || q.status === 'conciliando';

              return (
                <div key={q.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-[#1D3140]">{q.supplier_name}</p>
                    <p className="text-xs text-slate-500">
                      {q.matched_count} de {q.item_count} itens vinculados
                    </p>
                  </div>

                  <div className="shrink-0">
                    {/* Aguardando revisão ou conciliado → link para conciliação */}
                    {(q.status === 'aguardando_revisao' || q.status === 'conciliado') && (
                      <Link
                        href={`/fornecedores/sessao/${sessionId}/conciliacao`}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-50 px-3 py-1.5 text-xs font-medium text-indigo-700 hover:bg-indigo-100 transition-colors"
                      >
                        {q.status === 'conciliado' ? (
                          <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
                        ) : (
                          <Sparkles className="h-3.5 w-3.5" />
                        )}
                        {q.status === 'conciliado' ? 'Conciliado' : 'Revisar matches'}
                      </Link>
                    )}

                    {/* Conciliando → spinner */}
                    {isThisProcessing && (
                      <span className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-600">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        Conciliando…
                      </span>
                    )}

                    {/* Pendente conciliação → botão de ação */}
                    {q.status === 'pendente_conciliacao' && !isThisProcessing && (
                      <button
                        type="button"
                        onClick={() => handleProcessarConciliacao(q.id)}
                        disabled={isPending}
                        className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${onPortalPrimaryButtonSmClass}`}
                      >
                        <GitMerge className="h-3.5 w-3.5" />
                        Processar Conciliação
                      </button>
                    )}

                    {/* Demais status (pendente, processando_ia, erro_extracao) */}
                    {!['aguardando_revisao', 'conciliado', 'conciliando', 'pendente_conciliacao'].includes(q.status) &&
                      !isThisProcessing && (
                        <span className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-500">
                          <Clock className="h-3.5 w-3.5" />
                          Aguardando extração
                        </span>
                      )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm font-medium text-[#1D3140]">Status do processamento por IA</p>
              <p className="text-xs text-slate-500">
                {finalizedJobs} de {totalJobs} finalizados
              </p>
            </div>
            <div className="h-2 w-full rounded-full bg-slate-200">
              <div
                className={`h-2 rounded-full transition-all duration-500 ${
                  hasErroredJobs ? 'bg-amber-500' : processingPct === 100 ? 'bg-green-500' : 'bg-[#64ABDE]'
                }`}
                style={{ width: `${processingPct}%` }}
              />
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
              <span className="text-amber-700">Pendentes: {jobsSummary.pending}</span>
              <span className="text-[#1D3140]">Processando: {jobsSummary.processing}</span>
              <span className="text-green-700">Concluídos: {jobsSummary.completed}</span>
              <span className="text-red-700">Erros: {jobsSummary.error}</span>
            </div>
            {conciliationBlockReason && (
              <p className="mt-2 text-sm text-slate-600">{conciliationBlockReason}</p>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
