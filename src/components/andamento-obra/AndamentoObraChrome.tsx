"use client";

import type { ReactNode } from "react";
import { ClipboardList } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { ModuleHeader } from "@/components/layout/ModuleHeader";
import { useAppSidebarChrome } from "@/components/layout/useAppSidebarChrome";
import { ModuleSubNav } from "./ModuleSubNav";

export interface AndamentoObraChromeProps {
  children: ReactNode;
  /**
   * `<ModuleHeaderBell />` renderizado pelo `layout.tsx` (Server Component) e
   * passado aqui pronto. Não dá para importar e instanciar um Server
   * Component dentro de um Client Component — só recebê-lo já renderizado via
   * prop, que é a composição que o Next.js prevê para esse caso.
   */
  bell?: ReactNode;
}

/**
 * Chrome global do módulo Andamento de Obra: sidebar + cabeçalho de módulo.
 *
 * Substitui o `ModuleChromeHeader` caseiro (breadcrumb + logo + título feitos
 * à mão) pelo `ModuleHeader` compartilhado, que é o mesmo que Propostas,
 * Configurações e OrçaRede usam — e, com ele, ganha a sidebar global que as
 * rotas de `/tools/andamento-obra` nunca tiveram.
 *
 * O `ModuleSubNav` (abas Obras/Pessoas/Checklists/Notificações/Admin) entra no
 * slot `tabs` do `ModuleHeader`, no lugar de ficar solto abaixo do header.
 */
export function AndamentoObraChrome({ children, bell }: AndamentoObraChromeProps) {
  const { sections, sidebarFooter } = useAppSidebarChrome();

  return (
    <AppLayout
      sections={sections}
      activeItemId="andamento-obra"
      sidebarFooter={sidebarFooter}
      header={
        <ModuleHeader
          icon={ClipboardList}
          title="Andamento de Obra"
          description="Cronograma, marcos e acompanhamento em campo."
          breadcrumb={[{ label: "Andamento de Obra" }]}
          actions={bell}
          tabs={<ModuleSubNav />}
        />
      }
    >
      {children}
    </AppLayout>
  );
}
