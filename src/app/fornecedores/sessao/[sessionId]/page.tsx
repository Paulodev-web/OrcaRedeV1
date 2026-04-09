import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabaseServer';
import {
  getQuotationSessionByIdAction,
  listExtractionJobsBySessionAction,
} from '@/actions/quotationSessions';
import SessionWorkspace from '@/components/suppliers/SessionWorkspace';
import CompleteSessionButton from '@/components/suppliers/CompleteSessionButton';

interface Props {
  params: Promise<{ sessionId: string }>;
}

export default async function QuotationSessionPage({ params }: Props) {
  const { sessionId } = await params;

  const sessionRes = await getQuotationSessionByIdAction(sessionId);
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

  const jobsRes = await listExtractionJobsBySessionAction(sessionId);
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
      matched_count: items.filter((i) => i.match_status !== 'sem_match').length,
      budget_id: q.budget_id ?? null,
      created_at: q.created_at,
    };
  });

  const initialQuotes = conciliationQuotes.map((q) => ({
    id: q.id,
    supplier_name: q.supplier_name,
    status: q.status,
    created_at: q.created_at,
  }));

  return (
    <main className="min-h-screen bg-gray-50 p-6 lg:p-8">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="text-sm text-gray-500">
          <Link
            href="/fornecedores"
            className="text-[#64ABDE] hover:underline"
          >
            ← Hub de sessões
          </Link>
        </div>

        <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[#1D3140]">
              {session.title}
            </h1>
            <p className="mt-1 text-sm text-gray-500">
              {session.budget_id ? (
                <>
                  Escopo: orçamento{' '}
                  <span className="font-medium text-gray-700">
                    {budgetRow?.project_name ?? '—'}
                  </span>
                </>
              ) : (
                <>Escopo: global (catálogo de materiais)</>
              )}
            </p>
            <p className="mt-1 text-xs text-gray-400">
              Status:{' '}
              <span className="font-medium text-gray-600">
                {session.status === 'active' ? 'Ativa' : 'Encerrada'}
              </span>
            </p>
          </div>
          {session.status === 'active' && (
            <CompleteSessionButton sessionId={sessionId} />
          )}
        </header>

        <SessionWorkspace
          sessionId={sessionId}
          sessionStatus={session.status}
          budgetId={session.budget_id}
          initialJobs={initialJobs}
          initialQuotes={initialQuotes}
          conciliationQuotes={conciliationQuotes}
        />
      </div>
    </main>
  );
}
