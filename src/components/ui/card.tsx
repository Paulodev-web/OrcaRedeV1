"use client";

import * as React from "react";

import { cn } from "../../lib/utils";

/**
 * Cartão de conteúdo.
 *
 * A profundidade vem da BORDA, não da sombra — sobre o fundo creme, sombra
 * forte suja a cor e envelhece a tela. No repouso o cartão é praticamente
 * plano; ele só sobe (sombra + borda mais escura) sob o ponteiro.
 */
type CardState = "default" | "dragging" | "drop-valid" | "drop-invalid";

const stateClasses: Record<CardState, string> = {
  default:
    "border-neutral-200 shadow-2xs hover:border-neutral-300 hover:shadow-md",
  dragging:
    "scale-[0.98] border-neutral-300 opacity-90 shadow-lg ring-1 ring-neutral-300",
  // O alvo de drop válido é sinalizado por anel + tinta do accent. Sem `scale`:
  // ampliar o alvo empurra os vizinhos do grid e faz o cursor "perder" a mira.
  "drop-valid":
    "border-accent-400 bg-accent-50 shadow-md ring-2 ring-accent-400/60",
  "drop-invalid": "border-red-300 bg-red-50 ring-2 ring-red-300/60",
};

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  state?: CardState;
}

export const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, state = "default", children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          "relative rounded-xl border bg-surface",
          "transition-[border-color,box-shadow,transform,background-color] duration-200",
          stateClasses[state],
          className
        )}
        {...props}
      >
        {children}
      </div>
    );
  }
);
Card.displayName = "Card";
