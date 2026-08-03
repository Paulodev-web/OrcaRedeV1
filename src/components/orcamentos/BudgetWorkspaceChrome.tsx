"use client";

import { usePathname } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { Calculator, FileText, Loader2, Map, Package, Zap } from 'lucide-react';
import { useApp } from '@/contexts/AppContext';
import type { Orcamento } from '@/types';
// ⚠️ Importar sempre pelo caminho completo do arquivo (ver aviso em
// src/components/layout/index.ts).
import { AppLayout } from '@/components/layout/AppLayout';
import { ModuleHeader } from '@/components/layout/ModuleHeader';
import { StepTabs, type StepTabItem } from '@/components/layout/StepTabs';
import { useOrcaRedeChrome } from './OrcaRedeChrome';
import { SegmentCoverageBadge } from './segments/SegmentCoverage';
import { WorkSegmentsProvider } from './segments/WorkSegmentsProvider';
import type { BudgetSegmentAssignments, WorkSegment } from '@/services/segments/workSegments';

export type BudgetStepId = 'projeto' | 'materiais' | 'precificacao' | 'proposta';

export interface BudgetWorkspaceChromeProps {
  budget: Orcamento;
  segments: WorkSegment[];
  segmentAssignments: BudgetSegmentAssignments;
  children: ReactNode;
}

/**
 * Chrome da esteira do orçamento — sidebar, cabeçalho da entidade e abas de
 * etapa — mais o carregamento dos dados do orçamento.
 *
 * Vive no `layout.tsx` de `/orcamentos/[budgetId]` de propósito: trocar de
 * etapa remonta a página, mas não este componente, então os dados são buscados
 * uma vez por orçamento aberto, e não a cada aba — o mesmo comportamento que o
 * `activeView` dava no legado.
 */
export function BudgetWorkspaceChrome({
  budget,
  segments,
  segmentAssignments,
  children,
}: BudgetWorkspaceChromeProps) {
  const pathname = usePathname();
  const step: BudgetStepId = pathname?.endsWith('/materiais')
    ? 'materiais'
    : pathname?.endsWith('/precificacao')
      ? 'precificacao'
      : pathname?.endsWith('/proposta')
        ? 'proposta'
        : 'projeto';
  const { sections, sidebarFooter } = useOrcaRedeChrome();
  const {
    currentOrcamento,
    setCurrentOrcamento,
    fetchBudgetDetails,
    fetchPostTypes,
    fetchMaterials,
    fetchItemGroups,
  } = useApp();

  // A rota é a fonte de verdade do orçamento aberto; o `AppContext` vira
  // espelho. As funções de escrita do contexto (upload de planta, por exemplo)
  // continuam publicando por lá, então nada regride enquanto ele existir.
  useEffect(() => {
    if (currentOrcamento?.id !== budget.id) {
      setCurrentOrcamento(budget);
    }
  }, [budget, currentOrcamento?.id, setCurrentOrcamento]);

  // Carga inicial do orçamento. `fetchPostTypes` e `fetchMaterials` têm cache
  // interno no contexto e só batem no banco na primeira vez.
  useEffect(() => {
    fetchBudgetDetails(budget.id);
    fetchPostTypes();
    fetchMaterials();
    if (budget.company_id) {
      fetchItemGroups(budget.company_id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- funções do contexto são estáveis (useCallback)
  }, [budget.id, budget.company_id]);

  const steps: StepTabItem[] = [
    {
      id: 'projeto',
      label: 'Projeto',
      icon: Map,
      href: `/orcamentos/${budget.id}/projeto`,
    },
    {
      id: 'materiais',
      label: 'Materiais',
      icon: Package,
      href: `/orcamentos/${budget.id}/materiais`,
    },
    {
      id: 'precificacao',
      label: 'Precificação',
      icon: Calculator,
      href: `/orcamentos/${budget.id}/precificacao`,
    },
    {
      id: 'proposta',
      label: 'Proposta',
      icon: FileText,
      href: `/orcamentos/${budget.id}/proposta`,
    },
  ];

  // Só libera a etapa depois que o espelho do contexto aponta para este
  // orçamento: sem isso, o primeiro quadro de uma troca de orçamento mostraria
  // os dados do anterior.
  const mirrored = currentOrcamento?.id === budget.id;

  const descriptionParts = [
    `Cliente: ${budget.clientName || 'não definido'}`,
    `Cidade: ${budget.city || 'não definida'}`,
  ];

  return (
    <WorkSegmentsProvider segments={segments} initialAssignments={segmentAssignments}>
      <AppLayout
        sections={sections}
        activeItemId="orca-rede"
        sidebarFooter={sidebarFooter}
        contentClassName={step === 'projeto' ? 'py-4' : 'px-4 py-4 sm:px-6 lg:px-8'}
        header={
          <ModuleHeader
            icon={Zap}
            title={budget.nome || 'Orçamento sem nome'}
            description={descriptionParts.join(' • ')}
            breadcrumb={[
              { label: 'Orçamentos', href: '/orcamentos' },
              { label: budget.nome || 'Orçamento' },
            ]}
            actions={
              <div className="flex flex-wrap items-center gap-2">
                <SegmentCoverageBadge />
                <span
                  className={`inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-medium ${
                    budget.status === 'Finalizado'
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                      : 'border-slate-200 bg-slate-100 text-slate-600'
                  }`}
                >
                  {budget.status}
                </span>
              </div>
            }
            tabs={<StepTabs steps={steps} activeStepId={step} numbered />}
          />
        }
      >
        {mirrored ? (
          children
        ) : (
          <div className="flex items-center justify-center py-20">
            <div className="flex flex-col items-center gap-4 rounded-lg border border-slate-200 bg-white p-8 shadow-sm">
              <Loader2 className="h-8 w-8 animate-spin text-brand-blue" />
              <p className="text-sm text-slate-600">Abrindo “{budget.nome}”…</p>
            </div>
          </div>
        )}
      </AppLayout>
    </WorkSegmentsProvider>
  );
}
