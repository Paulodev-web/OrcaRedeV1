import { createSupabaseServerClient } from '@/lib/supabaseServer';
import { listQuotationSessionsWithStatsAction } from '@/actions/quotationSessions';
import FornecedoresHub from '@/components/suppliers/FornecedoresHub';
import SuppliesHeader from '@/components/suppliers/SuppliesHeader';
import type { BudgetOption } from '@/types';

export const metadata = {
  title: 'Sessões de cotação — OrcaRede',
};

export default async function FornecedoresPage() {
  const sessionsResult = await listQuotationSessionsWithStatsAction();

  const supabase = await createSupabaseServerClient();
  const { data: budgetsRaw } = await supabase
    .from('budgets')
    .select('id, project_name')
    .order('updated_at', { ascending: false });

  const budgets: BudgetOption[] = (budgetsRaw ?? []).map((b) => ({
    id: b.id,
    name: b.project_name ?? '(sem nome)',
  }));

  return (
    <main className="flex min-h-screen flex-col bg-slate-100 p-6 lg:p-8">
      <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-8">
        <SuppliesHeader
          title="Portal de Suprimentos"
          description="Crie sessões de cotação, concilie materiais e compare cenários de compra."
        />

        <FornecedoresHub
          budgets={budgets}
          initialSessions={sessionsResult.success ? sessionsResult.data.sessions : []}
          sessionsError={sessionsResult.success ? null : sessionsResult.error}
        />
      </div>
    </main>
  );
}
