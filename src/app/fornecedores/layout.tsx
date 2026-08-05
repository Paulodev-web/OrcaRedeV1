"use client";

import { Package } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { ModuleHeader } from "@/components/layout/ModuleHeader";
import { useAppSidebarChrome } from "@/components/layout/useAppSidebarChrome";

/**
 * Chrome global do módulo Suprimentos: sidebar + cabeçalho de módulo.
 *
 * Antes desta camada, todas as rotas de `/fornecedores` renderizavam um
 * `<main>` isolado — sem sidebar, sem link para os outros módulos. Aplica-se
 * uma vez aqui e cobre as ~5 páginas da árvore (raiz, cadastro, sessão e suas
 * sub-rotas), sem precisar tocar em cada `page.tsx`.
 *
 * O título/descrição fica genérico de propósito: as páginas internas (lista de
 * sessões, cadastro de fornecedor, cenários de compra) já têm seu próprio
 * `SuppliesHeader` como segunda camada de contexto — este é só o cabeçalho de
 * módulo, igual ao que `PropostasShell`/`ConfigShell` fazem para os deles.
 */
export default function FornecedoresLayout({ children }: { children: React.ReactNode }) {
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
