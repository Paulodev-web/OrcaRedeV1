import type { ReactNode } from 'react';
import { AndamentoObraChrome } from '@/components/andamento-obra/AndamentoObraChrome';
import { ModuleHeaderBell } from '@/components/andamento-obra/ModuleHeaderBell';

/**
 * Fica Server Component (async) de propósito: `<ModuleHeaderBell />` busca
 * notificações no Supabase e só funciona server-side. `AndamentoObraChrome`
 * (sidebar global, hooks client) recebe o resultado já renderizado via prop —
 * ver o comentário em `AndamentoObraChrome.tsx` sobre por que a composição é
 * nessa direção e não o inverso.
 */
export default function AndamentoObraLayout({ children }: { children: ReactNode }) {
  return (
    <AndamentoObraChrome bell={<ModuleHeaderBell />}>
      {children}
    </AndamentoObraChrome>
  );
}
