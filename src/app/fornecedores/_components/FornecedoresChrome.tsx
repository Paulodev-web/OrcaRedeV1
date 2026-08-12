"use client";

import { Package } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { ModuleHeader } from "@/components/layout/ModuleHeader";
import { useAppSidebarChrome } from "@/components/layout/useAppSidebarChrome";

/**
 * Chrome global do módulo Suprimentos: sidebar + cabeçalho de módulo.
 *
 * Extraído de `layout.tsx` (que virou Server Component para poder chamar
 * `requireModuleAccess` antes de renderizar) — `useAppSidebarChrome` usa
 * `useAuth`/`useApp`, então precisa continuar em um client component.
 */
export function FornecedoresChrome({ children }: { children: React.ReactNode }) {
  const { sections, sidebarFooter } = useAppSidebarChrome();

  return (
    <AppLayout
      sections={sections}
      activeItemId="fornecedores"
      sidebarFooter={sidebarFooter}
      header={
        <ModuleHeader
          icon={Package}
          title="Suprimentos"
          description="Cotações de fornecedores, conciliação e cenários de compra."
          breadcrumb={[{ label: "Suprimentos" }]}
        />
      }
    >
      {children}
    </AppLayout>
  );
}
