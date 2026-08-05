"use client";

import { useMemo, type ReactNode } from 'react';
import { LogOut } from 'lucide-react';

// ⚠️ Sempre pelo caminho completo do arquivo: em filesystem case-insensitive
// `@/components/layout` resolve para o `Layout.tsx` legado (TS1149).
import { AppLayout } from '@/components/layout/AppLayout';
import { ModuleHeader, type BreadcrumbItem } from '@/components/layout/ModuleHeader';
import { buildAppSidebarSections } from '@/components/layout/modules';
import { useAuth } from '@/contexts/AuthContext';

/**
 * Chrome das telas de proposta: sidebar global + cabeçalho de módulo.
 *
 * PEDIDO REGISTRADO (§16.4/1): `src/components/layout/modules.tsx` não pertence
 * a esta frente, então não há entrada "Propostas" na sidebar ainda. Enquanto
 * ela não existir, a navegação para cá é por URL e pelos links das telas de
 * orçamento. Nenhum módulo fica marcado como ativo no rail.
 */

export interface PropostasShellProps {
  title: ReactNode;
  description?: ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
  breadcrumb?: BreadcrumbItem[];
  actions?: ReactNode;
  tabs?: ReactNode;
  children: ReactNode;
  contentClassName?: string;
}

export function PropostasShell({
  title,
  description,
  icon,
  breadcrumb = [],
  actions,
  tabs,
  children,
  contentClassName,
}: PropostasShellProps) {
  const { user, signOut } = useAuth();
  const sections = useMemo(() => buildAppSidebarSections(), []);

  const sidebarFooter = ({ collapsed }: { collapsed: boolean }) =>
    collapsed ? (
      <button
        type="button"
        onClick={() => void signOut()}
        title="Sair"
        className="flex w-full items-center justify-center rounded-xl p-2.5 text-rail-foreground-muted transition-colors hover:bg-red-50 hover:text-red-700"
      >
        <LogOut className="h-5 w-5" />
        <span className="sr-only">Sair</span>
      </button>
    ) : (
      <div className="flex items-center justify-between gap-2 rounded-xl bg-rail-hover px-3 py-2">
        <span className="min-w-0 truncate text-xs text-rail-foreground-muted">{user?.email ?? 'Sessão'}</span>
        <button
          type="button"
          onClick={() => void signOut()}
          title="Sair"
          className="shrink-0 rounded-lg p-1.5 text-rail-foreground-muted transition-colors hover:bg-red-50 hover:text-red-700"
        >
          <LogOut className="h-4 w-4" />
          <span className="sr-only">Sair</span>
        </button>
      </div>
    );

  return (
    <AppLayout
      sections={sections}
      sidebarFooter={sidebarFooter}
      contentClassName={contentClassName}
      header={
        <ModuleHeader
          title={title}
          description={description}
          icon={icon}
          breadcrumb={breadcrumb}
          actions={actions}
          tabs={tabs}
        />
      }
    >
      {children}
    </AppLayout>
  );
}
