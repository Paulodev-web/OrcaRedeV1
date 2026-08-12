import type { ReactNode } from "react";
import { requireModuleAccess } from "@/lib/auth/moduleAccess";

/**
 * Portão de servidor para toda a árvore `/configuracoes`.
 *
 * Não existia `layout.tsx` na raiz antes — cada página renderizava seu próprio
 * `ConfigShell` (client), que só faz checagem de SESSÃO (não de módulo). Esta
 * camada barra antes de qualquer página montar; o `ConfigShell` continua com o
 * aviso de "sessão expirada" como segunda camada de UX.
 */
export default async function ConfiguracoesLayout({ children }: { children: ReactNode }) {
  await requireModuleAccess("configuracoes");
  return <>{children}</>;
}
