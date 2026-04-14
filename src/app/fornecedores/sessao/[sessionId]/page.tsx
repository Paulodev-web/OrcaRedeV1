import { notFound } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabaseServer';
import {
  getQuotationSessionByIdCached,
  listExtractionJobsBySessionCached,
} from '@/lib/quotationSessionReads';
import SessionWorkspace from '@/components/suppliers/SessionWorkspace';
import CompleteSessionButton from '@/components/suppliers/CompleteSessionButton';
import SuppliesHeader from '@/components/suppliers/SuppliesHeader';

interface Props {
  params: Promise<{ sessionId: string }>;
}

export default async function QuotationSessionPage({ params }: Props) {
  const { sessionId } = await params;

  const sessionRes = await getQuotationSessionByIdCached(sessionId);
  if (!sessionRes.success) notFound();
  const session = sessionRes.data;

  const supabase = await createSupabaseServerClient();

  const { data: budgetRow } = session.budget_id
    ? await supabase
        .from('budgets')
        .select('project_name')
        .eq('id', session.budget_id)
        .single()
    : { data: null };

  const jobsRes = await listExtractionJobsBySessionCached(sessionId);
  const initialJobs = jobsRes.success ? jobsRes.data.jobs : [];

  const { data: conciliationQuotesRaw } = await supabase
    .from('supplier_quotes')
    .select(
      `
      id,
      supplier_name,
      status,
      budget_id,
      created_at,
      extraction_validated_at,
      supplier_quote_items (id, match_status)
    `
    )
    .eq('session_id', sessionId)
    .order('created_at', { ascending: false });

  const conciliationQuotes = (conciliationQuotesRaw ?? []).map((q) => {
    const items = (q.supplier_quote_items ?? []) as {
      id: string;
      match_status: string;
    }[];
    return {
      id: q.id,
      supplier_name: q.supplier_name,
      status: q.status,
      item_count: items.length,
      matched_count: items.filter((i) => i.match_status === 'automatico' || i.match_status === 'manual').length,
      budget_id: q.budget_id ?? null,
      created_at: q.created_at,
    };
  });

  const initialQuotes = conciliationQuotes.map((q) => {
    const raw = conciliationQuotesRaw?.find((r) => r.id === q.id);
    return {
      id: q.id,
      supplier_name: q.supplier_name,
      status: q.status,
      created_at: q.created_at,
      extraction_validated_at: (raw as Record<string, unknown>)?.extraction_validated_at as string | null ?? null,
    };
  });

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <SuppliesHeader
        sessionId={sessionId}
        sessionTitle={session.title}
        activeStep="cotacoes"
        hasBudget={!!session.budget_id}
        title={session.title}
        description={
          session.budget_id
            ? `Escopo: orçamento ${budgetRow?.project_name ?? '—'}`
            : 'Escopo: global (catálogo de materiais)'
        }
      />

      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-gray-400">
          Status:{' '}
          <span className="font-medium text-gray-600">
            {session.status === 'active' ? 'Ativa' : 'Encerrada'}
          </span>
        </p>
        {session.status === 'active' && (
          <CompleteSessionButton sessionId={sessionId} />
        )}
      </div>

      <SessionWorkspace
        sessionId={sessionId}
        sessionStatus={session.status}
        budgetId={session.budget_id}
        initialJobs={initialJobs}
        initialQuotes={initialQuotes}
        conciliationQuotes={conciliationQuotes}
      />
    </div>
  );
}
