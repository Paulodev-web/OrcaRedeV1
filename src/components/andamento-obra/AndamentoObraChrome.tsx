"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { ClipboardList } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { ModuleHeader } from "@/components/layout/ModuleHeader";
import { useAppSidebarChrome } from "@/components/layout/useAppSidebarChrome";

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
 * Dentro de uma obra este cabeçalho sai de cena: o layout da obra monta o seu
 * próprio `ModuleHeader`, com o nome da obra no título e as abas dela. Sem
 * isso seriam dois cabeçalhos empilhados, cada um com a sua trilha e o seu
 * conjunto de abas, que era o que a tela mostrava.
 */
function isWorkDetailRoute(pathname: string | null): boolean {
  return /^\/tools\/andamento-obra\/obras\/[^/]+/.test(pathname ?? "");
}

export function AndamentoObraChrome({ children, bell }: AndamentoObraChromeProps) {
  const { sections, sidebarFooter } = useAppSidebarChrome();
  const pathname = usePathname();
  const inWorkDetail = isWorkDetailRoute(pathname);

  return (
    <AppLayout
      sections={sections}
      activeItemId="andamento-obra"
      sidebarFooter={sidebarFooter}
      header={
        inWorkDetail ? null : (
          <ModuleHeader
            icon={ClipboardList}
            title="Andamento de Obra"
            description="Cronograma, marcos e acompanhamento em campo."
            breadcrumb={[{ label: "Andamento de Obra" }]}
            actions={bell}
          />
        )
      }
    >
      {children}
    </AppLayout>
  );
}
