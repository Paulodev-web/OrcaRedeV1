import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabaseServer';
import {
  getQuotationSessionByIdAction,
  listExtractionJobsBySessionAction,
  listQuotesBySessionAction,
} from '@/actions/quotationSessions';
import SessionExtractionRealtime from '@/components/suppliers/SessionExtractionRealtime';
import CompleteSessionButton from '@/components/suppliers/CompleteSessionButton';

interface Props {
  params: Promise<{ sessionId: string }>;
}

export default async function QuotationSessionPage({ params }: Props) {
  const { sessionId } = await params;

  const sessionRes = await getQuotationSessionByIdAction(sessionId);
  if (!sessionRes.success) {
    notFound();
  }

  const session = sessionRes.data;

  const supabase = await createSupabaseServerClient();
  const { data: budgetRow } = session.budget_id
    ? await supabase.from('budgets').select('project_name').eq('id', session.budget_id).single()
    : { data: null };

  const [jobsRes, quotesRes] = await Promise.all([
    listExtractionJobsBySessionAction(sessionId),
    listQuotesBySessionAction(sessionId),
  ]);

  const initialJobs = jobsRes.success ? jobsRes.data.jobs : [];
  const initialQuotes = quotesRes.success ? quotesRes.data.quotes : [];

  return (
    <main className="min-h-screen bg-gray-50 p-6 lg:p-8">
      <div className="max-w-4xl mx-auto space-y-8">
        <div className="text-sm text-gray-500">
          <Link href="/fornecedores" className="text-[#64ABDE] hover:underline">
            ← Hub de sessões
          </Link>
        </div>

        <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[#1D3140]">{session.title}</h1>
            <p className="mt-1 text-sm text-gray-500">
              {session.budget_id ? (
                <>
                  Escopo: orçamento <span className="font-medium text-gray-700">{budgetRow?.project_name ?? '—'}</span>
                </>
              ) : (
                <>Escopo: global (catálogo de materiais)</>
              )}
            </p>
            <p className="mt-1 text-xs text-gray-400">
              Status da sessão:{' '}
              <span className="font-medium text-gray-600">
                {session.status === 'active' ? 'Ativa' : 'Encerrada'}
              </span>
            </p>
          </div>
          {session.status === 'active' && (
            <CompleteSessionButton sessionId={sessionId} />
          )}
        </header>

        <SessionExtractionRealtime
          sessionId={sessionId}
          sessionStatus={session.status}
          initialJobs={initialJobs}
          initialQuotes={initialQuotes}
        />
      </div>
    </main>
  );
}
