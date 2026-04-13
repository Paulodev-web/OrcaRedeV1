import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getQuotationSessionByIdAction } from '@/actions/quotationSessions';
import { getConciliationPayloadBySessionAction } from '@/actions/supplierQuotes';
import ConciliationCurationView from '@/components/suppliers/ConciliationCurationView';

interface Props {
  params: Promise<{ sessionId: string }>;
}

export default async function SessionConciliacaoPage({ params }: Props) {
  const { sessionId } = await params;

  const sessionRes = await getQuotationSessionByIdAction(sessionId);
  if (!sessionRes.success) notFound();

  const session = sessionRes.data;

  const payloadRes = await getConciliationPayloadBySessionAction(sessionId);

  return (
    <main className="min-h-screen bg-slate-100 p-6 lg:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="text-sm text-slate-500">
          <Link
            href={`/fornecedores/sessao/${sessionId}`}
            className="text-[#64ABDE] transition-colors hover:text-[#1D3140] hover:underline"
          >
            ← {session.title}
          </Link>
        </div>

        <ConciliationCurationView
          sessionId={sessionId}
          budgetId={session.budget_id}
          initialPayload={payloadRes.success ? payloadRes.data : null}
          initialError={payloadRes.success ? null : payloadRes.error}
        />
      </div>
    </main>
  );
}
