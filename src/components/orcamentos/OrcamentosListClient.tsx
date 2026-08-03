"use client";

import { useRouter } from 'next/navigation';
import { Zap } from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { ModuleHeader } from '@/components/layout/ModuleHeader';
import { Dashboard } from '@/components/Dashboard';
import { useOrcaRedeChrome } from './OrcaRedeChrome';

/**
 * Etapa 0 da esteira: a lista de orçamentos, agora em `/orcamentos`.
 *
 * O `Dashboard` é o mesmo componente do OrçaRede legado — só troca o destino
 * do clique no cartão, que era `setCurrentView('orcamento')` e passa a ser a
 * rota da etapa 1.
 */
export function OrcamentosListClient() {
  const router = useRouter();
  const { sections, sidebarFooter } = useOrcaRedeChrome();

  return (
    <AppLayout
      sections={sections}
      activeItemId="orca-rede"
      sidebarFooter={sidebarFooter}
      contentClassName="px-4 py-6 sm:px-6 lg:px-8"
      header={
        <ModuleHeader
          icon={Zap}
          title="OrçaRede"
          description="Projete a rede, consolide os materiais e siga para a precificação."
          breadcrumb={[{ label: 'Orçamentos' }]}
        />
      }
    >
      <div className="mx-auto w-full max-w-7xl">
        <Dashboard onOpenBudget={(budget) => router.push(`/orcamentos/${budget.id}/projeto`)} />
      </div>
    </AppLayout>
  );
}
