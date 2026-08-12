import { requireModuleAccess } from "@/lib/auth/moduleAccess";
import { PrecificacaoChrome } from "./_components/PrecificacaoChrome";

/**
 * Virou Server Component para poder barrar a URL antes de renderizar — mesmo
 * tratamento de `/fornecedores/layout.tsx`. Cobre dashboard, nova, editar/[id].
 */
export default async function PrecificacaoLayout({ children }: { children: React.ReactNode }) {
  await requireModuleAccess("precificacao");

  return <PrecificacaoChrome>{children}</PrecificacaoChrome>;
}
