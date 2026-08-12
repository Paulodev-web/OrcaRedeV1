import Link from 'next/link';
import { Calendar, User } from 'lucide-react';
import { MoveTaskMenu } from './MoveTaskMenu';
import { AssignSelfButton } from './AssignSelfButton';
import { TaskChat } from './TaskChat';
import { TASK_SECTOR_LABELS, TASK_STATUS_LABELS } from '@/types/tasks';
import type { TaskDetail } from '@/types/tasks';
import { formatRelativeTime } from '@/lib/formatRelativeTime';

function formatDueDate(dueDate: string | null): string | null {
  if (!dueDate) return null;
  return new Date(`${dueDate}T00:00:00`).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
}

function transitionLabel(t: TaskDetail['transitions'][number]): string {
  if (t.fromSector && t.toSector) {
    return `${t.actorName ?? 'Alguém'} passou de ${TASK_SECTOR_LABELS[t.fromSector]} para ${TASK_SECTOR_LABELS[t.toSector]}`;
  }
  if (t.toStatus) {
    return `${t.actorName ?? 'Alguém'} mudou o status para ${TASK_STATUS_LABELS[t.toStatus]}`;
  }
  return `${t.actorName ?? 'Alguém'} atualizou a tarefa`;
}

export function TaskDetailPanel({ task, viewerId }: { task: TaskDetail; viewerId: string }) {
  const dueLabel = formatDueDate(task.dueDate);

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]">
      <div className="space-y-6">
        <div className="rounded-xl border border-gray-200 bg-surface p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-lg font-semibold text-neutral-900">{task.title}</h1>
              {task.budgetProjectName && (
                <Link
                  href={`/orcamentos/${task.budgetId}`}
                  className="mt-1 inline-block text-sm text-link hover:underline"
                >
                  {task.budgetProjectName}
                </Link>
              )}
            </div>
            <MoveTaskMenu taskId={task.id} sector={task.sector} status={task.status} size="md" />
          </div>

          {task.description && (
            <p className="mt-4 whitespace-pre-wrap text-sm text-gray-700">{task.description}</p>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-4 text-xs text-gray-500">
            <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-1 font-medium text-gray-700">
              {TASK_SECTOR_LABELS[task.sector]}
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-1 font-medium text-gray-700">
              {TASK_STATUS_LABELS[task.status]}
            </span>
            {dueLabel && (
              <span className="inline-flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5" />
                {dueLabel}
              </span>
            )}
            {task.assignedToName && (
              <span className="inline-flex items-center gap-1">
                <User className="h-3.5 w-3.5" />
                {task.assignedToName}
              </span>
            )}
          </div>

          <div className="mt-4">
            <AssignSelfButton taskId={task.id} assignedTo={task.assignedTo} viewerId={viewerId} />
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-surface p-5">
          <h2 className="mb-3 text-sm font-semibold text-neutral-900">Histórico</h2>
          {task.transitions.length === 0 ? (
            <p className="text-xs text-gray-400">Nenhuma movimentação ainda.</p>
          ) : (
            <ul className="space-y-3">
              {task.transitions.map((t) => (
                <li key={t.id} className="border-l-2 border-gray-200 pl-3 text-sm">
                  <p className="text-gray-700">{transitionLabel(t)}</p>
                  {t.note && (
                    <p className="mt-0.5 text-xs italic text-gray-500">&ldquo;{t.note}&rdquo;</p>
                  )}
                  <p className="mt-0.5 text-[11px] text-gray-400">{formatRelativeTime(t.createdAt)}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-neutral-900">Conversa</h2>
        <TaskChat
          taskId={task.id}
          viewerId={viewerId}
          initialMessages={task.messages}
          members={task.members}
        />
      </div>
    </div>
  );
}
