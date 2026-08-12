import Link from 'next/link';
import { Calendar, User } from 'lucide-react';
import { MoveTaskMenu } from './MoveTaskMenu';
import type { TaskListItem } from '@/types/tasks';

function formatDueDate(dueDate: string | null): string | null {
  if (!dueDate) return null;
  const date = new Date(`${dueDate}T00:00:00`);
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
}

export function TaskCard({ task }: { task: TaskListItem }) {
  const dueLabel = formatDueDate(task.dueDate);

  return (
    <div className="rounded-lg border border-gray-200 bg-surface p-3 shadow-2xs transition-shadow hover:shadow-sm">
      <Link href={`/tarefas/${task.id}`} className="block">
        <p className="line-clamp-2 text-sm font-medium text-neutral-900">{task.title}</p>
        {task.budgetProjectName && (
          <p className="mt-1 truncate text-xs text-gray-500">{task.budgetProjectName}</p>
        )}
      </Link>

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-gray-500">
        {dueLabel && (
          <span className="inline-flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            {dueLabel}
          </span>
        )}
        {task.assignedToName && (
          <span className="inline-flex items-center gap-1">
            <User className="h-3 w-3" />
            {task.assignedToName}
          </span>
        )}
      </div>

      <div className="mt-2.5">
        <MoveTaskMenu taskId={task.id} sector={task.sector} status={task.status} />
      </div>
    </div>
  );
}
