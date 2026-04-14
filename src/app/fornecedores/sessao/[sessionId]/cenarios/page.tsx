import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getQuotationSessionByIdAction } from '@/actions/quotationSessions';
import {
  calculateScenariosAction,
  listQuotesByBudgetAction,
  getSessionStockInputsAction,
} from '@/actions/supplierQuotes';
import SessionScenariosView from '@/components/suppliers/SessionScenariosView';
import SuppliesHeader from '@/components/suppliers/SuppliesHeader';

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

  const [scenariosResult, quotesResult, stockResult] = await Promise.all([
    calculateScenariosAction(session.budget_id, sessionId),
    listQuotesByBudgetAction(session.budget_id, sessionId),
    getSessionStockInputsAction(sessionId),
  ]);

  const scenarios = scenariosResult.success ? scenariosResult.data : null;
  const quotes = quotesResult.success ? quotesResult.data.quotes : [];
  const initialStock = stockResult.success ? stockResult.data : [];

  return (
    <main className="min-h-screen bg-slate-100 p-6 lg:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <SuppliesHeader
          sessionId={sessionId}
          sessionTitle={session.title}
          activeStep="cenarios"
          title="Análise de Cenários de Compra"
          description={`Sessão com ${quotes.length} fornecedor(es) cotado(s).`}
        />

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
            budgetId={session.budget_id}
            initialStock={initialStock}
          />
        )}
      </div>
    </main>
  );
}
