import type { ReactNode } from 'react';
import { createSupabaseServerClient, requireAuthUserId } from '@/lib/supabaseServer';
import { getBudgetWorkspaceData } from '@/services/budgets/budgetWorkspace';
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

  let workspace;
  try {
    const supabase = await createSupabaseServerClient();
    const userId = await requireAuthUserId(supabase);
    workspace = await getBudgetWorkspaceData(supabase, userId, budgetId);
  } catch (err: unknown) {
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
    return (
      <OrcamentosErrorScreen
        title="Orçamento não encontrado"
        message="Ele pode ter sido excluído ou pertencer a outra conta."
      />
    );
  }

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
