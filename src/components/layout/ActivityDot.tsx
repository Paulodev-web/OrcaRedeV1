import { cn } from "@/lib/utils";

export type ActivityDotVariant = "brand" | "alert" | "warning" | "success" | "neutral";

export interface ActivityDotProps {
  /**
   * Quantidade de itens não vistos. Zero (ou ausente) não renderiza nada,
   * salvo `showZero`.
   */
  count?: number;
  /** Paleta da bolinha. Todas legíveis tanto sobre navy quanto sobre branco. */
  variant?: ActivityDotVariant;
  /** Acima deste valor exibe `{max}+`. Padrão: 99. */
  max?: number;
  /** Só a bolinha, sem número — usado no rail colapsado. */
  dotOnly?: boolean;
  /** Renderiza mesmo com contagem zero. */
  showZero?: boolean;
  /** Complemento do rótulo acessível, ex.: `novidades em Suprimentos`. */
  label?: string;
  className?: string;
}

const variantClasses: Record<ActivityDotVariant, string> = {
  brand: "bg-brand-blue text-brand-navy",
  alert: "bg-red-500 text-white",
  warning: "bg-amber-400 text-amber-950",
  success: "bg-emerald-500 text-white",
  neutral: "bg-slate-300 text-slate-800",
};

/**
 * Bolinha de atividade não vista.
 *
 * A contagem chega sempre por prop — o componente não conhece a fonte de dados.
 * Enquanto `user_module_seen` não existir, os chamadores passam zero e nada é
 * renderizado.
 */
export function ActivityDot({
  count = 0,
  variant = "brand",
  max = 99,
  dotOnly = false,
  showZero = false,
  label,
  className,
}: ActivityDotProps) {
  const safeCount = Number.isFinite(count) ? Math.max(0, Math.trunc(count)) : 0;

  if (safeCount === 0 && !showZero) return null;

  const text = safeCount > max ? `${max}+` : String(safeCount);
  const accessibleLabel = label ? `${text} ${label}` : `${text} novidades`;

  if (dotOnly) {
    return (
      <span
        role="status"
        aria-label={accessibleLabel}
        className={cn(
          "inline-block h-2.5 w-2.5 shrink-0 rounded-full",
          variantClasses[variant],
          className,
        )}
      />
    );
  }

  return (
    <span
      role="status"
      aria-label={accessibleLabel}
      className={cn(
        "inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full px-1.5",
        "text-[11px] font-semibold leading-none tabular-nums",
        variantClasses[variant],
        className,
      )}
    >
      {text}
    </span>
  );
}
