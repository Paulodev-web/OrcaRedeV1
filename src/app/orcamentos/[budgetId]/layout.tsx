import type { ReactNode } from 'react';
import { createSupabaseServerClient, requireAuthUserId } from '@/lib/supabaseServer';
import { getModuleAccess, requireModuleAccess } from '@/lib/auth/moduleAccess';
import { getBudgetWorkspaceData } from '@/services/budgets/budgetWorkspace';
// Instrumentação temporária — ver src/lib/perf/serverTiming.ts (PERF=1 npm run dev).
import { startServerBlock, timeServer } from '@/lib/perf/serverTiming';
import { BudgetWorkspaceChrome } from '@/components/orcamentos/BudgetWorkspaceChrome';
import { OrcamentosErrorScreen } from '@/components/orcamentos/OrcamentosErrorScreen';

interface BudgetLayoutProps {
  children: ReactNode;
  params: Promise<{ budgetId: string }>;
}

/**
 * Casca da esteira do orçamento.
 *
 * O layout sobrevive à troca de etapa, então é aqui que o orçamento é
 * carregado — e não em cada página — para trocar de aba não recarregar o
 * orçamento inteiro.
 */
export default async function BudgetLayout({ children, params }: BudgetLayoutProps) {
  const { budgetId } = await params;
  const fimBloco = startServerBlock(`layout /orcamentos/${budgetId}`);

  let workspace;
  try {
    const supabase = await createSupabaseServerClient();

    // Dispara a leitura de permissões JÁ, sem esperar. Ela depende só de quem é
    // o usuário — nada do orçamento — mas estava no FIM da fila, rodando depois
    // do orçamento e dos segmentos terminarem. Como `getModuleAccess` é
    // `cache()`, o `requireModuleAccess` lá embaixo reaproveita este resultado
    // em vez de refazer as consultas.
    //
    // O `.catch` vazio trata só ESTA ramificação; a promise original continua
    // sendo aguardada (e o erro dela, propagado) no `await` mais abaixo.
    void getModuleAccess().catch(() => {});

    const userId = await timeServer('auth.getUser (compartilhado com permissões)', () =>
      requireAuthUserId(supabase)
    );
    workspace = await timeServer('orçamento + segmentos + marcações', () =>
      getBudgetWorkspaceData(supabase, userId, budgetId)
    );
  } catch (err: unknown) {
    fimBloco('erro');
    const message = err instanceof Error ? err.message : 'Não foi possível abrir o orçamento.';
    return (
      <OrcamentosErrorScreen
        title="Não foi possível abrir o orçamento"
        message={message}
        href="/"
        linkLabel="Ir para o portal"
      />
    );
  }

  if (!workspace) {
    fimBloco('orçamento não encontrado');
    return (
      <OrcamentosErrorScreen
        title="Orçamento não encontrado"
        message="Ele pode ter sido excluído ou pertencer a outra conta."
      />
    );
  }

  // Fora do try/catch acima de propósito — mesmo motivo de `/orcamentos/page.tsx`.
  // Já foi disparado lá em cima; aqui normalmente só se colhe o resultado.
  await timeServer('permissões (já disparadas no início)', () => requireModuleAccess('orca-rede'));
  fimBloco(`${workspace.segments.length} segmentos`);

  return (
    <BudgetWorkspaceChrome
      budget={workspace.budget}
      segments={workspace.segments}
      segmentAssignments={workspace.segmentAssignments}
    >
      {children}
    </BudgetWorkspaceChrome>
  );
}
