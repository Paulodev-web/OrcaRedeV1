"use client";

import { useRouter } from "next/navigation";
import { useCallback, useMemo, type ReactNode } from "react";
import { LogOut, Settings } from "lucide-react";
import { useApp } from "@/contexts/AppContext";
import { useAuth } from "@/contexts/AuthContext";
// ⚠️ Importar sempre pelo caminho completo do arquivo: no Windows/macOS o
// especificador `@/components/layout` resolve para o `Layout.tsx` legado, que
// difere apenas no caixa-alta.
import { AppLayout } from "@/components/layout/AppLayout";
import { ModuleHeader, type BreadcrumbItem } from "@/components/layout/ModuleHeader";
import { buildAppSidebarSections, type AppModule } from "@/components/layout/modules";
import { ON_ENGENHARIA_LOGO_SRC } from "@/lib/branding";
import { getConfigSection } from "./sections";

export interface ConfigShellProps {
  title: string;
  description?: string;
  /**
   * `id` da seção em `sections.ts`, usado só para resolver o ícone.
   *
   * É um `id` e não o componente do ícone porque as páginas são server
   * components: passar a função do ícone como prop cruzaria a fronteira
   * server → client, que só aceita valores serializáveis.
   */
  sectionId?: string;
  /**
   * Trilha entre "Configurações" e a tela atual. O item "Configurações" já é
   * prefixado; o "Portal" vem do próprio `ModuleHeader`.
   */
  breadcrumb?: BreadcrumbItem[];
  actions?: ReactNode;
  children: ReactNode;
  /** Classes do `<main>`, para telas que controlam o próprio scroll. */
  contentClassName?: string;
}

const CONFIG_CRUMB: BreadcrumbItem = {
  label: "Configurações",
  href: "/configuracoes",
  icon: Settings,
};

/**
 * Chrome das telas de `/configuracoes`: sidebar global + cabeçalho de módulo.
 *
 * Não usa `StepTabs` — Configurações é um hub de telas independentes, não um
 * fluxo em etapas (Escopo §6).
 *
 * A guarda de sessão vive aqui porque estas rotas não passam mais pelo
 * `AppShell`, que era quem decidia entre `<Login />` e o app autenticado.
 */
export function ConfigShell({
  title,
  description,
  sectionId,
  breadcrumb = [],
  actions,
  children,
  contentClassName,
}: ConfigShellProps) {
  const Icon = (sectionId ? getConfigSection(sectionId)?.icon : undefined) ?? Settings;
  const router = useRouter();
  const { session, loading, signOut, user } = useAuth();
  const { setActiveModule, setCurrentView } = useApp();

  /**
   * Módulos que ainda vivem no roteamento por estado do `AppContext`: aponta o
   * estado e volta para "/", onde o `AppShell` legado sabe renderizá-los.
   */
  const openLegacyModule = useCallback(
    (mod: AppModule) => {
      if (mod.legacyModule) setActiveModule(mod.legacyModule);
      if (mod.legacyView) setCurrentView(mod.legacyView);
      router.push("/");
    },
    [router, setActiveModule, setCurrentView],
  );

  const sections = useMemo(
    () => buildAppSidebarSections({ onLegacySelect: openLegacyModule }),
    [openLegacyModule],
  );

  const handleLogout = async () => {
    try {
      await signOut();
    } catch (err) {
      console.error("Erro ao fazer logout:", err);
    }
  };

  const userInitial = user?.email ? user.email.charAt(0).toUpperCase() : "U";

  const sidebarFooter = ({ collapsed }: { collapsed: boolean }) =>
    collapsed ? (
      <button
        type="button"
        onClick={handleLogout}
        title="Sair"
        className="flex w-full items-center justify-center rounded-xl p-2.5 text-rail-foreground-muted transition-colors hover:bg-red-50 hover:text-red-700"
      >
        <LogOut className="h-5 w-5" />
        <span className="sr-only">Sair</span>
      </button>
    ) : (
      <div className="space-y-1">
        <div className="flex items-center gap-2.5 rounded-xl bg-rail-hover px-3 py-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-100 text-sm font-semibold text-accent-700">
            {userInitial}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium text-rail-foreground">{user?.email}</span>
            <span className="block text-xs text-rail-foreground-muted">Administrador</span>
          </span>
        </div>
        <button
          type="button"
          onClick={handleLogout}
          className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-rail-foreground-muted transition-colors hover:bg-red-50 hover:text-red-700"
        >
          <LogOut className="h-4 w-4 shrink-0" />
          Sair
        </button>
      </div>
    );

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-brand-surface">
        <div className="text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={ON_ENGENHARIA_LOGO_SRC}
            alt="ON Engenharia"
            className="mx-auto mb-6 h-14 w-auto object-contain opacity-90"
          />
          <div className="mx-auto h-12 w-12 animate-spin rounded-full border-b-2 border-brand-blue" />
          <p className="mt-4 text-slate-500">Carregando...</p>
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-brand-surface px-4">
        <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-surface p-8 text-center shadow-sm">
          <h1 className="text-xl font-bold text-brand-navy">Sessão expirada</h1>
          <p className="mt-2 text-sm text-slate-500">
            Entre novamente para acessar as configurações do sistema.
          </p>
          <button
            type="button"
            onClick={() => router.push("/")}
            className="mt-6 inline-flex rounded-xl bg-accent-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent-700"
          >
            Ir para o login
          </button>
        </div>
      </div>
    );
  }

  return (
    <AppLayout
      sections={sections}
      activeItemId="configuracoes"
      sidebarFooter={sidebarFooter}
      contentClassName={contentClassName}
      header={
        <ModuleHeader
          icon={Icon}
          title={title}
          description={description}
          breadcrumb={[CONFIG_CRUMB, ...breadcrumb]}
          actions={actions}
        />
      }
    >
      {children}
    </AppLayout>
  );
}
