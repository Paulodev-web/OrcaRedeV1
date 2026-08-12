import type { Metadata } from 'next';
import { createSupabaseServerClient, requireAuthUserId } from '@/lib/supabaseServer';
import { TarefasChrome } from '@/components/tarefas/TarefasChrome';
import { TarefasModuleHeaderBell } from '@/components/tarefas/TarefasModuleHeaderBell';
import { CreateTaskDialog } from '@/components/tarefas/CreateTaskDialog';
import { BoardProvider } from '@/components/tarefas/board/BoardProvider';
import { BoardToolbar } from '@/components/tarefas/board/BoardToolbar';
import { EsteiraBoard } from '@/components/tarefas/board/EsteiraBoard';
import { OrcamentosErrorScreen } from '@/components/orcamentos/OrcamentosErrorScreen';
import { getBoard, getBoardMembers, getBudgetOptions, getViewerSector } from './_data/tasks';

export const metadata: Metadata = {
  title: 'Esteira — OrcaRede',
  description: 'O trabalho caminhando entre Comercial, Engenharia, Compras e Execução.',
};

/**
 * Servidor entrega o estado inicial COMPLETO da esteira; daí em diante o
 * `BoardProvider` é o dono. Trocar filtro, arrastar card ou receber a mudança de
 * um colega não volta ao servidor para redesenhar — era o `router.refresh()` a
 * cada movimento que remontava os cards e tornava qualquer animação impossível.
 */
export default async function TarefasPage() {
  const supabase = await createSupabaseServerClient();

  let viewerId: string;
  try {
    viewerId = await requireAuthUserId(supabase);
  } catch {
    return (
      <OrcamentosErrorScreen
        title="Sessão expirada"
        message="Entre novamente para acessar a esteira."
        href="/"
        linkLabel="Voltar ao início"
      />
    );
  }

  const { data: orgId } = await supabase.rpc('current_org_id');
  if (!orgId) {
    return (
      <OrcamentosErrorScreen
        title="Sem organização ativa"
        message="Você ainda não pertence a nenhuma organização."
        href="/configuracoes/organizacao"
        linkLabel="Ir para Organização"
      />
    );
  }

  const [board, members, budgets, viewerSector] = await Promise.all([
    getBoard(supabase),
    getBoardMembers(supabase),
    getBudgetOptions(supabase),
    getViewerSector(supabase),
  ]);

  const budgetNames = Object.fromEntries(budgets.map((b) => [b.id, b.projectName]));

  return (
    <TarefasChrome
      title="Esteira"
      description="Do primeiro contato do cliente até a obra em campo."
      breadcrumb={[{ label: 'Esteira' }]}
      actions={
        <div className="flex items-center gap-2">
          <TarefasModuleHeaderBell />
          <CreateTaskDialog budgets={budgets} viewerSector={viewerSector} />
        </div>
      }
    >
      <BoardProvider
        initialBoard={board}
        members={members}
        viewerId={viewerId}
        viewerSector={viewerSector}
        orgId={orgId as string}
        budgetNames={budgetNames}
      >
        <div className="flex w-full flex-col gap-4 px-4 py-5 sm:px-6 lg:px-8">
          <BoardToolbar />
          <EsteiraBoard />
        </div>
      </BoardProvider>
    </TarefasChrome>
  );
}
