import type { Metadata } from 'next';
import { createSupabaseServerClient, requireAuthUserId } from '@/lib/supabaseServer';
import { TarefasChrome } from '@/components/tarefas/TarefasChrome';
import { TarefasModuleHeaderBell } from '@/components/tarefas/TarefasModuleHeaderBell';
import { TaskDetailPanel } from '@/components/tarefas/TaskDetailPanel';
import { OrcamentosErrorScreen } from '@/components/orcamentos/OrcamentosErrorScreen';
import { getTaskDetail } from '../_data/tasks';

export const metadata: Metadata = { title: 'Tarefa — OrcaRede' };

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
        message="Entre novamente para acessar esta tarefa."
        href="/tarefas"
        linkLabel="Ir para o Quadro de Trabalho"
      />
    );
  }

  const task = await getTaskDetail(supabase, taskId);
  if (!task) {
    return (
      <OrcamentosErrorScreen
        title="Tarefa não encontrada"
        message="Ela pode ter sido excluída ou pertencer a outra organização."
        href="/tarefas"
        linkLabel="Ir para o Quadro de Trabalho"
      />
    );
  }

  return (
    <TarefasChrome
      title={task.title}
      breadcrumb={[{ label: 'Tarefas', href: '/tarefas' }, { label: task.title }]}
      actions={<TarefasModuleHeaderBell />}
    >
      <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <TaskDetailPanel task={task} viewerId={viewerId} />
      </div>
    </TarefasChrome>
  );
}
