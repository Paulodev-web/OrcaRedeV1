/**
 * Chrome global do sistema — base de navegação em duas camadas.
 *
 *   Camada 1: `AppSidebar`  — navegação entre módulos, colapsável, com badges
 *   Camada 2: `ModuleHeader` — breadcrumb, título da entidade e slot de abas
 *
 * `AppLayout` compõe as duas. `StepTabs` preenche o slot de abas e
 * `ActivityDot` os badges.
 *
 * ⚠️ NÃO importe de `@/components/layout`. Em filesystem case-insensitive
 * (Windows/macOS) esse especificador resolve para o `Layout.tsx` legado, que
 * difere apenas no caixa-alta, e o TypeScript falha com TS1149. Use o caminho
 * do arquivo — `@/components/layout/AppLayout` — ou este barril pelo caminho
 * explícito `@/components/layout/index`. A ambiguidade desaparece quando a
 * Fase 7 remover o `Layout.tsx`.
 */

export { ActivityDot } from "./ActivityDot";
export type { ActivityDotProps, ActivityDotVariant } from "./ActivityDot";

export { AppLayout } from "./AppLayout";
export type { AppLayoutProps } from "./AppLayout";

export { AppSidebar } from "./AppSidebar";
export type { AppSidebarProps, SidebarNavItem, SidebarSection } from "./AppSidebar";

export { ModuleHeader } from "./ModuleHeader";
export type { BreadcrumbItem, ModuleHeaderProps } from "./ModuleHeader";

export { StepTabs } from "./StepTabs";
export type { StepTabItem, StepTabsProps } from "./StepTabs";

export { APP_MODULES, buildAppSidebarSections, getPortalModules } from "./modules";
export type { AppModule, AppModuleId, BuildSidebarSectionsOptions } from "./modules";

export { setSidebarCollapsed, useSidebarCollapsed } from "./sidebarState";
