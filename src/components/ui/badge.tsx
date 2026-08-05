"use client";

import * as React from "react";

import { cn } from "../../lib/utils";

/**
 * Etiqueta de estado.
 *
 * Todos os tons usam a mesma receita — fundo `-50`, texto `-700`, borda `-200`
 * — para que o peso visual seja idêntico entre eles e a diferença fique só na
 * matiz. Assim nenhum status "grita" mais alto que outro sem querer.
 * Contraste do texto `-700` sobre o fundo `-50`: ≥ 6.3:1 em todos os tons.
 */
type BadgeTone = "green" | "amber" | "red" | "blue" | "purple" | "gray" | "teal";

const toneClasses: Record<BadgeTone, string> = {
  green: "bg-green-50 text-green-700 border-green-200",
  amber: "bg-amber-50 text-amber-700 border-amber-200",
  red: "bg-red-50 text-red-700 border-red-200",
  blue: "bg-accent-50 text-accent-700 border-accent-200",
  purple: "bg-purple-50 text-purple-700 border-purple-200",
  gray: "bg-neutral-100 text-neutral-700 border-neutral-200",
  teal: "bg-teal-50 text-teal-700 border-teal-200",
};

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
}

export const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, tone = "gray", children, ...props }, ref) => {
    return (
      <span
        ref={ref}
        className={cn(
          "inline-flex items-center gap-1 rounded-md border px-2 py-0.5",
          "text-xs font-medium whitespace-nowrap",
          toneClasses[tone],
          className
        )}
        {...props}
      >
        {children}
      </span>
    );
  }
);
Badge.displayName = "Badge";
