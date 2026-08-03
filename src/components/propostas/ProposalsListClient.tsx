"use client";

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';
import { FileText, Link2, Plus, Search, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { deleteProposalAction } from '@/actions/proposals';
import type { ProposalListItem } from '@/services/proposals/repository';

import { PropostasShell } from './PropostasShell';
import { StatusBadge, brl, formatDateTime, publicProposalUrl } from './shared';

export function ProposalsListClient({ proposals }: { proposals: ProposalListItem[] }) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [pending, startTransition] = useTransition();

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return proposals;

    return proposals.filter((proposal) =>
      [
        proposal.projectTitle,
        proposal.clientName,
        proposal.city,
        proposal.budgetName ?? '',
        `${proposal.proposalNumber}.${proposal.version}`,
      ]
        .join(' ')
        .toLowerCase()
        .includes(term),
    );
  }, [proposals, query]);

  const handleDelete = (proposal: ProposalListItem) => {
    const label = `${proposal.proposalNumber}.${proposal.version}`;
    if (!window.confirm(`Excluir a proposta ${label}? A ação não pode ser desfeita.`)) return;

    startTransition(async () => {
      const result = await deleteProposalAction(proposal.id);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(`Proposta ${label} excluída.`);
      router.refresh();
    });
  };

  return (
    <PropostasShell
      title="Propostas comerciais"
      description="Etapa 4 da esteira: a proposta nasce do orçamento e da precificação."
      icon={FileText}
      breadcrumb={[{ label: 'Propostas' }]}
      actions={
        <Link
          href="/propostas/nova"
          className="inline-flex items-center gap-2 rounded-lg bg-brand-navy px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-navy-soft"
        >
          <Plus className="h-4 w-4" />
          Nova proposta
        </Link>
      }
    >
      <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="relative mb-5 max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar por cliente, número, obra…"
            className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-700 outline-none transition-colors focus:border-brand-blue"
          />
        </div>

        {filtered.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center">
            <FileText className="mx-auto h-8 w-8 text-slate-300" />
            <p className="mt-3 text-sm font-medium text-slate-600">
              {proposals.length === 0
                ? 'Nenhuma proposta ainda.'
                : 'Nenhuma proposta corresponde à busca.'}
            </p>
            {proposals.length === 0 ? (
              <p className="mt-1 text-sm text-slate-400">
                A proposta é gerada a partir de um orçamento que já tenha precificação salva.
              </p>
            ) : null}
          </div>
        ) : (
          <ul className="grid gap-3">
            {filtered.map((proposal) => (
              <li
                key={proposal.id}
                className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-md bg-brand-navy/5 px-2 py-0.5 text-xs font-semibold tabular-nums text-brand-navy">
                        {proposal.proposalNumber}.{proposal.version}
                      </span>
                      <StatusBadge status={proposal.status} revokedAt={proposal.revokedAt} />
                    </div>

                    <Link
                      href={`/propostas/${proposal.id}`}
                      className="mt-2 block truncate text-base font-semibold text-brand-navy hover:text-brand-blue-deep"
                    >
                      {proposal.projectTitle || proposal.budgetName || 'Proposta sem título'}
                    </Link>

                    <p className="mt-0.5 truncate text-sm text-slate-500">
                      {[proposal.clientName, proposal.city].filter(Boolean).join(' · ') ||
                        'Cliente não informado'}
                    </p>
                    <p className="mt-1 text-xs text-slate-400">
                      Atualizada em {formatDateTime(proposal.updatedAt)}
                    </p>
                  </div>

                  <div className="flex shrink-0 items-center gap-4">
                    <div className="text-right">
                      <p className="text-xs uppercase tracking-wide text-slate-400">Total</p>
                      <p className="text-sm font-semibold tabular-nums text-brand-navy">
                        {brl(proposal.grandTotal)}
                      </p>
                    </div>

                    {proposal.status === 'published' && !proposal.revokedAt ? (
                      <button
                        type="button"
                        onClick={() => {
                          void navigator.clipboard.writeText(publicProposalUrl(proposal.shareToken));
                          toast.success('Link público copiado.');
                        }}
                        title="Copiar link público"
                        className="rounded-lg border border-slate-200 p-2 text-slate-500 transition-colors hover:border-brand-blue hover:text-brand-blue-deep"
                      >
                        <Link2 className="h-4 w-4" />
                      </button>
                    ) : null}

                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => handleDelete(proposal)}
                      title="Excluir proposta"
                      className="rounded-lg border border-slate-200 p-2 text-slate-400 transition-colors hover:border-red-300 hover:text-red-500 disabled:opacity-50"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </PropostasShell>
  );
}
