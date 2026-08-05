"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTheme, type ThemePreference } from "./ThemeProvider";

const OPTIONS: {
  value: ThemePreference;
  label: string;
  icon: typeof Monitor;
}[] = [
  { value: "system", label: "Seguir o sistema", icon: Monitor },
  { value: "light", label: "Tema claro", icon: Sun },
  { value: "dark", label: "Tema escuro", icon: Moon },
];

/**
 * Seletor de tema: sistema / claro / escuro.
 *
 * É um grupo de rádio, não um grupo de botões — as três opções são
 * mutuamente exclusivas e uma está sempre marcada. `role="radiogroup"` +
 * `aria-checked` fazem o leitor de tela anunciar "1 de 3 selecionado", o que
 * `<button>` solto não daria. As setas do teclado navegam entre eles de graça.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();

  return (
    <div
      role="radiogroup"
      aria-label="Aparência"
      className={cn(
        // `surface-sunken` (e não `neutral-100`) na trilha: no tema escuro
        // `neutral-100` e `surface` resolvem para a MESMA cor, e a pílula ativa
        // sumiria. Os papéis mantêm um degrau de diferença nos dois temas.
        "inline-flex items-center gap-0.5 rounded-lg border border-border-subtle bg-surface-sunken p-0.5",
        className,
      )}
    >
      {OPTIONS.map(({ value, label, icon: Icon }) => {
        const active = theme === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={label}
            title={label}
            onClick={() => setTheme(value)}
            className={cn(
              "flex h-7 w-8 items-center justify-center rounded-md transition-colors duration-150",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500",
              active
                // A opção marcada "sobe" — superfície elevada sobre a trilha
                // rebaixada. É o mesmo recurso do resto do sistema: elevação
                // por superfície, não por cor chapada.
                ? "bg-surface-raised text-neutral-900 shadow-2xs"
                : "text-neutral-500 hover:text-neutral-800",
            )}
          >
            <Icon className="h-4 w-4" />
          </button>
        );
      })}
    </div>
  );
}

/**
 * Linha pronta de configuração — rótulo à esquerda, controle à direita.
 */
export function ThemeToggleRow({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-4 rounded-xl border border-neutral-200 bg-surface px-4 py-3",
        className,
      )}
    >
      <div className="min-w-0">
        <p className="text-sm font-medium text-neutral-900">Aparência</p>
        <p className="mt-0.5 text-xs text-neutral-500">
          Escolha entre o tema claro, o escuro ou acompanhar a preferência do sistema.
        </p>
      </div>
      <ThemeToggle className="shrink-0" />
    </div>
  );
}
