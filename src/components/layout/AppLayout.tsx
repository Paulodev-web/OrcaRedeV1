"use client";

import Image from "next/image";
import { useState, type ReactNode } from "react";
import { Menu } from "lucide-react";
import { ON_ENGENHARIA_LOGO_SIZE, ON_ENGENHARIA_LOGO_SRC } from "@/lib/branding";
import { cn } from "@/lib/utils";
import { AppSidebar, type AppSidebarProps, type SidebarSection } from "./AppSidebar";

export interface AppLayoutProps {
  sections: SidebarSection[];
  /** `id` do item da sidebar correspondente à tela atual. */
  activeItemId?: string;
  /** Rodapé do rail — identidade do usuário, sair. */
  sidebarFooter?: AppSidebarProps["footer"];
  /** Cabeçalho contextual — normalmente um `<ModuleHeader />`. */
  header?: ReactNode;
  children: ReactNode;
  /** Classes do `<main>`, para telas que precisam controlar o próprio scroll. */
  contentClassName?: string;
  className?: string;
}

/**
 * Composição do chrome global: sidebar (camada 1) + cabeçalho de módulo
 * (camada 2) + conteúdo.
 *
 * A barra superior com o gatilho do drawer só existe abaixo de `lg`, onde a
 * sidebar não cabe.
 */
export function AppLayout({
  sections,
  activeItemId,
  sidebarFooter,
  header,
  children,
  contentClassName,
  className,
}: AppLayoutProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className={cn("flex min-h-screen bg-brand-surface", className)}>
      <AppSidebar
        sections={sections}
        activeItemId={activeItemId}
        footer={sidebarFooter}
        mobileOpen={mobileOpen}
        onMobileOpenChange={setMobileOpen}
      />

      <div className="flex min-h-screen w-full min-w-0 flex-1 flex-col">
        <div className="sticky top-0 z-40 flex items-center gap-3 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur-sm lg:hidden">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            aria-label="Abrir navegação"
            className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-brand-navy"
          >
            <Menu className="h-5 w-5" />
          </button>
          <Image
            src={ON_ENGENHARIA_LOGO_SRC}
            alt=""
            width={ON_ENGENHARIA_LOGO_SIZE.width}
            height={ON_ENGENHARIA_LOGO_SIZE.height}
            className="h-7 w-auto object-contain"
          />
          <span className="text-sm font-bold text-brand-navy">ON Engenharia</span>
        </div>

        {header}

        <main className={cn("flex-1", contentClassName)}>{children}</main>
      </div>
    </div>
  );
}
