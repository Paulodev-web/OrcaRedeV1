"use client";

import { ArrowLeft, Hammer } from "lucide-react";
import { useApp } from "@/contexts/AppContext";
import { AppLayout } from "@/components/layout/AppLayout";
import { ModuleHeader } from "@/components/layout/ModuleHeader";
import { useAppSidebarChrome } from "@/components/layout/useAppSidebarChrome";
import { EngineerPortal } from "@/components/EngineerPortal";

/**
 * Chrome global do Portal do Engenheiro: sidebar + cabeçalho de módulo.
 *
 * Era o último módulo sem sidebar. Diferente dos outros, ele não tem rota
 * própria — é ativado por estado (`activeModule === 'portal-engenheiro'` no
 * `AppContext`) e renderizado pelo `AppShell` dentro de "/". Por isso o chrome
 * entra aqui, e não num `layout.tsx`.
 *
 * O botão "Voltar ao Portal" continua existindo mesmo com a sidebar ao lado:
 * o item "Portal" do rail é um `<Link href="/">` e nós JÁ estamos em "/", então
 * clicar nele não remontaria nada nem limparia `activeModule` — o usuário
 * ficaria preso no módulo. Enquanto o roteamento por estado não virar rota de
 * verdade, esta é a única saída que funciona.
 */
export function EngineerPortalChrome() {
  const { sections, sidebarFooter } = useAppSidebarChrome();
  const { setActiveModule } = useApp();

  return (
    <AppLayout
      sections={sections}
      activeItemId="portal-engenheiro"
      sidebarFooter={sidebarFooter}
      header={
        <ModuleHeader
          icon={Hammer}
          title="Portal do Engenheiro"
          description="Gestão e acompanhamento de instalações em campo."
          breadcrumb={[{ label: "Portal do Engenheiro" }]}
          actions={
            <button
              type="button"
              onClick={() => setActiveModule(null)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-300 bg-surface px-3 py-2 text-sm font-medium text-neutral-700 shadow-2xs transition-colors hover:bg-neutral-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500"
            >
              <ArrowLeft className="h-4 w-4" />
              Voltar ao Portal
            </button>
          }
        />
      }
    >
      <EngineerPortal />
    </AppLayout>
  );
}
