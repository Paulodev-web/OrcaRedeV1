'use client';

import Link from 'next/link';
import { ArrowRight, BarChart3, GitMerge } from 'lucide-react';
import SessionExtractionRealtime from '@/components/suppliers/SessionExtractionRealtime';
import type { ExtractionJobRow } from '@/actions/quotationSessions';
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
  const hasQuotes = conciliationQuotes.length > 0;
  const totalItems = conciliationQuotes.reduce((s, q) => s + q.item_count, 0);
  const totalMatched = conciliationQuotes.reduce((s, q) => s + q.matched_count, 0);
  const progressPct = totalItems > 0 ? Math.round((totalMatched / totalItems) * 100) : 0;

  return (
    <div className="space-y-8">
      {/* Upload + fila + PDFs processados */}
      <SessionExtractionRealtime
        sessionId={sessionId}
        sessionStatus={sessionStatus}
        initialJobs={initialJobs}
        initialQuotes={initialQuotes}
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
              <Link
                href={`/fornecedores/sessao/${sessionId}/conciliacao`}
                className={`inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm ${onPortalPrimaryButtonSmClass}`}
              >
                <GitMerge className="h-4 w-4" />
                Abrir conciliação
              </Link>

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
        </section>
      )}
    </div>
  );
}
