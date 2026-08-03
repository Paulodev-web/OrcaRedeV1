"use client";

import { useSyncExternalStore } from "react";

/**
 * Estado de "sidebar colapsada", compartilhado por toda a aplicação e
 * persistido em `localStorage`.
 *
 * É um store externo (e não `useState` + efeito) por dois motivos:
 *   - o valor precisa ser o mesmo em qualquer instância da `AppSidebar`;
 *   - `useSyncExternalStore` resolve a leitura pós-hidratação sem escrever
 *     estado dentro de efeito.
 */

const STORAGE_KEY = "orcarede:sidebar-collapsed";

let cached: boolean | null = null;
const listeners = new Set<() => void>();

function getSnapshot(): boolean {
  if (cached !== null) return cached;
  if (typeof window === "undefined") return false;
  try {
    cached = window.localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    cached = false;
  }
  return cached;
}

function getServerSnapshot(): boolean {
  return false;
}

function subscribe(onStoreChange: () => void): () => void {
  listeners.add(onStoreChange);
  return () => {
    listeners.delete(onStoreChange);
  };
}

/** Define o estado colapsado e notifica todas as instâncias montadas. */
export function setSidebarCollapsed(collapsed: boolean): void {
  if (cached === collapsed) return;
  cached = collapsed;
  try {
    window.localStorage.setItem(STORAGE_KEY, collapsed ? "1" : "0");
  } catch {
    // localStorage indisponível (modo privado / SSR) — o estado em memória basta.
  }
  listeners.forEach((listener) => listener());
}

/** `[colapsada, setColapsada]`, com persistência entre sessões. */
export function useSidebarCollapsed(): [boolean, (collapsed: boolean) => void] {
  const collapsed = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return [collapsed, setSidebarCollapsed];
}
