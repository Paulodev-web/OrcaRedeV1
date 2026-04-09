'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowRight, BarChart3, GitMerge } from 'lucide-react';
import SessionExtractionRealtime from '@/components/suppliers/SessionExtractionRealtime';
import ConciliationCurationModal from '@/components/suppliers/ConciliationCurationModal';
import type { ExtractionJobRow } from '@/actions/quotationSessions';

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
  const [conciliationOpen, setConciliationOpen] = useState(false);

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
        <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-[#1D3140]">Conciliação de materiais</h2>
              <p className="text-sm text-gray-500 mt-0.5">
                {conciliationQuotes.length} proposta{conciliationQuotes.length > 1 ? 's' : ''} &middot;{' '}
                {totalMatched} de {totalItems} itens validados ({progressPct}%)
              </p>
              <div className="mt-2 w-64 bg-gray-100 rounded-full h-2">
                <div
                  className={`h-2 rounded-full transition-all duration-500 ${
                    progressPct === 100 ? 'bg-green-500' : 'bg-[#64ABDE]'
                  }`}
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setConciliationOpen(true)}
                className="inline-flex items-center gap-2 rounded-lg bg-[#64ABDE] px-5 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-[#5596c5] transition-colors"
              >
                <GitMerge className="h-4 w-4" />
                Abrir conciliação
              </button>

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

      {/* Conciliation curation modal */}
      <ConciliationCurationModal
        sessionId={sessionId}
        open={conciliationOpen}
        onOpenChange={setConciliationOpen}
      />
    </div>
  );
}
