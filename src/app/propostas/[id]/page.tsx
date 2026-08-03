import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { createSupabaseServerClient, requireAuthUserId } from '@/lib/supabaseServer';
import { loadBudgetSnapshot } from '@/services/proposals/budgetSnapshot';
import { listPricingScenariosForBudget } from '@/services/proposals/pricingScenarios';
import { loadProposalRecord } from '@/services/proposals/repository';
import { ProposalEditor } from '@/components/propostas/ProposalEditor';
import type {
  ResponsibleChoice,
  ScenarioChoice,
  SegmentChoice,
} from '@/components/propostas/sections/types';

export const metadata: Metadata = {
  title: 'Editor de proposta — OrcaRede',
};

export default async function PropostaEditorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const supabase = await createSupabaseServerClient();

  let userId: string;
  try {
    userId = await requireAuthUserId(supabase);
  } catch {
    return (
      <main className="min-h-screen bg-brand-surface p-6 lg:p-8">
        <div className="mx-auto max-w-3xl rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h1 className="text-xl font-semibold text-brand-navy">Editor de proposta</h1>
          <p className="mt-2 text-sm text-slate-600">Sessão expirada. Entre novamente para continuar.</p>
          <Link href="/" className="mt-4 inline-flex text-sm font-medium text-brand-blue">
            Ir para o portal
          </Link>
        </div>
      </main>
    );
  }

  const record = await loadProposalRecord(supabase, userId, id);
  if (!record) notFound();

  const [responsiblesResult, scenarios, snapshot] = await Promise.all([
    supabase
      .from('technical_responsibles')
      .select('id, full_name, crea')
      .eq('user_id', userId)
      .eq('is_active', true)
      .order('order_index', { ascending: true }),
    listPricingScenariosForBudget(supabase, userId, record.proposal.budgetId),
    loadBudgetSnapshot(supabase, record.proposal.budgetId, userId),
  ]);

  const responsibles: ResponsibleChoice[] = (
    (responsiblesResult.data ?? []) as Record<string, unknown>[]
  ).map((row) => ({
    id: String(row.id ?? ''),
    fullName: typeof row.full_name === 'string' ? row.full_name : '',
    crea: typeof row.crea === 'string' ? row.crea : '',
  }));

  // Responsável inativo continua resolvendo a proposta antiga, mas some do
  // seletor. Reinseri-lo evita que salvar a capa o apague sem querer.
  if (
    record.proposal.technicalResponsibleId &&
    record.responsible &&
    !responsibles.some((item) => item.id === record.proposal.technicalResponsibleId)
  ) {
    responsibles.unshift({
      id: record.proposal.technicalResponsibleId,
      fullName: `${record.responsible.fullName} (inativo)`,
      crea: record.responsible.crea,
    });
  }

  const scenarioChoices: ScenarioChoice[] = scenarios.map((scenario) => ({
    id: scenario.id,
    scenarioName: scenario.scenarioName,
    isPrimary: scenario.isPrimary,
    materialTotal: scenario.materialTotal,
    laborTotal: scenario.laborTotal,
    grandTotal: scenario.grandTotal,
  }));

  const segments: SegmentChoice[] = (snapshot?.segments ?? []).map((segment) => ({
    segmentId: segment.segmentId,
    label: segment.label,
  }));

  return (
    <ProposalEditor
      record={record}
      responsibles={responsibles}
      scenarios={scenarioChoices}
      segments={segments}
    />
  );
}
