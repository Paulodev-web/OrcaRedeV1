'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import * as Popover from '@radix-ui/react-popover';
import { ArrowRightLeft, Check } from 'lucide-react';
import { moveTaskAction } from '@/app/tarefas/_actions/tasks';
import { cn } from '@/lib/utils';
import {
  TASK_SECTORS,
  TASK_SECTOR_LABELS,
  TASK_STATUSES,
  TASK_STATUS_LABELS,
  type TaskSector,
  type TaskStatus,
} from '@/types/tasks';

interface MoveTaskMenuProps {
  taskId: string;
  sector: TaskSector;
  status: TaskStatus;
  /** `sm` para o card do board, `md` para o painel de detalhe. */
  size?: 'sm' | 'md';
}

/**
 * Ação central do board (mesma que o drag-and-drop chamaria, se existisse):
 * um único `moveTaskAction`. Mudar status é progresso dentro do setor; mudar
 * setor é handoff — o trigger `tasks_audit_transitions` reseta o status
 * automaticamente, então este menu não deixa escolher status junto com setor.
 */
export function MoveTaskMenu({ taskId, sector, status, size = 'sm' }: MoveTaskMenuProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const runMove = (patch: { sector?: TaskSector; status?: TaskStatus }) => {
    setOpen(false);
    startTransition(async () => {
      const result = await moveTaskAction({ taskId, ...patch });
      if (result.success) router.refresh();
    });
  };

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          disabled={pending}
          onClick={(e) => e.stopPropagation()}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-md border border-gray-200 bg-surface font-medium text-gray-600 transition-colors hover:bg-gray-50 hover:text-neutral-900 disabled:opacity-50',
            size === 'sm' ? 'px-2 py-1 text-xs' : 'px-3 py-1.5 text-sm',
          )}
        >
          <ArrowRightLeft className={size === 'sm' ? 'h-3 w-3' : 'h-3.5 w-3.5'} />
          Mover
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={6}
          onClick={(e) => e.stopPropagation()}
          className="z-50 w-56 rounded-xl border border-gray-200 bg-surface p-2 shadow-lg"
        >
          <p className="px-2 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
            Status
          </p>
          {TASK_STATUSES.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => runMove({ status: s })}
              className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm text-gray-700 transition-colors hover:bg-gray-50"
            >
              {TASK_STATUS_LABELS[s]}
              {s === status && <Check className="h-3.5 w-3.5 text-link" />}
            </button>
          ))}

          <p className="px-2 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
            Passar para o setor
          </p>
          {TASK_SECTORS.filter((s) => s !== sector).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => runMove({ sector: s })}
              className="flex w-full items-center rounded-md px-2 py-1.5 text-left text-sm text-gray-700 transition-colors hover:bg-gray-50"
            >
              {TASK_SECTOR_LABELS[s]}
            </button>
          ))}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
