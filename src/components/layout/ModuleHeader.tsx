import Link from "next/link";
import { ChevronRight, LayoutGrid } from "lucide-react";
import type { ComponentType, ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface BreadcrumbItem {
  label: string;
  /** Sem `href`, o item vira texto (usado no último nível). */
  href?: string;
  icon?: ComponentType<{ className?: string }>;
}

export interface ModuleHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  /** Ícone da entidade, exibido em um chip à esquerda do título. */
  icon?: ComponentType<{ className?: string }>;
  /** Trilha a partir do Portal (que é prefixado automaticamente). */
  breadcrumb?: BreadcrumbItem[];
  /** Desliga o item "Portal" no início da trilha. */
  showHome?: boolean;
  /** Ações à direita — sino, botões, menus. */
  actions?: ReactNode;
  /** Slot de abas de etapa — normalmente um `<StepTabs />`. */
  tabs?: ReactNode;
  /** Bloco auxiliar entre o título e as ações (ex.: caixa de notas). */
  aside?: ReactNode;
  sticky?: boolean;
  className?: string;
}

const HOME_CRUMB: BreadcrumbItem = { label: "Portal", href: "/", icon: LayoutGrid };

/**
 * Cabeçalho contextual de módulo: breadcrumb, título da entidade e slot de
 * abas. É a camada 2 da navegação — a camada 1 é a `AppSidebar`.
 */
export function ModuleHeader({
  title,
  description,
  icon: Icon,
  breadcrumb = [],
  showHome = true,
  actions,
  tabs,
  aside,
  sticky = false,
  className,
}: ModuleHeaderProps) {
  const crumbs = showHome ? [HOME_CRUMB, ...breadcrumb] : breadcrumb;

  return (
    <header
      className={cn(
        "border-b border-slate-200 bg-white/95 backdrop-blur-sm",
        sticky && "sticky top-0 z-30",
        className,
      )}
    >
      <div className="mx-auto w-full max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
        {crumbs.length > 0 ? (
          <nav
            aria-label="Trilha de navegação"
            className="flex flex-wrap items-center gap-1.5 text-xs text-slate-400"
          >
            {crumbs.map((crumb, index) => {
              const CrumbIcon = crumb.icon;
              const isLast = index === crumbs.length - 1;
              const body = (
                <>
                  {CrumbIcon ? <CrumbIcon className="h-3.5 w-3.5" /> : null}
                  {crumb.label}
                </>
              );

              return (
                <span key={`${crumb.label}-${index}`} className="inline-flex items-center gap-1.5">
                  {index > 0 ? <ChevronRight className="h-3 w-3" aria-hidden /> : null}
                  {crumb.href && !isLast ? (
                    <Link
                      href={crumb.href}
                      className="inline-flex items-center gap-1 transition-colors hover:text-brand-blue"
                    >
                      {body}
                    </Link>
                  ) : (
                    <span
                      className="inline-flex items-center gap-1 font-medium text-slate-600"
                      aria-current={isLast ? "page" : undefined}
                    >
                      {body}
                    </span>
                  )}
                </span>
              );
            })}
          </nav>
        ) : null}

        <div className="mt-3 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            {Icon ? (
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-brand-blue/40 bg-brand-blue/15">
                <Icon className="h-5 w-5 text-brand-navy" />
              </span>
            ) : null}
            <div className="min-w-0">
              <h1 className="truncate text-xl font-bold text-brand-navy sm:text-2xl">{title}</h1>
              {description ? <p className="mt-1 text-sm text-slate-500">{description}</p> : null}
            </div>
          </div>

          {aside || actions ? (
            <div className="flex shrink-0 items-start gap-3">
              {aside}
              {actions}
            </div>
          ) : null}
        </div>

        {tabs ? <div className="mt-4">{tabs}</div> : null}
      </div>
    </header>
  );
}
