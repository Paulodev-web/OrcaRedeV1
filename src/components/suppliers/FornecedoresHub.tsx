'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FolderOpen, Globe2, Loader2, Plus } from 'lucide-react';
import type { BudgetOption } from '@/types';
import type { QuotationSessionWithStats } from '@/actions/quotationSessions';
import { createQuotationSessionAction, completeQuotationSessionAction } from '@/actions/quotationSessions';
import NewQuotationSessionModal from '@/components/suppliers/NewQuotationSessionModal';

interface Props {
  budgets: BudgetOption[];
  initialSessions: QuotationSessionWithStats[];
  sessionsError: string | null;
}

export default function FornecedoresHub({
  budgets,
  initialSessions,
  sessionsError,
}: Props) {
  const router = useRouter();
  const [modalOpen, setModalOpen] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const handleComplete = async (sessionId: string) => {
    if (!confirm('Encerrar esta sessão? Novos uploads serão bloqueados.')) return;
    setPendingId(sessionId);
    const res = await completeQuotationSessionAction(sessionId);
    setPendingId(null);
    if (res.success) {
      router.refresh();
    } else {
      alert(res.error);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-[#64ABDE] px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:brightness-95"
        >
          <Plus className="h-4 w-4" />
          Nova sessão de cotação
        </button>
      </div>

      {sessionsError && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {sessionsError}
        </div>
      )}

      <NewQuotationSessionModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        budgets={budgets}
        onCreated={async (input) => {
          const res = await createQuotationSessionAction(input);
          if (!res.success) {
            alert(res.error);
            return;
          }
          setModalOpen(false);
          router.push(`/fornecedores/sessao/${res.data.sessionId}`);
          router.refresh();
        }}
      />

      {initialSessions.length === 0 && !sessionsError ? (
        <div className="rounded-xl border border-dashed border-gray-200 bg-white p-12 text-center text-gray-500">
          <p>Nenhuma sessão ainda.</p>
          <p className="mt-2 text-sm">Crie uma sessão para importar PDFs em lote com processamento em segundo plano.</p>
        </div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {initialSessions.map((s) => (
            <li key={s.id}>
              <div className="flex h-full flex-col rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h2 className="font-semibold text-[#1D3140] truncate">{s.title}</h2>
                    <p className="mt-1 flex items-center gap-1.5 text-xs text-gray-500">
                      {s.budget_id ? (
                        <>
                          <FolderOpen className="h-3.5 w-3.5 shrink-0" />
                          <span>Orçamento vinculado</span>
                        </>
                      ) : (
                        <>
                          <Globe2 className="h-3.5 w-3.5 shrink-0" />
                          <span>Global (catálogo)</span>
                        </>
                      )}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                      s.status === 'active'
                        ? 'bg-emerald-50 text-emerald-800'
                        : 'bg-gray-100 text-gray-600'
                    }`}
                  >
                    {s.status === 'active' ? 'Ativa' : 'Encerrada'}
                  </span>
                </div>

                <dl className="mt-4 grid grid-cols-2 gap-2 text-xs text-gray-600">
                  <div className="rounded-lg bg-gray-50 px-2 py-1.5">
                    <dt className="text-gray-400">Cotações</dt>
                    <dd className="font-semibold text-[#1D3140]">{s.quotesCount}</dd>
                  </div>
                  <div className="rounded-lg bg-gray-50 px-2 py-1.5">
                    <dt className="text-gray-400">Jobs pendentes</dt>
                    <dd className="font-semibold text-amber-700">
                      {s.jobsByStatus.pending + s.jobsByStatus.processing}
                    </dd>
                  </div>
                </dl>

                <div className="mt-4 flex flex-wrap gap-2 border-t border-gray-100 pt-4">
                  <Link
                    href={`/fornecedores/sessao/${s.id}`}
                    className="inline-flex flex-1 items-center justify-center rounded-lg bg-[#64ABDE]/15 px-3 py-2 text-sm font-medium text-[#1D3140] hover:bg-[#64ABDE]/25"
                  >
                    Abrir sessão
                  </Link>
                  {s.status === 'active' && (
                    <button
                      type="button"
                      disabled={pendingId === s.id}
                      onClick={() => void handleComplete(s.id)}
                      className="inline-flex items-center justify-center rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                    >
                      {pendingId === s.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        'Encerrar'
                      )}
                    </button>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
