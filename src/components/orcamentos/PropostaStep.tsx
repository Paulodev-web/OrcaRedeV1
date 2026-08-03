"use client";

import Link from 'next/link';
import { AlertTriangle, ArrowRight, FileText, Plus } from 'lucide-react';

import type { ProposalListItem } from '@/services/proposals/repository';
import { brl, formatDateTime, StatusBadge } from '@/components/propostas/shared';

interface PropostaStepProps {
  budgetId: string;
  proposals: ProposalListItem[];
  hasPricing: boolean;
}

/**
 * Etapa 4 da esteira: as propostas deste orçamento.
 *
 * A etapa lista e cria; a edição acontece em `/propostas/[id]`, que é o editor
 * completo. Mesma divisão da precificação — a esteira é o caminho pelo
 * orçamento, e a árvore própria continua servindo a visão entre orçamentos.
 */
export function PropostaStep({ budgetId, proposals, hasPricing }: PropostaStepProps) {
  const novaHref = `/propostas/nova?orcamento=${budgetId}`;

  return (
    <div className="space-y-4">
      {!hasPricing && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            Este orçamento ainda não tem precificação. A proposta puxa os valores dali, então{' '}
            <Link
              href={`/orcamentos/${budgetId}/precificacao`}
              className="font-medium underline underline-offset-2"
            >
              conclua a etapa 3
            </Link>{' '}
            antes de publicar.
          </p>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-brand-navy">Propostas deste orçamento</h2>
          <p className="text-sm text-slate-500">
            {proposals.length === 0
              ? 'Nenhuma proposta criada ainda.'
              : `${proposals.length} ${proposals.length === 1 ? 'proposta' : 'propostas'}.`}
          </p>
        </div>
        <Link
          href={novaHref}
          className="inline-flex items-center gap-1.5 rounded-lg bg-brand-navy px-3 py-2 text-sm font-medium text-white transition hover:brightness-110"
        >
          <Plus className="h-4 w-4" />
          Nova proposta
        </Link>
      </div>

      {proposals.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
          <FileText className="h-8 w-8 text-slate-300" />
          <p className="max-w-md text-sm text-slate-600">
            A proposta reúne o escopo, a curva ABC dos materiais, os valores da precificação e as
            condições comerciais numa peça só — com link público e PDF.
          </p>
          <Link
            href={novaHref}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-blue hover:brightness-90"
          >
            Criar a primeira proposta
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      ) : (
        <ul className="divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 bg-white">
          {proposals.map((proposal) => (
            <li key={proposal.id}>
              <Link
                href={`/propostas/${proposal.id}`}
                className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 transition hover:bg-slate-50"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-brand-navy">
                      {proposal.proposalNumber}.{proposal.version}
                    </span>
                    <StatusBadge status={proposal.status} revokedAt={proposal.revokedAt} />
                  </div>
                  <p className="truncate text-sm text-slate-600">
                    {proposal.projectTitle || 'Sem título'}
                  </p>
                  <p className="text-xs text-slate-400">
                    Atualizada em {formatDateTime(proposal.updatedAt)}
                  </p>
                </div>
                <span className="text-sm font-semibold text-brand-navy">
                  {brl(proposal.grandTotal)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
