import { createSupabaseServerClient, requireAuthUserId } from '@/lib/supabaseServer';
import { TaskModal } from '@/components/tarefas/detail/TaskModal';
import { getBoardMembers, getTaskDetail } from '../../_data/tasks';

interface InterceptedTaskPageProps {
  params: Promise<{ taskId: string }>;
}

/**
 * Rota interceptadora: clicar num card da esteira abre este modal por cima do
 * board, sem sair de `/tarefas`. A página cheia (`../../[taskId]/page.tsx`)
 * continua servindo link direto, F5 e nova aba, com os mesmos componentes.
 */
export default async function InterceptedTaskPage({ params }: InterceptedTaskPageProps) {
  const { taskId } = await params;
  const supabase = await createSupabaseServerClient();

  let viewerId: string;
  try {
    viewerId = await requireAuthUserId(supabase);
  } catch {
    return null;
  }

  const [{ data: orgId }, task, members] = await Promise.all([
    supabase.rpc('current_org_id'),
    getTaskDetail(supabase, taskId),
    getBoardMembers(supabase),
  ]);

  if (!task || !orgId) return null;

  return <TaskModal task={task} members={members} viewerId={viewerId} orgId={orgId as string} />;
}
