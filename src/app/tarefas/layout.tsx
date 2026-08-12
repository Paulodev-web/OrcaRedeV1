import type { ReactNode } from 'react';
import { requireModuleAccess } from '@/lib/auth/moduleAccess';

/**
 * Portão de servidor para toda a árvore `/tarefas` — mesmo padrão de
 * `src/app/propostas/layout.tsx`: `requireModuleAccess` cobre sessão ausente e
 * módulo sem permissão com o mesmo redirect. `TarefasChrome` é montado por
 * página (não aqui), porque cada página tem título/ações próprios — mesma
 * composição de `PropostasShell`.
 */
export default async function TarefasLayout({ children }: { children: ReactNode }) {
  await requireModuleAccess('tarefas');
  return <>{children}</>;
}
