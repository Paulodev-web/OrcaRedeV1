"use client";

import Link from "next/link";
import type { ComponentType, ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface StepTabItem {
  id: string;
  label: string;
  /** Destino da etapa. Sem `href` e sem `onSelect`, a etapa vira texto inerte. */
  href?: string;
  /** Alternativa ao `href` para telas ainda navegadas por estado (legado). */
  onSelect?: () => void;
  icon?: ComponentType<{ className?: string }>;
  /** Etapa visível mas indisponível — ex.: falta o dado que a habilita. */
  disabled?: boolean;
  /** Explica no `title` por que a etapa está indisponível. */
  disabledHint?: string;
  /** Slot livre à direita do rótulo — normalmente um `<ActivityDot />`. */
  badge?: ReactNode;
}

export interface StepTabsProps {
  steps: StepTabItem[];
  activeStepId?: string;
  /** Prefixa cada etapa com sua posição (1, 2, 3…). */
  numbered?: boolean;
  size?: "sm" | "md";
  /** Rótulo do `<nav>`. Padrão: "Etapas". */
  ariaLabel?: string;
  className?: string;
}

type StepState = "active" | "idle" | "disabled";

const sizeClasses = {
  sm: "gap-1.5 px-3 py-1.5 text-xs",
  md: "gap-2 px-3.5 py-2 text-sm",
} as const;

const stateClasses: Record<StepState, string> = {
  active: "border-brand-blue/40 bg-brand-blue/15 font-semibold text-brand-navy",
  idle: "border-slate-200 bg-surface font-medium text-slate-600 hover:border-brand-blue/40 hover:text-brand-navy",
  disabled: "cursor-not-allowed border-slate-200 bg-surface font-medium text-slate-300",
};

/**
 * Abas de etapa da esteira — generalização das pills do `SuppliesHeader`.
 *
 * Navegação é livre: uma etapa sem dado continua acessível. `disabled` fica
 * reservado ao caso em que a etapa não tem para onde levar (ex.: ainda não
 * existe sessão/orçamento).
 */
export function StepTabs({
  steps,
  activeStepId,
  numbered = false,
  size = "sm",
  ariaLabel = "Etapas",
  className,
}: StepTabsProps) {
  const iconSize = size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4";

  return (
    <nav aria-label={ariaLabel} className={cn("flex flex-wrap items-center gap-2", className)}>
      {steps.map((step, index) => {
        const isActive = step.id === activeStepId;
        const isDisabled = Boolean(step.disabled) || (!step.href && !step.onSelect);
        const state: StepState = isDisabled ? "disabled" : isActive ? "active" : "idle";
        const Icon = step.icon;

        const stepClass = cn(
          "inline-flex items-center rounded-full border transition-colors",
          sizeClasses[size],
          stateClasses[state],
        );

        const content = (
          <>
            {Icon ? <Icon className={cn(iconSize, "shrink-0")} /> : null}
            {numbered ? <span className="tabular-nums opacity-60">{index + 1}.</span> : null}
            <span>{step.label}</span>
            {step.badge}
          </>
        );

        if (isDisabled) {
          return (
            <span
              key={step.id}
              className={stepClass}
              title={step.disabledHint}
              aria-disabled="true"
            >
              {content}
            </span>
          );
        }

        if (step.href) {
          return (
            <Link
              key={step.id}
              href={step.href}
              className={stepClass}
              aria-current={isActive ? "page" : undefined}
            >
              {content}
            </Link>
          );
        }

        return (
          <button
            key={step.id}
            type="button"
            onClick={step.onSelect}
            className={stepClass}
            aria-current={isActive ? "page" : undefined}
          >
            {content}
          </button>
        );
      })}
    </nav>
  );
}
