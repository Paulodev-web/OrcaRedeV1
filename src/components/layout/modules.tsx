import {
  Calculator,
  ClipboardList,
  FileText,
  Hammer,
  KanbanSquare,
  LayoutGrid,
  Package,
  Settings,
  Zap,
} from "lucide-react";
import type { ComponentType } from "react";
import { ActivityDot } from "./ActivityDot";
import type { SidebarNavItem, SidebarSection } from "./AppSidebar";

export type AppModuleId =
  | "portal"
  | "orca-rede"
  | "propostas"
  | "portal-engenheiro"
  | "andamento-obra"
  | "fornecedores"
  | "precificacao"
  | "tarefas"
  | "configuracoes";

export interface AppModule {
  id: AppModuleId;
  label: string;
  description: string;
  icon: ComponentType<{ className?: string }>;
  /** Etiqueta de área exibida no cartão do Portal. */
  tag?: string;
  /** Rota real. `null` quando o módulo ainda é ativado por estado no `AppContext`. */
  href: string | null;
  /** Valor esperado por `setActiveModule` (apenas módulos legados). */
  legacyModule?: string;
  /** Valor esperado por `setCurrentView` (apenas módulos legados). */
  legacyView?: string;
  status: "active" | "soon";
  /** Agrupamento na sidebar. */
  section: "principal" | "operacao" | "sistema";
}

/**
 * Registro único dos módulos do sistema. Alimenta a sidebar global e a grade
 * do Portal — as duas superfícies deixam de manter listas paralelas.
 */
export const APP_MODULES: AppModule[] = [
  {
    id: "portal",
    label: "Portal",
    description: "Tela de entrada com todos os módulos",
    icon: LayoutGrid,
    href: "/",
    status: "active",
    section: "principal",
  },
  {
    id: "orca-rede",
    label: "OrçaRede",
    description: "Orçamentos de projetos de redes elétricas",
    icon: Zap,
    tag: "Orçamentos",
    href: "/orcamentos",
    status: "active",
    section: "principal",
  },
  {
    id: "propostas",
    label: "Propostas",
    description: "Propostas comerciais, link público e PDF",
    icon: FileText,
    tag: "Comercial",
    href: "/propostas",
    status: "active",
    section: "operacao",
  },
  {
    id: "fornecedores",
    label: "Suprimentos",
    description: "Cotações de fornecedores, conciliação e cenários de compra",
    icon: Package,
    tag: "Compras",
    href: "/fornecedores",
    status: "active",
    section: "operacao",
  },
  {
    id: "precificacao",
    label: "Precificação",
    description: "Custos, lucro e imposto sobre o valor de serviço",
    icon: Calculator,
    tag: "Comercial",
    href: "/tools/precificacao",
    status: "active",
    section: "operacao",
  },
  {
    id: "portal-engenheiro",
    label: "Portal do Engenheiro",
    description: "Gestão e acompanhamento de instalações em campo",
    icon: Hammer,
    tag: "Obras",
    href: null,
    legacyModule: "portal-engenheiro",
    legacyView: "portal-engenheiro",
    status: "active",
    section: "operacao",
  },
  {
    id: "andamento-obra",
    label: "Andamento de Obra",
    description: "Cronograma, marcos e status das obras em execução",
    icon: ClipboardList,
    tag: "Obras",
    href: "/tools/andamento-obra",
    status: "active",
    section: "operacao",
  },
  {
    id: "tarefas",
    label: "Tarefas",
    description: "Quadro de trabalho entre Comercial, Engenharia, Compras e Execução",
    icon: KanbanSquare,
    tag: "Operação",
    href: "/tarefas",
    status: "active",
    section: "operacao",
  },
  {
    id: "configuracoes",
    label: "Configurações",
    description: "Catálogos, dados da empresa e cadastros do sistema",
    icon: Settings,
    tag: "Sistema",
    href: "/configuracoes",
    status: "active",
    section: "sistema",
  },
];

const SECTION_LABELS: Record<AppModule["section"], string | undefined> = {
  principal: undefined,
  operacao: "Módulos",
  sistema: "Sistema",
};

const SECTION_ORDER: AppModule["section"][] = ["principal", "operacao", "sistema"];

/**
 * Módulos que a grade do Portal oferece para abrir (o Portal em si fica de fora).
 *
 * `allowedModuleIds` vem de `useModuleAccess()`
 * (`src/contexts/ModuleAccessContext.tsx`). `undefined`/`null` não filtra —
 * usado enquanto a permissão ainda não chegou, para a grade não piscar vazia.
 */
export function getPortalModules(allowedModuleIds?: Set<AppModuleId> | null): AppModule[] {
  return APP_MODULES.filter(
    (mod) =>
      mod.id !== "portal" &&
      mod.status === "active" &&
      (!allowedModuleIds || allowedModuleIds.has(mod.id)),
  );
}

export interface BuildSidebarSectionsOptions {
  /**
   * Contagem de atividade não vista por módulo. Sem fonte de dados ainda —
   * os chamadores passam zero até `user_module_seen` existir.
   */
  activityCounts?: Partial<Record<AppModuleId, number>>;
  /**
   * Handler dos módulos que ainda não têm rota própria e são ativados por
   * estado no `AppContext`. Sem ele, esses módulos ficam desabilitados.
   */
  onLegacySelect?: (module: AppModule) => void;
  /**
   * Vem de `useModuleAccess()`. `undefined`/`null` não filtra — usado enquanto
   * a permissão ainda não chegou, para a sidebar não piscar vazia. O Portal
   * nunca é filtrado, mesmo com o conjunto vazio.
   */
  allowedModuleIds?: Set<AppModuleId> | null;
}

/** Monta as seções da `AppSidebar` a partir do registro de módulos. */
export function buildAppSidebarSections({
  activityCounts = {},
  onLegacySelect,
  allowedModuleIds,
}: BuildSidebarSectionsOptions = {}): SidebarSection[] {
  return SECTION_ORDER.map((section) => {
    const items: SidebarNavItem[] = APP_MODULES.filter(
      (mod) =>
        mod.section === section &&
        (mod.id === "portal" || !allowedModuleIds || allowedModuleIds.has(mod.id)),
    ).map(
      (mod) => {
        const isSoon = mod.status === "soon";
        const canOpenLegacy = !mod.href && !isSoon && Boolean(onLegacySelect);

        return {
          id: mod.id,
          label: mod.label,
          icon: mod.icon,
          href: isSoon ? undefined : (mod.href ?? undefined),
          onSelect: canOpenLegacy ? () => onLegacySelect?.(mod) : undefined,
          disabled: isSoon,
          hint: isSoon ? "Disponível na próxima fase" : undefined,
          badge: (
            <ActivityDot
              count={activityCounts[mod.id] ?? 0}
              dotOnly
              label={`novidades em ${mod.label}`}
            />
          ),
        };
      },
    );

    return { id: section, label: SECTION_LABELS[section], items };
  }).filter((section) => section.items.length > 0);
}
