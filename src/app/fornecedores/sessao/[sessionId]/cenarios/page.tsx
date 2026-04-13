import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ArrowLeft, BarChart3 } from 'lucide-react';
import { getQuotationSessionByIdAction } from '@/actions/quotationSessions';
import {
  calculateScenariosAction,
  listQuotesByBudgetAction,
} from '@/actions/supplierQuotes';
import SessionScenariosView from '@/components/suppliers/SessionScenariosView';

interface Props {
  params: Promise<{ sessionId: string }>;
}

export default async function SessionCenariosPage({ params }: Props) {
  const { sessionId } = await params;

  const sessionRes = await getQuotationSessionByIdAction(sessionId);
  if (!sessionRes.success) notFound();

  const session = sessionRes.data;

  if (!session.budget_id) {
    redirect(`/fornecedores/sessao/${sessionId}`);
  }

  const [scenariosResult, quotesResult] = await Promise.all([
    calculateScenariosAction(session.budget_id, sessionId),
    listQuotesByBudgetAction(session.budget_id, sessionId),
  ]);

  const scenarios = scenariosResult.success ? scenariosResult.data : null;
  const quotes = quotesResult.success ? quotesResult.data.quotes : [];

  return (
    <main className="min-h-screen bg-slate-100 p-6 lg:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex items-center gap-4">
          <Link
            href={`/fornecedores/sessao/${sessionId}/conciliacao`}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar para Conciliação
          </Link>
        </div>

        <header className="flex items-start gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-[#64ABDE]/40 bg-[#64ABDE]/15">
            <BarChart3 className="h-6 w-6 text-[#1D3140]" aria-hidden />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-[#1D3140]">
              Análise de Cenários de Compra
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Sessão: <span className="font-medium text-slate-700">{session.title}</span>
              {' · '}
              {quotes.length} fornecedor(es) cotado(s)
            </p>
          </div>
        </header>

        {!scenarios || scenarios.scenarioA.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-200 bg-white p-12 text-center">
            <p className="text-gray-400 text-sm">
              Nenhum item conciliado encontrado para este orçamento.
            </p>
            <p className="mt-2 text-sm text-gray-400">
              Volte à sessão e concilie pelo menos uma proposta para gerar cenários.
            </p>
            <Link
              href={`/fornecedores/sessao/${sessionId}/conciliacao`}
              className="mt-4 inline-block text-sm font-medium text-[#64ABDE] transition-colors hover:text-[#1D3140] hover:underline"
            >
              ← Voltar para conciliação
            </Link>
          </div>
        ) : (
          <SessionScenariosView
            scenarios={scenarios}
            quotes={quotes}
            sessionId={sessionId}
          />
        )}
      </div>
    </main>
  );
}
