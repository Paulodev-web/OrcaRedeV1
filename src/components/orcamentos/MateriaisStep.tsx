"use client";

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowRight, TowerControl } from 'lucide-react';
import { useApp } from '@/contexts/AppContext';
import { AreaTrabalho } from '@/components/AreaTrabalho';

/**
 * Etapa 2 da esteira.
 *
 * Navegação entre etapas é livre (§7.2): sem poste nenhum a etapa continua
 * acessível, só explica o que falta e oferece o atalho para resolver.
 */
export function MateriaisStep() {
  const params = useParams<{ budgetId: string }>();
  const { budgetDetails, loadingBudgetDetails } = useApp();

  const hasPosts = (budgetDetails?.posts?.length ?? 0) > 0;
  const showEmptyHint = !loadingBudgetDetails && Boolean(budgetDetails) && !hasPosts;

  return (
    <div className="flex flex-col gap-4">
      {showEmptyHint ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <div className="flex items-start gap-3">
            <TowerControl className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
            <div>
              <p className="text-sm font-medium text-amber-900">
                Este orçamento ainda não tem postes.
              </p>
              <p className="text-sm text-amber-700">
                O consolidado de materiais vem da soma dos postes, grupos de itens e materiais
                avulsos do projeto.
              </p>
            </div>
          </div>
          <Link
            href={`/orcamentos/${params?.budgetId}/projeto`}
            className="inline-flex items-center gap-2 rounded-lg border border-amber-300 bg-surface px-3 py-2 text-sm font-medium text-amber-900 transition-colors hover:bg-amber-100"
          >
            Ir para o projeto
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      ) : null}

      <AreaTrabalho embedded view="consolidation" />
    </div>
  );
}
