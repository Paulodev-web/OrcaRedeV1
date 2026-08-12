"use client";

import { Calculator } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { ModuleHeader } from "@/components/layout/ModuleHeader";
import { useAppSidebarChrome } from "@/components/layout/useAppSidebarChrome";

/**
 * Chrome global do módulo Precificação: sidebar + cabeçalho de módulo.
 *
 * Extraído de `layout.tsx` pelo mesmo motivo de `FornecedoresChrome.tsx`.
 */
export function PrecificacaoChrome({ children }: { children: React.ReactNode }) {
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
