import {
  calculateScenariosAction,
  getBudgetMaterialsAction,
  getQuoteWithItemsAction,
  listQuotesByBudgetAction,
} from '@/actions/supplierQuotes';
import { createSupabaseServerClient } from '@/lib/supabaseServer';
import FornecedoresSuprimentosShell, {
  type ConciliationPayload,
  type FornecedoresTab,
} from '@/components/suppliers/FornecedoresSuprimentosShell';
import type { BudgetOption } from '@/types';

export const metadata = {
  title: 'Suprimentos e Cotações — OrcaRede',
};

const VALID_TABS: FornecedoresTab[] = ['importar', 'conciliar', 'cenarios'];

interface Props {
  searchParams: Promise<{ tab?: string; quoteId?: string; budgetId?: string }>;
}

export default async function FornecedoresPage({ searchParams }: Props) {
  const params = await searchParams;
  const tabRaw = params.tab ?? 'importar';
  const activeTab: FornecedoresTab = VALID_TABS.includes(tabRaw as FornecedoresTab)
    ? (tabRaw as FornecedoresTab)
    : 'importar';

  const quoteId = typeof params.quoteId === 'string' ? params.quoteId : '';
  const budgetId = typeof params.budgetId === 'string' ? params.budgetId : '';

  const supabase = await createSupabaseServerClient();
  const { data: budgetsRaw } = await supabase
    .from('budgets')
    .select('id, project_name')
    .order('updated_at', { ascending: false });

  const budgets: BudgetOption[] = (budgetsRaw ?? []).map((b) => ({
    id: b.id,
    name: b.project_name ?? '(sem nome)',
  }));

  const selectedBudgetName = budgets.find((b) => b.id === budgetId)?.name;

  let conciliation: ConciliationPayload | null = null;
  let conciliationError: string | null = null;

  if (quoteId) {
    const quoteResult = await getQuoteWithItemsAction(quoteId);
    if (quoteResult.success) {
      const mats = await getBudgetMaterialsAction(quoteResult.data.quote.budget_id);
      conciliation = {
        quote: quoteResult.data.quote,
        items: quoteResult.data.items,
        budgetMaterials: mats.success ? mats.data.materials : [],
      };
    } else {
      conciliationError = quoteResult.error;
    }
  }

  let scenarios = null;
  let quotes = null;

  if (activeTab === 'cenarios' && budgetId) {
    const [scenariosResult, quotesResult] = await Promise.all([
      calculateScenariosAction(budgetId),
      listQuotesByBudgetAction(budgetId),
    ]);
    if (scenariosResult.success) scenarios = scenariosResult.data;
    if (quotesResult.success) quotes = quotesResult.data.quotes;
  }

  return (
    <main className="min-h-screen bg-gray-50 p-6 lg:p-8">
      <div className="max-w-7xl mx-auto">
        <FornecedoresSuprimentosShell
          budgets={budgets}
          activeTab={activeTab}
          quoteId={quoteId}
          budgetId={budgetId}
          conciliation={conciliation}
          conciliationError={conciliationError}
          scenarios={scenarios}
          quotes={quotes}
          selectedBudgetName={selectedBudgetName}
        />
      </div>
    </main>
  );
}
