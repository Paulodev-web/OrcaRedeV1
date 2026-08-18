"use client";

import { Package } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { ModuleHeader } from "@/components/layout/ModuleHeader";
import { useAppSidebarChrome } from "@/components/layout/useAppSidebarChrome";
import {
  SuppliesHeaderProvider,
  useSuppliesHeaderContext,
} from "@/components/suppliers/SuppliesHeaderContext";

/**
 * Chrome global do módulo Suprimentos: sidebar + cabeçalho de módulo.
 *
 * Há um único `ModuleHeader`, renderizado aqui. Cada página injeta seu título,
 * descrição, abas de etapa e caixa de notas nele via `<SuppliesHeader />`
 * (que não desenha nada por conta própria — apenas registra o conteúdo no
 * `SuppliesHeaderContext` consumido abaixo). Isso evita ter dois cabeçalhos
 * empilhados (um da chrome, outro da página).
 *
 * Extraído de `layout.tsx` (que virou Server Component para poder chamar
 * `requireModuleAccess` antes de renderizar) — `useAppSidebarChrome` usa
 * `useAuth`/`useApp`, então precisa continuar em um client component.
 */
function FornecedoresChromeInner({ children }: { children: React.ReactNode }) {
  const { sections, sidebarFooter } = useAppSidebarChrome();
  const { state } = useSuppliesHeaderContext();

  return (
    <AppLayout
      sections={sections}
      activeItemId="fornecedores"
      sidebarFooter={sidebarFooter}
      header={
        <ModuleHeader
          icon={Package}
          title={state.title ?? "Suprimentos"}
          description={
            state.description ?? "Cotações de fornecedores, conciliação e cenários de compra."
          }
          breadcrumb={[{ label: "Suprimentos", href: "/fornecedores" }, ...(state.breadcrumbExtra ?? [])]}
          tabs={state.tabs}
          aside={state.aside}
          sticky
        />
      }
    >
      {children}
    </AppLayout>
  );
}

export function FornecedoresChrome({ children }: { children: React.ReactNode }) {
  return (
    <SuppliesHeaderProvider>
      <FornecedoresChromeInner>{children}</FornecedoresChromeInner>
    </SuppliesHeaderProvider>
  );
}
