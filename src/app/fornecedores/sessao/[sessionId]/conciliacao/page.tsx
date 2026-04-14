import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  getQuotationSessionByIdAction,
  listExtractionJobsBySessionAction,
} from '@/actions/quotationSessions';
import { getConciliationPayloadBySessionAction } from '@/actions/supplierQuotes';
import ConciliationCurationView from '@/components/suppliers/ConciliationCurationView';
import SuppliesHeader from '@/components/suppliers/SuppliesHeader';

interface Props {
  params: Promise<{ sessionId: string }>;
}

export default async function SessionConciliacaoPage({ params }: Props) {
  const { sessionId } = await params;

  const sessionRes = await getQuotationSessionByIdAction(sessionId);
  if (!sessionRes.success) notFound();

  const session = sessionRes.data;
  const jobsRes = await listExtractionJobsBySessionAction(sessionId);
  const jobs = jobsRes.success ? jobsRes.data.jobs : [];
  const hasActiveJobs = jobs.some((job) => job.status === 'pending' || job.status === 'processing');
  const hasErroredJobs = jobs.some((job) => job.status === 'error');

  if (hasActiveJobs || hasErroredJobs) {
    return (
      <main className="min-h-screen bg-slate-100 p-6 lg:p-8">
        <div className="mx-auto max-w-3xl space-y-6">
          <SuppliesHeader
            sessionId={sessionId}
            sessionTitle={session.title}
            activeStep="conciliacao"
            title="Conciliação de Materiais"
            description="Valide os vínculos entre itens dos fornecedores e a fonte da verdade."
          />

          <section className="rounded-2xl border border-amber-200 bg-white p-6 shadow-sm">
            <h1 className="text-xl font-semibold text-[#1D3140]">Conciliação ainda indisponível</h1>
            <p className="mt-2 text-sm text-slate-600">
              {hasActiveJobs
                ? 'A IA ainda está processando os PDFs desta sessão. Aguarde a fila terminar para abrir a conciliação.'
                : 'Há jobs com erro nesta sessão. Reprocesse os arquivos com falha para liberar a conciliação.'}
            </p>
            <p className="mt-1 text-sm text-slate-500">
              Volte para a sessão para acompanhar o andamento e tentar o reprocessamento dos erros.
            </p>
            <Link
              href={`/fornecedores/sessao/${sessionId}`}
              className="mt-4 inline-flex items-center rounded-lg bg-[#1D3140] px-4 py-2 text-sm font-medium text-white hover:bg-[#223f52]"
            >
              Voltar para a sessão
            </Link>
          </section>
        </div>
      </main>
    );
  }

  const payloadRes = await getConciliationPayloadBySessionAction(sessionId);

  return (
    <main className="min-h-screen bg-slate-100 p-6 lg:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <SuppliesHeader
          sessionId={sessionId}
          sessionTitle={session.title}
          activeStep="conciliacao"
          title="Conciliação de Materiais"
          description="Valide os vínculos entre itens dos fornecedores e a fonte da verdade."
        />

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
