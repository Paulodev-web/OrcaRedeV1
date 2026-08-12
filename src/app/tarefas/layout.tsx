import type { ReactNode } from 'react';
import { requireModuleAccess } from '@/lib/auth/moduleAccess';

/**
 * Portão de servidor para toda a árvore `/tarefas` — mesmo padrão de
 * `src/app/propostas/layout.tsx`: `requireModuleAccess` cobre sessão ausente e
 * módulo sem permissão com o mesmo redirect. `TarefasChrome` é montado por
 * página (não aqui), porque cada página tem título/ações próprios.
 *
 * O slot `card` é o modal do card, servido por uma rota interceptadora
 * (`@card/(.)[taskId]`). Clicar num card da esteira abre o modal POR CIMA do
 * board, que continua vivo atrás — nada é desmontado, o arrasto não perde
 * estado e fechar é instantâneo. O mesmo `/tarefas/[taskId]` acessado por link
 * direto ou F5 cai na página cheia, que continua existindo.
 */
export default async function TarefasLayout({
  children,
  card,
}: {
  children: ReactNode;
  card: ReactNode;
}) {
  await requireModuleAccess('tarefas');
  return (
    <>
      {children}
      {card}
    </>
  );
}
