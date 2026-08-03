"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState, type ComponentType, type ReactNode } from "react";
import { ChevronsLeft, ChevronsRight, X } from "lucide-react";
import {
  ON_ENGENHARIA_LOGO_SIZE,
  ON_ENGENHARIA_LOGO_SRC,
  onBrandRailGradientClass,
} from "@/lib/branding";
import { cn } from "@/lib/utils";
import { useSidebarCollapsed } from "./sidebarState";

export interface SidebarNavItem {
  id: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  /** Destino do item. Tem precedência sobre `onSelect`. */
  href?: string;
  /** Alternativa ao `href` para módulos ainda ativados por estado (legado). */
  onSelect?: () => void;
  /** Slot livre à direita do rótulo — normalmente um `<ActivityDot />`. */
  badge?: ReactNode;
  /** Linha auxiliar sob o rótulo, visível apenas com o rail expandido. */
  description?: string;
  disabled?: boolean;
  /** Complemento do `title`, usado para explicar um item indisponível. */
  hint?: string;
}

export interface SidebarSection {
  id: string;
  /** Título da seção. Ausente, os itens aparecem sem cabeçalho. */
  label?: string;
  items: SidebarNavItem[];
}

export interface AppSidebarProps {
  sections: SidebarSection[];
  activeItemId?: string;
  /** Controlado. Omitido, usa o estado global persistido. */
  collapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
  /** Controlado. Omitido, o drawer mobile gerencia o próprio estado. */
  mobileOpen?: boolean;
  onMobileOpenChange?: (open: boolean) => void;
  /** Rodapé do rail — identidade do usuário, sair. Recebe o estado colapsado. */
  footer?: ReactNode | ((state: { collapsed: boolean }) => ReactNode);
  className?: string;
}

/**
 * Navegação global colapsável — camada 1 do modelo de navegação.
 *
 * Desktop: coluna fixa que colapsa para uma faixa de ícones, com o estado
 * persistido entre sessões. Mobile: drawer sobreposto.
 */
export function AppSidebar({
  sections,
  activeItemId,
  collapsed: collapsedProp,
  onCollapsedChange,
  mobileOpen: mobileOpenProp,
  onMobileOpenChange,
  footer,
  className,
}: AppSidebarProps) {
  const [storedCollapsed, setStoredCollapsed] = useSidebarCollapsed();
  const [internalMobileOpen, setInternalMobileOpen] = useState(false);

  const collapsed = collapsedProp ?? storedCollapsed;
  const setCollapsed = onCollapsedChange ?? setStoredCollapsed;
  const mobileOpen = mobileOpenProp ?? internalMobileOpen;
  const setMobileOpen = onMobileOpenChange ?? setInternalMobileOpen;

  // Enquanto o drawer está aberto: Esc fecha e o corpo da página não rola.
  useEffect(() => {
    if (!mobileOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileOpen(false);
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [mobileOpen, setMobileOpen]);

  return (
    <>
      <aside
        className={cn(
          "sticky top-0 hidden h-screen shrink-0 transition-[width] duration-300 ease-in-out lg:block",
          collapsed ? "w-18" : "w-64",
          className,
        )}
      >
        <SidebarPanel
          sections={sections}
          activeItemId={activeItemId}
          collapsed={collapsed}
          onToggleCollapse={() => setCollapsed(!collapsed)}
          footer={footer}
        />
      </aside>

      {mobileOpen ? (
        <div className="lg:hidden">
          <button
            type="button"
            aria-label="Fechar navegação"
            onClick={() => setMobileOpen(false)}
            className="animate-overlay-in fixed inset-0 z-50 cursor-default bg-brand-navy/60 backdrop-blur-[2px]"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Navegação principal"
            className="animate-drawer-in fixed inset-y-0 left-0 z-50 w-72 max-w-[85vw] shadow-2xl"
          >
            <SidebarPanel
              sections={sections}
              activeItemId={activeItemId}
              collapsed={false}
              onClose={() => setMobileOpen(false)}
              onNavigate={() => setMobileOpen(false)}
              footer={footer}
            />
          </div>
        </div>
      ) : null}
    </>
  );
}

interface SidebarPanelProps {
  sections: SidebarSection[];
  activeItemId?: string;
  collapsed: boolean;
  onToggleCollapse?: () => void;
  onClose?: () => void;
  onNavigate?: () => void;
  footer?: AppSidebarProps["footer"];
}

function SidebarPanel({
  sections,
  activeItemId,
  collapsed,
  onToggleCollapse,
  onClose,
  onNavigate,
  footer,
}: SidebarPanelProps) {
  const resolvedFooter = typeof footer === "function" ? footer({ collapsed }) : footer;

  return (
    <div className={cn("flex h-full flex-col text-white", onBrandRailGradientClass)}>
      <div
        className={cn(
          "flex shrink-0 items-center border-b border-white/10 px-4 py-4",
          collapsed ? "flex-col gap-3 px-2" : "gap-3",
        )}
      >
        <Link
          href="/"
          onClick={onNavigate}
          className="flex min-w-0 items-center gap-3 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue"
        >
          <Image
            src={ON_ENGENHARIA_LOGO_SRC}
            alt="ON Engenharia"
            width={ON_ENGENHARIA_LOGO_SIZE.width}
            height={ON_ENGENHARIA_LOGO_SIZE.height}
            priority
            className="h-9 w-auto shrink-0 object-contain"
          />
          {!collapsed ? (
            <span className="min-w-0">
              <span className="block truncate text-sm font-bold leading-tight text-white">
                ON Engenharia
              </span>
              <span className="block truncate text-xs leading-tight text-white/50">
                Sistema integrado
              </span>
            </span>
          ) : null}
        </Link>

        {onToggleCollapse ? (
          <button
            type="button"
            onClick={onToggleCollapse}
            title={collapsed ? "Expandir navegação" : "Recolher navegação"}
            aria-label={collapsed ? "Expandir navegação" : "Recolher navegação"}
            aria-expanded={!collapsed}
            className={cn(
              "rounded-lg p-1.5 text-white/50 transition-colors hover:bg-white/10 hover:text-white",
              !collapsed && "ml-auto",
            )}
          >
            {collapsed ? (
              <ChevronsRight className="h-4 w-4" />
            ) : (
              <ChevronsLeft className="h-4 w-4" />
            )}
          </button>
        ) : null}

        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar navegação"
            className="ml-auto rounded-lg p-1.5 text-white/50 transition-colors hover:bg-white/10 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        ) : null}
      </div>

      <nav
        aria-label="Navegação principal"
        className={cn("flex-1 space-y-6 overflow-y-auto py-4", collapsed ? "px-2" : "px-3")}
      >
        {sections.map((section) => (
          <div key={section.id} className="space-y-1">
            {section.label && !collapsed ? (
              <h2 className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-white/40">
                {section.label}
              </h2>
            ) : null}
            {section.label && collapsed ? (
              <div className="mx-auto mb-2 h-px w-8 bg-white/10" role="presentation" />
            ) : null}
            {section.items.map((item) => (
              <SidebarItem
                key={item.id}
                item={item}
                collapsed={collapsed}
                active={item.id === activeItemId}
                onNavigate={onNavigate}
              />
            ))}
          </div>
        ))}
      </nav>

      {resolvedFooter ? (
        <div className={cn("shrink-0 border-t border-white/10 py-3", collapsed ? "px-2" : "px-3")}>
          {resolvedFooter}
        </div>
      ) : null}
    </div>
  );
}

interface SidebarItemProps {
  item: SidebarNavItem;
  collapsed: boolean;
  active: boolean;
  onNavigate?: () => void;
}

function SidebarItem({ item, collapsed, active, onNavigate }: SidebarItemProps) {
  const Icon = item.icon;
  const disabled = Boolean(item.disabled) || (!item.href && !item.onSelect);

  const itemClass = cn(
    "group/nav relative flex w-full items-center rounded-xl text-sm transition-colors",
    collapsed ? "justify-center px-0 py-2.5" : "gap-3 px-3 py-2.5",
    disabled
      ? "cursor-not-allowed text-white/30"
      : active
        ? "bg-brand-blue/20 text-white ring-1 ring-inset ring-brand-blue/40"
        : "text-white/70 hover:bg-white/10 hover:text-white",
  );

  const iconClass = cn(
    "h-5 w-5 shrink-0 transition-colors",
    disabled
      ? "text-white/25"
      : active
        ? "text-brand-blue-soft"
        : "text-white/60 group-hover/nav:text-brand-blue-soft",
  );

  const title = collapsed ? [item.label, item.hint].filter(Boolean).join(" — ") : item.hint;

  const content = (
    <>
      <Icon className={iconClass} />
      {collapsed ? (
        <span className="sr-only">{item.label}</span>
      ) : (
        <span className="min-w-0 flex-1 text-left">
          <span className="block truncate font-medium">{item.label}</span>
          {item.description ? (
            <span className="block truncate text-xs text-white/40">{item.description}</span>
          ) : null}
        </span>
      )}
      {item.badge ? (
        <span className={collapsed ? "absolute right-2 top-1.5" : "shrink-0"}>{item.badge}</span>
      ) : null}
    </>
  );

  if (disabled) {
    return (
      <span className={itemClass} title={title} aria-disabled="true">
        {content}
      </span>
    );
  }

  if (item.href) {
    return (
      <Link
        href={item.href}
        prefetch
        onClick={onNavigate}
        className={itemClass}
        title={title}
        aria-current={active ? "page" : undefined}
      >
        {content}
      </Link>
    );
  }

  return (
    <button
      type="button"
      onClick={() => {
        item.onSelect?.();
        onNavigate?.();
      }}
      className={itemClass}
      title={title}
      aria-current={active ? "page" : undefined}
    >
      {content}
    </button>
  );
}
