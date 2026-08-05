"use client";

import { useRouter } from 'next/navigation';
import { useCallback, useMemo, type ReactNode } from 'react';
import { LogOut } from 'lucide-react';
import { useApp } from '@/contexts/AppContext';
import { useAuth } from '@/contexts/AuthContext';
// ⚠️ Importar sempre pelo caminho completo do arquivo (ver aviso em
// src/components/layout/index.ts).
import { buildAppSidebarSections, type AppModule } from '@/components/layout/modules';
import type { SidebarSection } from '@/components/layout/AppSidebar';

/**
 * Contagem de atividade não vista por módulo — zero até `user_module_seen`
 * existir, como no Portal.
 */
const ACTIVITY_COUNTS = {} as const;

export interface OrcaRedeChrome {
  sections: SidebarSection[];
  sidebarFooter: (state: { collapsed: boolean }) => ReactNode;
}

/**
 * Sidebar global das rotas do OrçaRede.
 *
 * Repete o rodapé do Portal (identidade + sair) porque `AdminPortal.tsx`
 * pertence à frente da fundação visual. Extrair esse rodapé para
 * `src/components/layout/**` é pedido registrado, não edição desta frente.
 */
export function useOrcaRedeChrome(): OrcaRedeChrome {
  const router = useRouter();
  const { setActiveModule, setCurrentView } = useApp();
  const { signOut, user } = useAuth();

  /** Módulos que ainda vivem no roteamento por estado do `AppContext`. */
  const openLegacyModule = useCallback(
    (mod: AppModule) => {
      if (mod.legacyModule) setActiveModule(mod.legacyModule);
      if (mod.legacyView) setCurrentView(mod.legacyView);
      router.push('/');
    },
    [router, setActiveModule, setCurrentView]
  );

  const sections = useMemo(
    () => buildAppSidebarSections({ activityCounts: ACTIVITY_COUNTS, onLegacySelect: openLegacyModule }),
    [openLegacyModule]
  );

  const handleLogout = useCallback(async () => {
    try {
      await signOut();
    } catch (err) {
      console.error('Erro ao fazer logout:', err);
    }
  }, [signOut]);

  const userInitial = user?.email ? user.email.charAt(0).toUpperCase() : 'U';

  const sidebarFooter = useCallback(
    ({ collapsed }: { collapsed: boolean }) =>
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
      ),
    [handleLogout, user?.email, userInitial]
  );

  return { sections, sidebarFooter };
}
