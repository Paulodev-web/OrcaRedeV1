import { requireModuleAccess } from "@/lib/auth/moduleAccess";
import { FornecedoresChrome } from "./_components/FornecedoresChrome";

/**
 * Virou Server Component para poder barrar a URL antes de renderizar — o
 * chrome em si (sidebar, cabeçalho) segue client em `FornecedoresChrome`.
 * Cobre as ~5 páginas da árvore (raiz, cadastro, sessão e suas sub-rotas).
 */
export default async function FornecedoresLayout({ children }: { children: React.ReactNode }) {
  await requireModuleAccess("fornecedores");

  return <FornecedoresChrome>{children}</FornecedoresChrome>;
}
