import { TaskCard } from './TaskCard';
import { TASK_STATUSES, TASK_STATUS_LABELS } from '@/types/tasks';
import type { TaskBoardColumns } from '@/types/tasks';

export function Board({ columns }: { columns: TaskBoardColumns }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      {TASK_STATUSES.map((status) => {
        const items = columns[status];
        return (
          <div key={status} className="flex flex-col rounded-xl bg-gray-50 p-3">
            <div className="mb-3 flex items-center justify-between px-1">
              <h2 className="text-sm font-semibold text-neutral-900">
                {TASK_STATUS_LABELS[status]}
              </h2>
              <span className="rounded-full bg-gray-200 px-2 py-0.5 text-xs font-medium text-gray-600">
                {items.length}
              </span>
            </div>
            <div className="flex flex-1 flex-col gap-2">
              {items.length === 0 ? (
                <p className="rounded-lg border border-dashed border-gray-300 px-3 py-6 text-center text-xs text-gray-400">
                  Nenhuma tarefa aqui.
                </p>
              ) : (
                items.map((task) => <TaskCard key={task.id} task={task} />)
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
