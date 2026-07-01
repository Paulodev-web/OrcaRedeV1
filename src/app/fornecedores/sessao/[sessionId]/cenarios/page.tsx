import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getQuotationSessionByIdCached } from '@/lib/quotationSessionReads';
import {
  calculateScenariosAction,
  listQuotesByBudgetAction,
  getSessionStockInputsAction,
  getIdealSelectionsAction,
  getPurchaseOrdersAction,
} from '@/actions/supplierQuotes';
import SessionScenariosView from '@/components/suppliers/SessionScenariosView';
import SuppliesHeader from '@/components/suppliers/SuppliesHeader';
import { suppliesPageColumnClass } from '@/lib/suppliesLayout';

interface Props {
  params: Promise<{ sessionId: string }>;
}

export default async function SessionCenariosPage({ params }: Props) {
  const { sessionId } = await params;

  const sessionRes = await getQuotationSessionByIdCached(sessionId);
  if (!sessionRes.success) notFound();

  const session = sessionRes.data;

  if (!session.budget_id) {
    redirect(`/fornecedores/sessao/${sessionId}`);
  }

  const [scenariosResult, quotesResult, stockResult, idealResult, purchaseOrdersResult] =
    await Promise.all([
      calculateScenariosAction(session.budget_id, sessionId),
      listQuotesByBudgetAction(session.budget_id, sessionId),
      getSessionStockInputsAction(sessionId),
      getIdealSelectionsAction(sessionId),
      getPurchaseOrdersAction(sessionId),
    ]);

  const scenarios = scenariosResult.success ? scenariosResult.data : null;
  const quotes = quotesResult.success ? quotesResult.data.quotes : [];
  const initialStock = stockResult.success ? stockResult.data : [];
  const initialIdealSelections = idealResult.success ? idealResult.data : [];
  const initialPurchaseOrders = purchaseOrdersResult.success ? purchaseOrdersResult.data : [];

  return (
    <div className={suppliesPageColumnClass}>
      <SuppliesHeader
        sessionId={sessionId}
        sessionTitle={session.title}
        activeStep="cenarios"
        hasBudget
        title="Análise de Cenários de Compra"
        description={`Sessão com ${quotes.length} fornecedor(es) cotado(s).`}
      />

      {!scenarios || scenarios.scenarioB.items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-200 bg-white p-12 text-center">
          <p className="text-gray-400 text-sm">
            Nenhum material consolidado encontrado neste orçamento.
          </p>
          <p className="mt-2 text-sm text-gray-400">
            Adicione materiais aos postes do orçamento de engenharia para comparar cenários de
            compra.
          </p>
          <Link
            href={`/fornecedores/sessao/${sessionId}`}
            className="mt-4 inline-block text-sm font-medium text-[#64ABDE] transition-colors hover:text-[#1D3140] hover:underline"
          >
            ← Voltar para a sessão
          </Link>
        </div>
      ) : (
        <SessionScenariosView
          scenarios={scenarios}
          quotes={quotes}
          sessionId={sessionId}
          budgetId={session.budget_id}
          initialStock={initialStock}
          initialIdealSelections={initialIdealSelections}
          initialPurchaseOrders={initialPurchaseOrders}
        />
      )}
    </div>
  );
}
