import type { ReactNode } from 'react';
import { AndamentoObraChrome } from '@/components/andamento-obra/AndamentoObraChrome';
import { ModuleHeaderBell } from '@/components/andamento-obra/ModuleHeaderBell';
import { requireModuleAccess } from '@/lib/auth/moduleAccess';

/**
 * Fica Server Component (async) de propósito: `<ModuleHeaderBell />` busca
 * notificações no Supabase e só funciona server-side. `AndamentoObraChrome`
 * (sidebar global, hooks client) recebe o resultado já renderizado via prop —
 * ver o comentário em `AndamentoObraChrome.tsx` sobre por que a composição é
 * nessa direção e não o inverso.
 *
 * `requireModuleAccess` também cobre sessão ausente (redireciona para "/"),
 * que este layout não checava antes — as páginas internas tinham cada uma a
 * sua própria checagem; esta é a primeira na raiz da árvore.
 */
export default async function AndamentoObraLayout({ children }: { children: ReactNode }) {
  await requireModuleAccess('andamento-obra');

  return (
    <AndamentoObraChrome bell={<ModuleHeaderBell />}>
      {children}
    </AndamentoObraChrome>
  );
}
