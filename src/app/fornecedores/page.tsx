import Link from 'next/link';
import { createSupabaseServerClient } from '@/lib/supabaseServer';
import { listQuotationSessionsWithStatsAction } from '@/actions/quotationSessions';
import FornecedoresHub from '@/components/suppliers/FornecedoresHub';
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
    <main className="min-h-screen bg-gray-50 p-6 lg:p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        <div>
          <p className="text-xs text-gray-400 mb-1">
            <Link href="/" className="hover:text-[#64ABDE]">
              Portal
            </Link>
            <span className="mx-1">/</span>
            <span className="text-gray-600">Fornecedores</span>
          </p>
          <h1 className="text-2xl font-bold text-[#1D3140]">Sessões de cotação</h1>
          <p className="text-sm text-gray-500 mt-1">
            Crie uma sessão por obra ou use o modo global (catálogo). Importe PDFs em lote,
            concilie materiais e compare cenários de compra.
          </p>
        </div>

        <FornecedoresHub
          budgets={budgets}
          initialSessions={sessionsResult.success ? sessionsResult.data.sessions : []}
          sessionsError={sessionsResult.success ? null : sessionsResult.error}
        />
      </div>
    </main>
  );
}
