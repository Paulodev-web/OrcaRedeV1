'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import SupplierPdfImporter from '@/components/SupplierPdfImporter';
import ConciliationTable from '@/components/suppliers/ConciliationTable';
import PurchaseScenariosPanel from '@/components/suppliers/PurchaseScenariosPanel';
import type { BudgetOption, SupplierQuote } from '@/types';
import type {
  BudgetMaterialOption,
  ScenariosResult,
  SupplierQuoteItemWithMaterial,
} from '@/actions/supplierQuotes';
import Link from 'next/link';
import {
  ArrowLeft,
  BarChart3,
  ChevronRight,
  GitMerge,
  Grid3X3,
  Package,
  Upload,
} from 'lucide-react';

export type FornecedoresTab = 'importar' | 'conciliar' | 'cenarios';

type QuoteSummary = {
  id: string;
  supplier_name: string;
  status: string;
  item_count: number;
  matched_count: number;
  budget_id: string | null;
};

export interface ConciliationPayload {
  quote: SupplierQuote;
  items: SupplierQuoteItemWithMaterial[];
  budgetMaterials: BudgetMaterialOption[];
}

interface Props {
  budgets: BudgetOption[];
  activeTab: FornecedoresTab;
  quoteId: string;
  budgetId: string;
  conciliationQuotes: QuoteSummary[];
  conciliation: ConciliationPayload | null;
  conciliationError: string | null;
  scenarios: ScenariosResult | null;
  quotes: QuoteSummary[] | null;
  selectedBudgetName?: string;
}

function buildFornecedoresHref(
  tab: FornecedoresTab,
  opts: { quoteId?: string; budgetId?: string }
) {
  const p = new URLSearchParams();
  p.set('tab', tab);
  if (opts.quoteId) p.set('quoteId', opts.quoteId);
  if (opts.budgetId) p.set('budgetId', opts.budgetId);
  return `/fornecedores/trabalho?${p.toString()}`;
}

const tabTriggerClass =
  'group inline-flex flex-1 min-w-0 sm:flex-none items-center justify-center gap-2 rounded-none rounded-t-lg border border-transparent border-b-0 px-4 py-2.5 text-sm font-medium text-gray-600 shadow-none transition-colors ' +
  'data-[state=active]:bg-[#64ABDE]/15 data-[state=active]:text-[#1D3140] data-[state=active]:border-gray-200 data-[state=active]:shadow-none ' +
  'data-[state=inactive]:text-gray-600 ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#64ABDE] focus-visible:ring-offset-2';

const tabIconClass =
  'h-4 w-4 shrink-0 text-gray-400 group-data-[state=active]:text-[#64ABDE]';

export default function FornecedoresSuprimentosShell({
  budgets,
  activeTab,
  quoteId,
  budgetId,
  conciliationQuotes,
  conciliation,
  conciliationError,
  scenarios,
  quotes,
  selectedBudgetName,
}: Props) {
  const router = useRouter();
  const [expandedQuoteId, setExpandedQuoteId] = useState(quoteId);

  useEffect(() => {
    setExpandedQuoteId(quoteId);
  }, [quoteId]);

  const onTabChange = (value: string) => {
    const next = value as FornecedoresTab;
    const href = buildFornecedoresHref(next, {
      quoteId: quoteId || undefined,
      budgetId: budgetId || undefined,
    });
    router.replace(href);
  };

  const matchedCount =
    conciliation?.items.filter((i) => i.match_status !== 'sem_match').length ?? 0;
  const hasConciliationQuotes = conciliationQuotes.length > 0;

  const onConciliationCardToggle = (nextQuoteId: string) => {
    const willExpand = expandedQuoteId !== nextQuoteId;
    const nextExpandedId = willExpand ? nextQuoteId : '';
    setExpandedQuoteId(nextExpandedId);
    router.replace(
      buildFornecedoresHref('conciliar', {
        quoteId: nextExpandedId || undefined,
        budgetId: budgetId || undefined,
      })
    );
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="text-xs text-gray-400 flex items-center gap-1.5 flex-wrap">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 transition-colors hover:text-[#64ABDE]"
        >
          <Grid3X3 className="w-3.5 h-3.5 shrink-0" aria-hidden />
          <span>Portal</span>
        </Link>
        <ChevronRight className="w-3 h-3 shrink-0 opacity-70" aria-hidden />
        <Link
          href="/fornecedores"
          className="text-gray-600 font-medium transition-colors hover:text-[#64ABDE]"
        >
          Sessões
        </Link>
        <ChevronRight className="w-3 h-3 shrink-0 opacity-70" aria-hidden />
        <span className="text-gray-600 font-medium">Modo clássico</span>
      </div>

      <div className="flex items-start gap-3 sm:gap-4">
        <Link
          href="/"
          className="mt-1 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-600 shadow-sm transition-colors hover:bg-gray-50 hover:text-[#1D3140]"
          aria-label="Voltar ao portal"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
        </Link>
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-[#64ABDE]/40 bg-[#64ABDE]/15">
          <Package className="h-6 w-6 text-[#64ABDE]" aria-hidden />
        </div>
        <div className="min-w-0 flex-1 pt-0.5">
          <h1 className="text-2xl font-bold text-[#1D3140]">Suprimentos e Cotações</h1>
          <p className="text-sm text-gray-500 mt-1">
            Importe propostas em PDF, concilie materiais com o orçamento e compare cenários de compra.
          </p>
        </div>
      </div>

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
          <TabsTrigger value="cenarios" className={tabTriggerClass}>
            <BarChart3 className={tabIconClass} aria-hidden />
            Cenários de compra
          </TabsTrigger>
        </TabsList>

        <div className="rounded-b-xl border border-t-0 border-gray-200 bg-white px-6 py-6 shadow-sm lg:px-8 lg:py-8">
          <TabsContent value="importar" className="mt-0 focus-visible:ring-0">
            <SupplierPdfImporter budgets={budgets} embedded />
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
                  e salve a cotação para abrir a conciliação aqui.
                </p>
              </div>
            )}

            {hasConciliationQuotes && (
              <div className="flex flex-col gap-4">
                <div>
                  <h2 className="text-lg font-semibold text-[#1D3140]">Conciliação de propostas</h2>
                  <p className="text-sm text-gray-500 mt-0.5">
                    Clique em uma proposta para expandir e conciliar os materiais.
                  </p>
                </div>
                <div className="space-y-3">
                  {conciliationQuotes.map((quoteSummary) => {
                    const isExpanded = expandedQuoteId === quoteSummary.id;
                    const progressPct =
                      quoteSummary.item_count > 0
                        ? Math.round((quoteSummary.matched_count / quoteSummary.item_count) * 100)
                        : 0;
                    return (
                      <div
                        key={quoteSummary.id}
                        className={`rounded-lg border transition-colors ${
                          isExpanded
                            ? 'border-[#64ABDE]/50 bg-[#64ABDE]/5'
                            : 'border-gray-200 bg-white hover:border-gray-300'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => onConciliationCardToggle(quoteSummary.id)}
                          className="flex w-full items-center justify-between gap-4 p-4 text-left"
                        >
                          <div className="min-w-0">
                            <p className="text-base font-semibold text-[#1D3140]">
                              {quoteSummary.supplier_name}
                            </p>
                            <p className="mt-1 text-sm text-gray-500">
                              {quoteSummary.matched_count} de {quoteSummary.item_count} itens vinculados
                            </p>
                          </div>
                          <div className="flex items-center gap-3">
                            <span
                              className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                                quoteSummary.status === 'conciliado'
                                  ? 'bg-green-100 text-green-700'
                                  : 'bg-amber-100 text-amber-700'
                              }`}
                            >
                              {quoteSummary.status === 'conciliado' ? 'Conciliado' : 'Pendente'}
                            </span>
                            <span className="w-10 text-right text-sm font-semibold text-gray-700">
                              {progressPct}%
                            </span>
                          </div>
                        </button>
                        {isExpanded && (
                          <div className="border-t border-[#64ABDE]/20 p-4">
                            {conciliationError && (
                              <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                                <p className="font-medium">Não foi possível carregar esta cotação.</p>
                                <p className="mt-1 text-amber-800">{conciliationError}</p>
                              </div>
                            )}
                            {conciliation && conciliation.quote.id === quoteSummary.id && (
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
                                      {matchedCount} de {conciliation.items.length} itens vinculados
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
              </div>
            )}
          </TabsContent>

          <TabsContent value="cenarios" className="mt-0 focus-visible:ring-0">
            <div className="mb-6">
              <h2 className="text-lg font-semibold text-[#1D3140]">Cenários de compra</h2>
              <p className="text-sm text-gray-500 mt-0.5">
                Compare fornecedores e encontre a estratégia de menor custo.
              </p>
            </div>
            <PurchaseScenariosPanel
              budgets={budgets}
              selectedBudgetId={budgetId}
              selectedBudgetName={selectedBudgetName}
              scenarios={scenarios}
              quotes={quotes}
            />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
