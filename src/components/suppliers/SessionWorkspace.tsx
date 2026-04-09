'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Upload, GitMerge, ArrowRight, Loader2 } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import SessionExtractionRealtime from '@/components/suppliers/SessionExtractionRealtime';
import ConciliationTable from '@/components/suppliers/ConciliationTable';
import type { SupplierQuote } from '@/types';
import type {
  SupplierQuoteItemWithMaterial,
  BudgetMaterialOption,
} from '@/actions/supplierQuotes';
import type { ExtractionJobRow } from '@/actions/quotationSessions';
import { getConciliationPayloadByQuoteAction } from '@/actions/supplierQuotes';

export type SessionTab = 'importar' | 'conciliar';

export interface ConciliationPayload {
  quote: SupplierQuote;
  items: SupplierQuoteItemWithMaterial[];
  budgetMaterials: BudgetMaterialOption[];
}

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

const tabTriggerClass =
  'group inline-flex flex-1 min-w-0 sm:flex-none items-center justify-center gap-2 rounded-none rounded-t-lg border border-transparent border-b-0 px-4 py-2.5 text-sm font-medium text-gray-600 shadow-none transition-colors ' +
  'data-[state=active]:bg-[#64ABDE]/15 data-[state=active]:text-[#1D3140] data-[state=active]:border-gray-200 data-[state=active]:shadow-none ' +
  'data-[state=inactive]:text-gray-600 ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#64ABDE] focus-visible:ring-offset-2';

const tabIconClass =
  'h-4 w-4 shrink-0 text-gray-400 group-data-[state=active]:text-[#64ABDE]';

export default function SessionWorkspace({
  sessionId,
  sessionStatus,
  budgetId,
  initialJobs,
  initialQuotes,
  conciliationQuotes,
}: Props) {
  const [activeTab, setActiveTab] = useState<SessionTab>('importar');
  const [expandedQuoteId, setExpandedQuoteId] = useState('');
  const [conciliation, setConciliation] = useState<ConciliationPayload | null>(null);
  const [conciliationError, setConciliationError] = useState<string | null>(null);
  const [isLoadingConciliation, setIsLoadingConciliation] = useState(false);
  const [navigationMs, setNavigationMs] = useState<number | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tab = params.get('tab');
    const quoteId = params.get('quoteId');
    if (tab === 'conciliar') setActiveTab('conciliar');
    if (quoteId) setExpandedQuoteId(quoteId);
  }, []);

  useEffect(() => {
    if (!expandedQuoteId) return;
    if (conciliation?.quote.id === expandedQuoteId) return;

    let cancelled = false;
    setIsLoadingConciliation(true);
    setConciliationError(null);
    void getConciliationPayloadByQuoteAction(expandedQuoteId).then((res) => {
      if (cancelled) return;
      setIsLoadingConciliation(false);
      if (!res.success) {
        setConciliation(null);
        setConciliationError(res.error);
        return;
      }
      setConciliation(res.data);
    });
    return () => {
      cancelled = true;
    };
  }, [expandedQuoteId, conciliation?.quote.id]);

  const onTabChange = (value: string) => {
    const nextTab = value as SessionTab;
    const start = performance.now();
    setActiveTab(nextTab);
    const params = new URLSearchParams(window.location.search);
    params.set('tab', nextTab);
    if (nextTab !== 'conciliar') params.delete('quoteId');
    window.history.replaceState({}, '', `?${params.toString()}`);
    setNavigationMs(Math.round(performance.now() - start));
  };

  const onConciliationCardToggle = (nextQuoteId: string) => {
    const start = performance.now();
    const willExpand = expandedQuoteId !== nextQuoteId;
    const nextId = willExpand ? nextQuoteId : '';
    setExpandedQuoteId(nextId);
    const params = new URLSearchParams(window.location.search);
    params.set('tab', 'conciliar');
    if (nextId) params.set('quoteId', nextId);
    else params.delete('quoteId');
    window.history.replaceState({}, '', `?${params.toString()}`);

    if (!nextId) {
      setConciliation(null);
      setConciliationError(null);
      setNavigationMs(Math.round(performance.now() - start));
      return;
    }
    setNavigationMs(Math.round(performance.now() - start));
  };

  const matchedCount =
    conciliation?.items.filter((i) => i.match_status !== 'sem_match').length ?? 0;
  const hasConciliationQuotes = conciliationQuotes.length > 0;
  const selectedQuote = useMemo(
    () => conciliationQuotes.find((q) => q.id === expandedQuoteId) ?? null,
    [conciliationQuotes, expandedQuoteId]
  );

  return (
    <Tabs value={activeTab} onValueChange={onTabChange} className="w-full">
      <TabsList className="flex w-full flex-wrap h-auto items-end gap-1 rounded-none border-0 border-b border-gray-200 bg-transparent p-0 shadow-none">
        <TabsTrigger value="importar" className={tabTriggerClass}>
          <Upload className={tabIconClass} aria-hidden />
          Importar PDF
        </TabsTrigger>
        <TabsTrigger value="conciliar" className={tabTriggerClass}>
          <GitMerge className={tabIconClass} aria-hidden />
          Conciliar itens
        </TabsTrigger>
      </TabsList>

      <div className="rounded-b-xl border border-t-0 border-gray-200 bg-white px-6 py-6 shadow-sm lg:px-8 lg:py-8">
        <TabsContent value="importar" className="mt-0 focus-visible:ring-0">
          <SessionExtractionRealtime
            sessionId={sessionId}
            sessionStatus={sessionStatus}
            initialJobs={initialJobs}
            initialQuotes={initialQuotes}
          />
        </TabsContent>

        <TabsContent value="conciliar" className="mt-0 focus-visible:ring-0">
          {!hasConciliationQuotes && (
            <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50/50 p-10 text-center text-sm text-gray-500">
              <p>Nenhuma proposta disponível para conciliação.</p>
              <p className="mt-2">
                Importe um PDF na aba{' '}
                <button
                  type="button"
                  onClick={() => onTabChange('importar')}
                  className="font-medium text-[#64ABDE] hover:text-[#1D3140] hover:underline"
                >
                  Importar PDF
                </button>{' '}
                para iniciar a conciliação.
              </p>
            </div>
          )}

          {hasConciliationQuotes && (
            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold text-[#1D3140]">
                    Conciliação de propostas
                  </h2>
                  <p className="text-sm text-gray-500 mt-0.5">
                    Clique em uma proposta para expandir e conciliar os materiais.
                  </p>
                </div>
                {budgetId && (
                  <Link
                    href={`/fornecedores/sessao/${sessionId}/cenarios`}
                    className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-green-700 transition-colors"
                  >
                    Finalizar Conciliação e Ver Cenários
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                )}
              </div>

              <div className="space-y-3">
                {conciliationQuotes.map((qs) => {
                  const isExpanded = expandedQuoteId === qs.id;
                  const progressPct =
                    qs.item_count > 0
                      ? Math.round((qs.matched_count / qs.item_count) * 100)
                      : 0;

                  return (
                    <div
                      key={qs.id}
                      className={`rounded-lg border transition-colors ${
                        isExpanded
                          ? 'border-[#64ABDE]/50 bg-[#64ABDE]/5'
                          : 'border-gray-200 bg-white hover:border-gray-300'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => void onConciliationCardToggle(qs.id)}
                        className="flex w-full items-center justify-between gap-4 p-4 text-left"
                      >
                        <div className="min-w-0">
                          <p className="text-base font-semibold text-[#1D3140]">
                            {qs.supplier_name}
                          </p>
                          <p className="mt-1 text-sm text-gray-500">
                            {qs.matched_count} de {qs.item_count} itens vinculados
                          </p>
                        </div>
                        <div className="flex items-center gap-3">
                          <span
                            className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                              qs.status === 'conciliado'
                                ? 'bg-green-100 text-green-700'
                                : 'bg-amber-100 text-amber-700'
                            }`}
                          >
                            {qs.status === 'conciliado' ? 'Conciliado' : 'Pendente'}
                          </span>
                          <span className="w-10 text-right text-sm font-semibold text-gray-700">
                            {progressPct}%
                          </span>
                        </div>
                      </button>

                      {isExpanded && (
                        <div className="border-t border-[#64ABDE]/20 p-4">
                          {isLoadingConciliation && (
                            <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
                              <Loader2 className="h-4 w-4 animate-spin" />
                              Carregando dados da conciliação...
                            </div>
                          )}
                          {conciliationError && (
                            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                              <p className="font-medium">
                                Não foi possível carregar esta cotação.
                              </p>
                              <p className="mt-1 text-amber-800">
                                {conciliationError}
                              </p>
                            </div>
                          )}

                          {conciliation && conciliation.quote.id === qs.id && (
                            <div className="flex flex-col gap-4">
                              <div className="flex flex-wrap items-start justify-between gap-4">
                                <div>
                                  <h3 className="text-lg font-semibold text-[#1D3140]">
                                    Conciliação de materiais
                                  </h3>
                                  <p className="text-sm text-gray-500 mt-0.5">
                                    Fornecedor:{' '}
                                    <span className="font-semibold text-gray-800">
                                      {conciliation.quote.supplier_name}
                                    </span>
                                    {' · '}
                                    {matchedCount} de {conciliation.items.length}{' '}
                                    itens vinculados
                                  </p>
                                </div>
                                <div className="text-right text-sm text-gray-500">
                                  <p>
                                    Status:{' '}
                                    <span
                                      className={`font-medium ${
                                        conciliation.quote.status === 'conciliado'
                                          ? 'text-green-600'
                                          : 'text-amber-600'
                                      }`}
                                    >
                                      {conciliation.quote.status === 'conciliado'
                                        ? 'Conciliado'
                                        : 'Pendente'}
                                    </span>
                                  </p>
                                </div>
                              </div>
                              <ConciliationTable
                                quote={conciliation.quote}
                                items={conciliation.items}
                                budgetMaterials={conciliation.budgetMaterials}
                              />
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              {selectedQuote && navigationMs !== null && (
                <p className="text-xs text-gray-400">
                  Abertura de {selectedQuote.supplier_name}: {navigationMs}ms
                </p>
              )}

              {budgetId && (
                <div className="flex justify-end pt-4 border-t border-gray-100">
                  <Link
                    href={`/fornecedores/sessao/${sessionId}/cenarios`}
                    className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-5 py-3 text-sm font-medium text-white shadow-sm hover:bg-green-700 transition-colors"
                  >
                    Finalizar Conciliação e Ver Cenários
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>
              )}
            </div>
          )}
        </TabsContent>
      </div>
    </Tabs>
  );
}
