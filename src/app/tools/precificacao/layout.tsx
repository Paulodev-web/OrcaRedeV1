"use client";

import { Calculator } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { ModuleHeader } from "@/components/layout/ModuleHeader";
import { useAppSidebarChrome } from "@/components/layout/useAppSidebarChrome";

/**
 * Chrome global do módulo Precificação: sidebar + cabeçalho de módulo.
 *
 * Mesma lacuna que Suprimentos tinha: as rotas de `/tools/precificacao`
 * renderizavam direto, sem sidebar. Um `layout.tsx` na raiz da árvore cobre
 * dashboard, nova, editar/[id] de uma vez.
 */
export default function PrecificacaoLayout({ children }: { children: React.ReactNode }) {
  const { sections, sidebarFooter } = useAppSidebarChrome();

  return (
    <AppLayout
      sections={sections}
      activeItemId="precificacao"
      sidebarFooter={sidebarFooter}
      header={
        <ModuleHeader
          icon={Calculator}
          title="Precificação"
          description="Custos, lucro e imposto sobre o valor de serviço."
          breadcrumb={[{ label: "Precificação" }]}
        />
      }
    >
      {children}
    </AppLayout>
  );
}
