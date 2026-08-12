'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Building2, FileSpreadsheet } from 'lucide-react';
import { toast } from 'sonner';
import { updateTaskFieldsAction } from '@/app/tarefas/_actions/tasks';
import { TaskSidebar } from './TaskSidebar';
import { TaskAttachmentGrid } from './TaskAttachmentGrid';
import { TaskActivity } from './TaskActivity';
import type { TaskBoardMember, TaskDetail } from '@/types/tasks';

interface TaskDetailPanelProps {
  task: TaskDetail;
  members: TaskBoardMember[];
  viewerId: string;
  orgId: string;
}

/**
 * O card por dentro.
 *
 * Três blocos na coluna principal — cabeçalho editável, anexos, atividade — e
 * as propriedades na lateral. A atividade é UM fio só (mensagens + eventos
 * misturados em ordem), em vez das duas caixas separadas da versão anterior,
 * que impediam saber se um comentário veio antes ou depois de um handoff.
 */
export function TaskDetailPanel({ task, members, viewerId, orgId }: TaskDetailPanelProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description ?? '');

  // Salva no blur, não a cada tecla: um UPDATE por edição, e o trigger de
  // auditoria não enche a linha do tempo de eventos por letra digitada.
  const saveField = (patch: Parameters<typeof updateTaskFieldsAction>[0]) => {
    startTransition(async () => {
      const result = await updateTaskFieldsAction(patch);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      router.refresh();
    });
  };

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">
      <div className="space-y-4">
        <section className="rounded-xl border border-neutral-200 bg-surface p-5">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => {
              if (title.trim() && title !== task.title) {
                saveField({ taskId: task.id, title });
              } else if (!title.trim()) {
                setTitle(task.title);
              }
            }}
            aria-label="Título do card"
            className="w-full rounded-md border border-transparent bg-transparent px-2 py-1 text-lg font-semibold text-neutral-900 transition-colors hover:border-neutral-200 focus:border-neutral-300 focus:outline-none"
          />

          <div className="mt-1 flex flex-wrap items-center gap-3 px-2 text-xs text-neutral-500">
            {task.clientName && (
              <span className="inline-flex items-center gap-1">
                <Building2 className="h-3.5 w-3.5" aria-hidden />
                {task.clientName}
              </span>
            )}
            {task.budgetId && (
              <Link
                href={`/orcamentos/${task.budgetId}`}
                className="inline-flex items-center gap-1 text-link hover:underline"
              >
                <FileSpreadsheet className="h-3.5 w-3.5" aria-hidden />
                {task.budgetProjectName ?? 'Orçamento vinculado'}
              </Link>
            )}
          </div>

          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            onBlur={() => {
              if (description !== (task.description ?? '')) {
                saveField({ taskId: task.id, description });
              }
            }}
            rows={4}
            aria-label="Descrição"
            placeholder="Escopo, local, concessionária, prazo — o que o próximo setor precisa saber."
            className="mt-3 w-full resize-y rounded-md border border-transparent bg-transparent px-2 py-1.5 text-sm text-neutral-700 transition-colors hover:border-neutral-200 focus:border-neutral-300 focus:outline-none"
          />
        </section>

        <TaskAttachmentGrid
          taskId={task.id}
          orgId={orgId}
          viewerId={viewerId}
          attachments={[...task.cardAttachments, ...task.messages.flatMap((m) => m.attachments)]}
          onChanged={() => router.refresh()}
        />

        <TaskActivity
          taskId={task.id}
          orgId={orgId}
          viewerId={viewerId}
          events={task.events}
          initialMessages={task.messages}
          members={members}
          onChanged={() => router.refresh()}
        />
      </div>

      <TaskSidebar task={task} members={members} viewerId={viewerId} />
    </div>
  );
}
