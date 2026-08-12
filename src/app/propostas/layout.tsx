import type { ReactNode } from 'react';
import { requireModuleAccess } from '@/lib/auth/moduleAccess';

/**
 * Portão de servidor para toda a árvore `/propostas`.
 *
 * Não havia NENHUMA checagem de servidor aqui antes — `requireModuleAccess`
 * cobre sessão ausente e módulo sem permissão com o mesmo redirect, então esta
 * camada resolve as duas coisas de uma vez (ver `moduleAccess.ts`).
 */
export default async function PropostasLayout({ children }: { children: ReactNode }) {
  await requireModuleAccess('propostas');
  return <>{children}</>;
}
