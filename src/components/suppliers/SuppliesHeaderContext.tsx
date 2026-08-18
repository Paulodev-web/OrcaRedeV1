'use client';

import { createContext, useContext, useState, type ReactNode } from 'react';
import type { BreadcrumbItem } from '@/components/layout/ModuleHeader';

export interface SuppliesHeaderState {
  title?: ReactNode;
  description?: ReactNode;
  breadcrumbExtra?: BreadcrumbItem[];
  tabs?: ReactNode;
  aside?: ReactNode;
}

interface SuppliesHeaderContextValue {
  state: SuppliesHeaderState;
  setState: (state: SuppliesHeaderState) => void;
}

const SuppliesHeaderContext = createContext<SuppliesHeaderContextValue | null>(null);

/**
 * Permite que cada página de `/fornecedores/*` registre o conteúdo do seu
 * cabeçalho (título, abas, caixa de notas) no `ModuleHeader` único renderizado
 * pela chrome — em vez de cada página desenhar seu próprio cabeçalho.
 */
export function SuppliesHeaderProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SuppliesHeaderState>({});
  return (
    <SuppliesHeaderContext.Provider value={{ state, setState }}>
      {children}
    </SuppliesHeaderContext.Provider>
  );
}

export function useSuppliesHeaderContext() {
  const ctx = useContext(SuppliesHeaderContext);
  if (!ctx) {
    throw new Error('useSuppliesHeaderContext deve ser usado dentro de SuppliesHeaderProvider');
  }
  return ctx;
}
