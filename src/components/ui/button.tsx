"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";

import { cn } from "../../lib/utils";

/**
 * Botão do sistema.
 *
 * Hierarquia intencional — só existe UMA ação primária por tela. Se dois
 * botões primários aparecem lado a lado, um deles é `secondary`.
 *
 *   primary      ação principal, cor de ação chapada
 *   secondary    ação alternativa, superfície + borda
 *   ghost        ação terciária/ícone, sem peso até o hover
 *   destructive  exclusão; só ganha preenchimento vermelho no hover
 */
type ButtonVariant = "primary" | "secondary" | "ghost" | "destructive";
type ButtonSize = "sm" | "md" | "icon";

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "bg-accent-600 text-white shadow-xs hover:bg-accent-700 active:bg-accent-800 disabled:hover:bg-accent-600",
  secondary:
    "bg-surface text-neutral-700 border border-neutral-300 shadow-2xs hover:bg-neutral-50 hover:border-neutral-400 active:bg-neutral-100 disabled:hover:bg-surface disabled:hover:border-neutral-300",
  ghost:
    "text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100 active:bg-neutral-200 disabled:hover:bg-transparent disabled:hover:text-neutral-500",
  destructive:
    "text-red-600 hover:bg-red-50 hover:text-red-700 active:bg-red-100 disabled:hover:bg-transparent disabled:hover:text-red-600",
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "px-3 py-1.5 text-sm rounded-md",
  md: "px-4 py-2 text-sm rounded-lg",
  icon: "p-1.5 rounded-md",
};

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = "primary",
      size = "md",
      loading = false,
      disabled,
      children,
      ...props
    },
    ref
  ) => {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        className={cn(
          "inline-flex items-center justify-center gap-2 font-medium",
          // `colors` em vez de `all`: transicionar tudo faz o layout tremer
          // quando o botão muda de tamanho ao entrar em loading.
          "transition-colors duration-150",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500",
          "disabled:opacity-50 disabled:cursor-not-allowed",
          variantClasses[variant],
          sizeClasses[size],
          className
        )}
        {...props}
      >
        {loading && <Loader2 className="h-4 w-4 shrink-0 animate-spin" />}
        {children}
      </button>
    );
  }
);
Button.displayName = "Button";
