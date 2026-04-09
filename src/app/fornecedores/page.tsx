import Link from 'next/link';
import { createSupabaseServerClient } from '@/lib/supabaseServer';
import { listQuotationSessionsWithStatsAction } from '@/actions/quotationSessions';
import FornecedoresHub from '@/components/suppliers/FornecedoresHub';
import type { BudgetOption } from '@/types';
import { ON_BRAND } from '@/lib/branding';

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

  const heroGradient = `linear-gradient(140deg, ${ON_BRAND.navy} 0%, ${ON_BRAND.midNavy} 45%, ${ON_BRAND.blue} 100%)`;

  return (
    <main className="min-h-screen bg-slate-100 p-6 lg:p-8">
      <div className="mx-auto max-w-7xl space-y-8">
        <div
          className="relative overflow-hidden rounded-2xl p-6 text-white shadow-xl sm:p-8"
          style={{ background: heroGradient }}
        >
          <div className="absolute -right-8 -top-8 h-40 w-40 rounded-full bg-white/5" />
          <div className="absolute bottom-0 left-0 h-24 w-24 -translate-x-1/4 translate-y-1/4 rounded-full bg-white/5" />
          <div className="relative z-10">
            <p className="mb-2 text-xs text-white/80">
              <Link href="/" className="transition-colors hover:text-white hover:underline">
                Portal
              </Link>
              <span className="mx-1 text-white/60">/</span>
              <span className="text-white/90">Suprimentos e Cotações</span>
            </p>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Sessões de cotação</h1>
            <p className="mt-2 max-w-2xl text-sm text-white/90">
              Crie uma sessão por obra ou use o modo global (catálogo). Importe PDFs em lote,
              concilie materiais e compare cenários de compra.
            </p>
          </div>
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
