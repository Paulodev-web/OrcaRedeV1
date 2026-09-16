import { revalidatePath } from 'next/cache';

/**
 * Invalida as duas rotas que listam orçamentos e pastas.
 *
 * O mesmo `Dashboard` é renderizado em `/` (OrçaRede legado dentro do
 * `AppShell`) e em `/orcamentos`. As actions revalidavam só `/`, então a rota
 * nova ficava com cache velho — não quebrava porque a lista é buscada no
 * client, mas o revalidate estava no caminho errado.
 */
export function revalidateBudgetLists() {
  revalidatePath('/');
  revalidatePath('/orcamentos');
}
