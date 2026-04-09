'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FolderOpen, Globe2, Loader2, MoreVertical, Plus } from 'lucide-react';
import type { BudgetOption } from '@/types';
import type { QuotationSessionWithStats } from '@/actions/quotationSessions';
import {
  completeQuotationSessionAction,
  createQuotationSessionAction,
  deleteQuotationSessionAction,
  updateQuotationSessionAction,
} from '@/actions/quotationSessions';
import NewQuotationSessionModal from '@/components/suppliers/NewQuotationSessionModal';
import { onPortalPrimaryButtonSmClass } from '@/lib/branding';

interface Props {
  budgets: BudgetOption[];
  initialSessions: QuotationSessionWithStats[];
  sessionsError: string | null;
}

function SessionCardKebab({
  isActive,
  pending,
  onEdit,
  onComplete,
  onDelete,
}: {
  isActive: boolean;
  pending: boolean;
  onEdit: () => void;
  onComplete: () => void | Promise<void>;
  onDelete: () => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (rootRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        className="rounded-lg p-1.5 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-800 disabled:opacity-50"
        disabled={pending}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="Ações da sessão"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((o) => !o);
        }}
      >
        {pending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <MoreVertical className="h-4 w-4" />
        )}
      </button>
      {open && (
        <ul
          role="menu"
          className="absolute right-0 top-full z-50 mt-1 min-w-[11rem] rounded-lg border border-gray-200 bg-white py-1 shadow-lg"
          onClick={(e) => e.stopPropagation()}
        >
          <li role="none">
            <button
              type="button"
              role="menuitem"
              className="flex w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
              onClick={() => {
                setOpen(false);
                onEdit();
              }}
            >
              Editar
            </button>
          </li>
          {isActive && (
            <li role="none">
              <button
                type="button"
                role="menuitem"
                className="flex w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
                onClick={() => {
                  setOpen(false);
                  void onComplete();
                }}
              >
                Encerrar
              </button>
            </li>
          )}
          <li role="none">
            <button
              type="button"
              role="menuitem"
              className="flex w-full px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50"
              onClick={() => {
                setOpen(false);
                void onDelete();
              }}
            >
              Excluir
            </button>
          </li>
        </ul>
      )}
    </div>
  );
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
    router.prefetch(`/fornecedores/sessao/${sessionId}`);
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
          className={`inline-flex items-center gap-2 px-4 py-2.5 text-sm ${onPortalPrimaryButtonSmClass}`}
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
              <div className="relative flex h-full flex-col rounded-2xl border border-[#64ABDE]/40 bg-white shadow-md transition-shadow hover:shadow-lg">
                <Link
                  href={`/fornecedores/sessao/${s.id}`}
                  className="absolute inset-0 z-0 rounded-2xl outline-none ring-2 ring-transparent ring-offset-2 focus-visible:ring-[#64ABDE]"
                  aria-label={`Abrir sessão: ${s.title}`}
                  onMouseEnter={() => prefetchSession(s.id)}
                  onFocus={() => prefetchSession(s.id)}
                />
                <div className="relative z-10 flex flex-1 flex-col p-5 pointer-events-none">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <h2 className="truncate font-semibold text-[#1D3140]">{s.title}</h2>
                      <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
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
                    <div className="flex shrink-0 items-center gap-1">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          s.status === 'active'
                            ? 'bg-emerald-50 text-emerald-800'
                            : 'bg-gray-100 text-gray-600'
                        }`}
                      >
                        {s.status === 'active' ? 'Ativa' : 'Encerrada'}
                      </span>
                      <div className="pointer-events-auto">
                        <SessionCardKebab
                          isActive={s.status === 'active'}
                          pending={pendingId === s.id}
                          onEdit={() => {
                            setEditingSession(s);
                            setEditModalOpen(true);
                          }}
                          onComplete={() => handleComplete(s.id)}
                          onDelete={() => handleDelete(s.id)}
                        />
                      </div>
                    </div>
                  </div>

                  <dl className="mt-4 grid grid-cols-2 gap-2 text-xs text-slate-600">
                    <div className="rounded-lg bg-slate-50 px-2 py-1.5">
                      <dt className="text-slate-400">Cotações</dt>
                      <dd className="font-semibold text-[#1D3140]">{s.quotesCount}</dd>
                    </div>
                    <div className="rounded-lg bg-slate-50 px-2 py-1.5">
                      <dt className="text-slate-400">Jobs pendentes</dt>
                      <dd className="font-semibold text-amber-700">
                        {s.jobsByStatus.pending + s.jobsByStatus.processing}
                      </dd>
                    </div>
                  </dl>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
