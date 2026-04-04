'use client';

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

export type FornecedoresTab = 'importar' | 'conciliar' | 'cenarios';

type QuoteSummary = {
  id: string;
  supplier_name: string;
  status: string;
  item_count: number;
  matched_count: number;
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
  return `/fornecedores?${p.toString()}`;
}

export default function FornecedoresSuprimentosShell({
  budgets,
  activeTab,
  quoteId,
  budgetId,
  conciliation,
  conciliationError,
  scenarios,
  quotes,
  selectedBudgetName,
}: Props) {
  const router = useRouter();

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

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Suprimentos e Cotações</h1>
        <p className="text-sm text-gray-500 mt-1">
          Importe propostas em PDF, concilie materiais com o orçamento e compare cenários de compra.
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={onTabChange} className="w-full">
        <TabsList className="flex w-full flex-wrap h-auto gap-1 p-1 sm:inline-flex sm:h-10">
          <TabsTrigger value="importar" className="flex-1 sm:flex-none">
            Importar
          </TabsTrigger>
          <TabsTrigger value="conciliar" className="flex-1 sm:flex-none">
            Conciliar
          </TabsTrigger>
          <TabsTrigger value="cenarios" className="flex-1 sm:flex-none">
            Cenários
          </TabsTrigger>
        </TabsList>

        <TabsContent value="importar" className="mt-6">
          <SupplierPdfImporter budgets={budgets} />
        </TabsContent>

        <TabsContent value="conciliar" className="mt-6">
          {!quoteId && (
            <div className="bg-white rounded-lg border border-gray-200 p-10 text-center text-sm text-gray-500">
              <p>Nenhuma cotação selecionada.</p>
              <p className="mt-2">
                Importe um PDF na aba{' '}
                <button
                  type="button"
                  onClick={() => onTabChange('importar')}
                  className="text-blue-600 font-medium hover:underline"
                >
                  Importar
                </button>{' '}
                e salve a cotação para abrir a conciliação aqui.
              </p>
            </div>
          )}

          {quoteId && conciliationError && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-6 text-sm text-amber-900">
              <p className="font-medium">Não foi possível carregar esta cotação.</p>
              <p className="mt-1 text-amber-800">{conciliationError}</p>
              <Link
                href={buildFornecedoresHref('importar', {})}
                className="inline-block mt-4 text-blue-600 hover:underline"
              >
                Voltar para Importar
              </Link>
            </div>
          )}

          {quoteId && conciliation && (
            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">Conciliação de materiais</h2>
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
                      {conciliation.quote.status === 'conciliado' ? 'Conciliado' : 'Pendente'}
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
        </TabsContent>

        <TabsContent value="cenarios" className="mt-6">
          <div className="mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Cenários de compra</h2>
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
      </Tabs>
    </div>
  );
}
