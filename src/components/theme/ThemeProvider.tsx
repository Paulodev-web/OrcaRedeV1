"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

/** `system` segue a preferência do SO; os outros dois fixam o tema. */
export type ThemePreference = "system" | "light" | "dark";
/** Tema efetivamente pintado na tela — `system` já resolvido. */
export type ResolvedTheme = "light" | "dark";

/** Chave no localStorage. Espelhada no script anti-flash (ver `themeScript`). */
export const THEME_STORAGE_KEY = "orcarede-theme";

interface ThemeContextValue {
  /** O que o usuário escolheu. */
  theme: ThemePreference;
  /** O que está pintado agora (`system` já resolvido para light/dark). */
  resolvedTheme: ResolvedTheme;
  setTheme: (theme: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const DARK_QUERY = "(prefers-color-scheme: dark)";

function resolve(theme: ThemePreference): ResolvedTheme {
  if (theme !== "system") return theme;
  if (typeof window === "undefined") return "light";
  return window.matchMedia(DARK_QUERY).matches ? "dark" : "light";
}

function applyTheme(resolved: ResolvedTheme) {
  const root = document.documentElement;
  root.dataset.theme = resolved;
  // `color-scheme` faz o navegador pintar no tema certo o que não é nosso:
  // barras de rolagem, campos nativos, o `<select>` e o date picker.
  root.style.colorScheme = resolved;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  // Sem leitura de localStorage aqui: no servidor ele não existe, e ler no
  // primeiro render do cliente causaria divergência de hidratação. O script
  // anti-flash já pintou o tema certo antes do React montar; este estado só
  // sincroniza depois.
  const [theme, setThemeState] = useState<ThemePreference>("system");
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>("light");

  useEffect(() => {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    const initial: ThemePreference =
      stored === "light" || stored === "dark" || stored === "system" ? stored : "system";
    setThemeState(initial);
    setResolvedTheme(resolve(initial));
  }, []);

  // No modo `system`, acompanha a troca no SO em tempo real.
  useEffect(() => {
    if (theme !== "system") return;
    const media = window.matchMedia(DARK_QUERY);
    const onChange = () => {
      const next = media.matches ? "dark" : "light";
      setResolvedTheme(next);
      applyTheme(next);
    };
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [theme]);

  const setTheme = useCallback((next: ThemePreference) => {
    setThemeState(next);
    window.localStorage.setItem(THEME_STORAGE_KEY, next);
    const resolved = resolve(next);
    setResolvedTheme(resolved);
    applyTheme(resolved);
  }, []);

  const value = useMemo(
    () => ({ theme, resolvedTheme, setTheme }),
    [theme, resolvedTheme, setTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme precisa estar dentro de <ThemeProvider>.");
  return ctx;
}

/**
 * Script anti-flash. Roda ANTES da primeira pintura, direto no `<head>`.
 *
 * Sem ele o HTML aparece no tema claro e "pisca" para o escuro quando o React
 * hidrata — o efeito é pior que não ter tema escuro. Precisa ser síncrono,
 * inline e sem dependência de bundle, por isso é uma string.
 *
 * A chave do localStorage está duplicada aqui de propósito: importar a
 * constante exigiria carregar o módulo, o que já derrota o objetivo.
 */
export const themeScript = `
(function () {
  try {
    var stored = localStorage.getItem('orcarede-theme');
    var pref = stored === 'light' || stored === 'dark' ? stored : null;
    var dark = pref
      ? pref === 'dark'
      : window.matchMedia('(prefers-color-scheme: dark)').matches;
    var theme = dark ? 'dark' : 'light';
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
  } catch (e) {}
})();
`;
