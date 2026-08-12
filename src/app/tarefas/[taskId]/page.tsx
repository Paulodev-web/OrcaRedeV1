import type { Metadata } from 'next';
import { createSupabaseServerClient, requireAuthUserId } from '@/lib/supabaseServer';
import { TarefasChrome } from '@/components/tarefas/TarefasChrome';
import { TarefasModuleHeaderBell } from '@/components/tarefas/TarefasModuleHeaderBell';
import { TaskDetailPanel } from '@/components/tarefas/detail/TaskDetailPanel';
import { OrcamentosErrorScreen } from '@/components/orcamentos/OrcamentosErrorScreen';
import { getBoardMembers, getTaskDetail } from '../_data/tasks';

export const metadata: Metadata = { title: 'Card — OrcaRede' };

interface TaskDetailPageProps {
  params: Promise<{ taskId: string }>;
}

export default async function TaskDetailPage({ params }: TaskDetailPageProps) {
  const { taskId } = await params;
  const supabase = await createSupabaseServerClient();

  let viewerId: string;
  try {
    viewerId = await requireAuthUserId(supabase);
  } catch {
    return (
      <OrcamentosErrorScreen
        title="Sessão expirada"
        message="Entre novamente para acessar este card."
        href="/tarefas"
        linkLabel="Ir para a Esteira"
      />
    );
  }

  const [{ data: orgId }, task, members] = await Promise.all([
    supabase.rpc('current_org_id'),
    getTaskDetail(supabase, taskId),
    getBoardMembers(supabase),
  ]);

  if (!task || !orgId) {
    return (
      <OrcamentosErrorScreen
        title="Card não encontrado"
        message="Ele pode ter sido excluído ou pertencer a outra organização."
        href="/tarefas"
        linkLabel="Ir para a Esteira"
      />
    );
  }

  return (
    <TarefasChrome
      title={task.title}
      breadcrumb={[{ label: 'Esteira', href: '/tarefas' }, { label: task.title }]}
      actions={<TarefasModuleHeaderBell />}
    >
      <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
        <TaskDetailPanel
          task={task}
          members={members}
          viewerId={viewerId}
          orgId={orgId as string}
        />
      </div>
    </TarefasChrome>
  );
}
