import type { Metadata } from 'next';
import Link from 'next/link';

import { createSupabaseServerClient, requireAuthUserId } from '@/lib/supabaseServer';
import { listProposalTemplates } from '@/services/proposals/templates';
import { round2, toNumber } from '@/services/proposals/derive';
import {
  NovaPropostaForm,
  type BudgetChoice,
  type ResponsibleChoice,
  type ScenarioChoice,
} from '@/components/propostas/NovaPropostaForm';

export const metadata: Metadata = {
  title: 'Nova proposta — OrcaRede',
};

export default async function NovaPropostaPage({
  searchParams,
}: {
  searchParams: Promise<{ orcamento?: string }>;
}) {
  const { orcamento } = await searchParams;

  const supabase = await createSupabaseServerClient();

  let userId: string;
  try {
    userId = await requireAuthUserId(supabase);
  } catch {
    return (
      <main className="min-h-screen bg-brand-surface p-6 lg:p-8">
        <div className="mx-auto max-w-3xl rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h1 className="text-xl font-semibold text-brand-navy">Nova proposta</h1>
          <p className="mt-2 text-sm text-slate-600">Sessão expirada. Entre novamente para continuar.</p>
          <Link href="/" className="mt-4 inline-flex text-sm font-medium text-brand-blue">
            Ir para o portal
          </Link>
        </div>
      </main>
    );
  }

  const [budgetsResult, scenariosResult, responsiblesResult, templates] = await Promise.all([
    supabase
      .from('budgets')
      .select('id, project_name, client_name, city, status, updated_at, is_template')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .limit(300),
    supabase
      .from('saved_pricing_budgets')
      .select('id, budget_id, scenario_name, is_primary, valor_materiais, valor_servico, updated_at')
      .eq('user_id', userId)
      .order('is_primary', { ascending: false })
      .order('updated_at', { ascending: false }),
    supabase
      .from('technical_responsibles')
      .select('id, full_name, crea')
      .eq('user_id', userId)
      .eq('is_active', true)
      .order('order_index', { ascending: true }),
    listProposalTemplates(supabase, userId),
  ]);

  const scenarios: ScenarioChoice[] = ((scenariosResult.data ?? []) as Record<string, unknown>[]).map(
    (row) => {
      const materialTotal = round2(Math.max(toNumber(row.valor_materiais), 0));
      const laborTotal = round2(Math.max(toNumber(row.valor_servico), 0));
      return {
        id: String(row.id ?? ''),
        budgetId: String(row.budget_id ?? ''),
        scenarioName: typeof row.scenario_name === 'string' ? row.scenario_name : 'Principal',
        isPrimary: row.is_primary === true,
        materialTotal,
        laborTotal,
        grandTotal: round2(materialTotal + laborTotal),
      };
    },
  );

  const budgets: BudgetChoice[] = ((budgetsResult.data ?? []) as Record<string, unknown>[])
    .filter((row) => row.is_template !== true)
    .map((row) => ({
      id: String(row.id ?? ''),
      name: typeof row.project_name === 'string' ? row.project_name : '(sem nome)',
      clientName: typeof row.client_name === 'string' ? row.client_name : null,
      city: typeof row.city === 'string' ? row.city : null,
      status: typeof row.status === 'string' ? row.status : null,
    }));

  const responsibles: ResponsibleChoice[] = (
    (responsiblesResult.data ?? []) as Record<string, unknown>[]
  ).map((row) => ({
    id: String(row.id ?? ''),
    fullName: typeof row.full_name === 'string' ? row.full_name : '',
    crea: typeof row.crea === 'string' ? row.crea : '',
  }));

  return (
    <NovaPropostaForm
      budgets={budgets}
      scenarios={scenarios}
      responsibles={responsibles}
      templates={templates}
      initialBudgetId={orcamento ?? null}
    />
  );
}
