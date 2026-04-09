'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Upload,
  GitMerge,
  ArrowRight,
  Loader2,
  Brain,
  Database,
  HelpCircle,
  BarChart3,
} from 'lucide-react';
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

function MatchMethodSummary({ items }: { items: SupplierQuoteItemWithMaterial[] }) {
  const memory = items.filter((i) => i.match_method === 'exact_memory').length;
  const ai = items.filter((i) => i.match_method === 'semantic_ai').length;
  const manual = items.filter((i) => i.match_method === 'manual').length;
  const pending = items.filter((i) => i.match_status === 'sem_match').length;

  return (
    <div className="flex flex-wrap gap-2 text-xs">
      {memory > 0 && (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 border border-blue-200">
          <Database className="h-3 w-3" />
          Memória: {memory}
        </span>
      )}
      {ai > 0 && (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 border border-purple-200">
          <Brain className="h-3 w-3" />
          IA: {ai}
        </span>
      )}
      {manual > 0 && (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-100 text-green-700 border border-green-200">
          Manual: {manual}
        </span>
      )}
      {pending > 0 && (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200">
          <HelpCircle className="h-3 w-3" />
          Pendente: {pending}
        </span>
      )}
    </div>
  );
}

export default function SessionWorkspace({
  sessionId,
  sessionStatus,
  budgetId,
  initialJobs,
  initialQuotes,
  conciliationQuotes,
}: Props) {
  const [activeTab, setActiveTab] = useState<SessionTab>('importar');
  const [selectedQuoteId, setSelectedQuoteId] = useState('');
  const [conciliation, setConciliation] = useState<ConciliationPayload | null>(null);
  const [conciliationError, setConciliationError] = useState<string | null>(null);
  const [isLoadingConciliation, setIsLoadingConciliation] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tab = params.get('tab');
    const quoteId = params.get('quoteId');
    if (tab === 'conciliar') setActiveTab('conciliar');
    if (quoteId) setSelectedQuoteId(quoteId);
  }, []);

  useEffect(() => {
    if (!selectedQuoteId) return;
    if (conciliation?.quote.id === selectedQuoteId) return;

    let cancelled = false;
    setIsLoadingConciliation(true);
    setConciliationError(null);
    void getConciliationPayloadByQuoteAction(selectedQuoteId).then((res) => {
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
  }, [selectedQuoteId, conciliation?.quote.id]);

  const onTabChange = (value: string) => {
    const nextTab = value as SessionTab;
    setActiveTab(nextTab);
    const params = new URLSearchParams(window.location.search);
    params.set('tab', nextTab);
    if (nextTab !== 'conciliar') params.delete('quoteId');
    window.history.replaceState({}, '', `?${params.toString()}`);
  };

  const onSelectQuote = (nextQuoteId: string) => {
    const willSelect = selectedQuoteId !== nextQuoteId;
    const nextId = willSelect ? nextQuoteId : '';
    setSelectedQuoteId(nextId);
    const params = new URLSearchParams(window.location.search);
    params.set('tab', 'conciliar');
    if (nextId) params.set('quoteId', nextId);
    else params.delete('quoteId');
    window.history.replaceState({}, '', `?${params.toString()}`);

    if (!nextId) {
      setConciliation(null);
      setConciliationError(null);
    }
  };

  const matchedCount =
    conciliation?.items.filter((i) => i.match_status !== 'sem_match').length ?? 0;
  const hasConciliationQuotes = conciliationQuotes.length > 0;

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
            <div className="flex flex-col gap-6">
              {/* Header */}
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold text-[#1D3140]">
                    Conciliação de propostas
                  </h2>
                  <p className="text-sm text-gray-500 mt-0.5">
                    Selecione uma proposta à esquerda para conciliar os materiais.
                  </p>
                </div>
                {budgetId && (
                  <Link
                    href={`/fornecedores/sessao/${sessionId}/cenarios`}
                    className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-green-600 to-emerald-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm hover:from-green-700 hover:to-emerald-700 transition-all"
                  >
                    <BarChart3 className="h-4 w-4" />
                    Ver Análise de Cenários
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                )}
              </div>

              {/* Master-Detail layout */}
              <div className="flex flex-col lg:flex-row gap-6">
                {/* Master: Cards de propostas */}
                <div className="lg:w-80 lg:shrink-0 space-y-2">
                  {conciliationQuotes.map((qs) => {
                    const isSelected = selectedQuoteId === qs.id;
                    const progressPct =
                      qs.item_count > 0
                        ? Math.round((qs.matched_count / qs.item_count) * 100)
                        : 0;

                    return (
                      <button
                        key={qs.id}
                        type="button"
                        onClick={() => onSelectQuote(qs.id)}
                        className={`w-full rounded-lg border p-4 text-left transition-all ${
                          isSelected
                            ? 'border-[#64ABDE] bg-[#64ABDE]/5 shadow-md ring-1 ring-[#64ABDE]/30'
                            : 'border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm font-semibold text-[#1D3140] truncate">
                            {qs.supplier_name}
                          </p>
                          <span
                            className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                              qs.status === 'conciliado'
                                ? 'bg-green-100 text-green-700'
                                : 'bg-amber-100 text-amber-700'
                            }`}
                          >
                            {qs.status === 'conciliado' ? 'Conciliado' : 'Pendente'}
                          </span>
                        </div>
                        <p className="mt-1.5 text-xs text-gray-500">
                          {qs.matched_count} de {qs.item_count} itens vinculados
                        </p>
                        <div className="mt-2 w-full bg-gray-100 rounded-full h-1.5">
                          <div
                            className={`h-1.5 rounded-full transition-all duration-500 ${
                              progressPct === 100 ? 'bg-green-500' : 'bg-[#64ABDE]'
                            }`}
                            style={{ width: `${progressPct}%` }}
                          />
                        </div>
                        <p className="mt-1 text-xs text-right text-gray-400 font-medium">
                          {progressPct}%
                        </p>
                      </button>
                    );
                  })}
                </div>

                {/* Detail: Tabela de conciliação */}
                <div className="flex-1 min-w-0">
                  {!selectedQuoteId && (
                    <div className="flex items-center justify-center h-64 rounded-lg border-2 border-dashed border-gray-200 bg-gray-50/50">
                      <div className="text-center">
                        <GitMerge className="h-8 w-8 text-gray-300 mx-auto" />
                        <p className="mt-2 text-sm text-gray-400">
                          Selecione uma proposta à esquerda para ver os detalhes.
                        </p>
                      </div>
                    </div>
                  )}

                  {selectedQuoteId && isLoadingConciliation && (
                    <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 p-6 text-sm text-gray-600">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Carregando dados da conciliação...
                    </div>
                  )}

                  {selectedQuoteId && conciliationError && (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                      <p className="font-medium">
                        Não foi possível carregar esta cotação.
                      </p>
                      <p className="mt-1 text-amber-800">{conciliationError}</p>
                    </div>
                  )}

                  {conciliation && conciliation.quote.id === selectedQuoteId && (
                    <div className="flex flex-col gap-4">
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div>
                          <h3 className="text-lg font-semibold text-[#1D3140]">
                            {conciliation.quote.supplier_name}
                          </h3>
                          <p className="text-sm text-gray-500 mt-0.5">
                            {matchedCount} de {conciliation.items.length} itens vinculados
                          </p>
                          <div className="mt-2">
                            <MatchMethodSummary items={conciliation.items} />
                          </div>
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
              </div>

              {budgetId && (
                <div className="flex justify-end pt-4 border-t border-gray-100">
                  <Link
                    href={`/fornecedores/sessao/${sessionId}/cenarios`}
                    className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-green-600 to-emerald-600 px-5 py-3 text-sm font-medium text-white shadow-sm hover:from-green-700 hover:to-emerald-700 transition-all"
                  >
                    <BarChart3 className="h-4 w-4" />
                    Ver Análise de Cenários
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
