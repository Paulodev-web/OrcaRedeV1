"use client";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "./AuthContext";
import { APP_MODULES, type AppModuleId } from "@/components/layout/modules";
// Instrumentação temporária — ver src/lib/perf/openBudget.ts.
import { perfPhase } from "@/lib/perf/openBudget";

interface ModuleAccessContextType {
  /** `true` enquanto a permissão ainda não chegou — módulos ficam visíveis para não piscar. */
  loading: boolean;
  isOrgAdmin: boolean;
  canView: (moduleId: AppModuleId) => boolean;
  /**
   * Pronto para `allowedModuleIds` de `buildAppSidebarSections`/`getPortalModules`.
   * `null` = não filtra (ainda carregando, ou admin vê tudo).
   */
  viewableModuleIds: Set<AppModuleId> | null;
}

/**
 * Espelha `getModuleAccess` (`src/lib/auth/moduleAccess.ts`), mas para a
 * navegação no cliente — sidebar e grade do Portal, que são client components.
 *
 * Segue o padrão cru do `AuthContext`: consulta o Supabase direto do browser
 * em vez de passar por uma Server Action, porque `module_permissions` e as
 * duas RPCs já são protegidas por RLS — o pior caso de um cliente adulterado é
 * ver um item de menu que a URL direta (barrada por `requireModuleAccess`) e as
 * policies recusariam de qualquer forma.
 *
 * Enquanto `loading`, NÃO filtra — mostra tudo. Evita o "sidebar pisca vazia e
 * depois preenche" no caso comum (a seed dá acesso total a quem já é membro), e
 * o caso raro (alguém de fato restrito) permanece protegido pela URL direta.
 */
const ModuleAccessContext = createContext<ModuleAccessContextType | undefined>(undefined);

const ALL_MODULE_IDS = new Set(APP_MODULES.map((mod) => mod.id));

export function ModuleAccessProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [isOrgAdmin, setIsOrgAdmin] = useState(false);
  const [viewable, setViewable] = useState<Set<AppModuleId>>(ALL_MODULE_IDS);

  useEffect(() => {
    let cancelled = false;

    if (!user) {
      setLoading(false);
      setIsOrgAdmin(false);
      setViewable(ALL_MODULE_IDS);
      return;
    }

    setLoading(true);

    async function load() {
      // Três idas EM SÉRIE ao banco — cada uma espera a anterior.
      const fimOrg = perfPhase("permissões:rpc current_org_id (1 de 3, serial)");
      const { data: orgId } = await supabase.rpc("current_org_id");
      fimOrg();
      if (cancelled) return;
      if (!orgId) {
        setIsOrgAdmin(false);
        setViewable(new Set());
        setLoading(false);
        return;
      }

      const fimAdmin = perfPhase("permissões:rpc is_org_admin (2 de 3, serial)");
      const { data: isAdmin } = await supabase.rpc("is_org_admin", { _org_id: orgId });
      fimAdmin();
      if (cancelled) return;
      if (isAdmin === true) {
        setIsOrgAdmin(true);
        setViewable(ALL_MODULE_IDS);
        setLoading(false);
        return;
      }

      const fimPerms = perfPhase("permissões:module_permissions (3 de 3, serial)");
      const { data: rows } = await supabase
        .from("module_permissions")
        .select("module_key, can_view")
        .eq("org_id", orgId)
        .eq("user_id", user!.id);
      fimPerms();
      if (cancelled) return;

      const next = new Set<AppModuleId>(["portal"]);
      for (const row of (rows ?? []) as { module_key: string; can_view: boolean }[]) {
        if (row.can_view) next.add(row.module_key as AppModuleId);
      }
      setIsOrgAdmin(false);
      setViewable(next);
      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const value = useMemo<ModuleAccessContextType>(
    () => ({
      loading,
      isOrgAdmin,
      canView: (moduleId) =>
        moduleId === "portal" || loading || isOrgAdmin || viewable.has(moduleId),
      viewableModuleIds: loading || isOrgAdmin ? null : viewable,
    }),
    [loading, isOrgAdmin, viewable],
  );

  return <ModuleAccessContext.Provider value={value}>{children}</ModuleAccessContext.Provider>;
}

export function useModuleAccess() {
  const context = useContext(ModuleAccessContext);
  if (context === undefined) {
    throw new Error("useModuleAccess deve ser usado dentro de um ModuleAccessProvider");
  }
  return context;
}
