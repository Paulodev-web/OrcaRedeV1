'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FolderOpen, Globe2, Loader2, Pencil, Plus, Trash2 } from 'lucide-react';
import type { BudgetOption } from '@/types';
import type { QuotationSessionWithStats } from '@/actions/quotationSessions';
import {
  completeQuotationSessionAction,
  createQuotationSessionAction,
  deleteQuotationSessionAction,
  updateQuotationSessionAction,
} from '@/actions/quotationSessions';
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
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingSession, setEditingSession] = useState<QuotationSessionWithStats | null>(null);
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

  const prefetchSession = (sessionId: string) => {
    const href = `/fornecedores/sessao/${sessionId}`;
    const start = performance.now();
    router.prefetch(href);
    window.setTimeout(() => {
      const elapsed = Math.round(performance.now() - start);
      console.info(`[perf] prefetch_session ${sessionId}: ${elapsed}ms`);
    }, 0);
  };

  const handleDelete = async (sessionId: string) => {
    const accepted = confirm(
      'Excluir esta sessão? Esta ação é irreversível e também removerá as cotações e itens vinculados.'
    );
    if (!accepted) return;

    setPendingId(sessionId);
    const res = await deleteQuotationSessionAction(sessionId);
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
          onClick={() => setCreateModalOpen(true)}
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
        open={createModalOpen}
        onOpenChange={setCreateModalOpen}
        budgets={budgets}
        mode="create"
        onSubmit={async (input) => {
          const res = await createQuotationSessionAction(input);
          if (!res.success) {
            alert(res.error);
            return;
          }
          setCreateModalOpen(false);
          router.push(`/fornecedores/sessao/${res.data.sessionId}`);
          router.refresh();
        }}
      />
      <NewQuotationSessionModal
        open={editModalOpen}
        onOpenChange={(open) => {
          setEditModalOpen(open);
          if (!open) setEditingSession(null);
        }}
        budgets={budgets}
        mode="edit"
        initialValues={
          editingSession
            ? { title: editingSession.title, budgetId: editingSession.budget_id }
            : undefined
        }
        onSubmit={async (input) => {
          if (!editingSession) return;
          const res = await updateQuotationSessionAction(editingSession.id, input);
          if (!res.success) {
            alert(res.error);
            return;
          }
          setEditModalOpen(false);
          setEditingSession(null);
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
                    onMouseEnter={() => prefetchSession(s.id)}
                    onFocus={() => prefetchSession(s.id)}
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
                  <button
                    type="button"
                    disabled={pendingId === s.id}
                    onClick={() => {
                      setEditingSession(s);
                      setEditModalOpen(true);
                    }}
                    className="inline-flex items-center justify-center rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    disabled={pendingId === s.id}
                    onClick={() => void handleDelete(s.id)}
                    className="inline-flex items-center justify-center rounded-lg border border-red-200 px-3 py-2 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
                  >
                    {pendingId === s.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
