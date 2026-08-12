'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Building2, FileSpreadsheet, Maximize2, X } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { updateTaskFieldsAction } from '@/app/tarefas/_actions/tasks';
import { TaskSidebar } from './TaskSidebar';
import { TaskAttachmentGrid } from './TaskAttachmentGrid';
import { TaskActivity } from './TaskActivity';
import {
  TASK_SECTOR_LABELS,
  TASK_SECTOR_TONE,
  TASK_STAGE_META,
  type TaskBoardMember,
  type TaskDetail,
} from '@/types/tasks';

interface TaskModalProps {
  task: TaskDetail;
  members: TaskBoardMember[];
  viewerId: string;
  orgId: string;
}

const TONE_PILL = {
  blue: 'bg-accent-50 text-accent-700 border-accent-200',
  teal: 'bg-teal-50 text-teal-700 border-teal-200',
  amber: 'bg-amber-50 text-amber-700 border-amber-200',
  purple: 'bg-purple-50 text-purple-700 border-purple-200',
} as const;

/**
 * O card aberto por cima da esteira.
 *
 * Três decisões de layout que o tornam legível num espaço grande:
 *
 *   1. O cabeçalho é FIXO. Título, etapa e cliente ficam visíveis enquanto se
 *      rola a conversa — sem isso você perde de vista qual card está lendo.
 *   2. As duas colunas rolam de forma INDEPENDENTE. A lateral de propriedades
 *      é curta; se ela dividisse o scroll com a atividade, sobraria um vazio
 *      enorme do lado direito.
 *   3. A atividade ocupa a altura que sobra (`fill`), em vez do teto fixo de
 *      520px que a página cheia usa. Num modal de 85vh, um teto fixo deixaria
 *      uma faixa morta embaixo.
 *
 * Fechar é `router.back()`: a rota interceptadora empilhou uma entrada de
 * histórico, então voltar desfaz a navegação e o board reaparece intacto —
 * ele nunca foi desmontado.
 */
export function TaskModal({ task, members, viewerId, orgId }: TaskModalProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description ?? '');

  const close = () => router.back();

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

  const meta = task.stage ? TASK_STAGE_META[task.stage] : null;
  const tone = TASK_SECTOR_TONE[task.sector];

  return (
    <DialogPrimitive.Root open onOpenChange={(open) => !open && close()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-neutral-950/40 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0" />

        <DialogPrimitive.Content
          aria-describedby={undefined}
          className={cn(
            'fixed left-1/2 top-1/2 z-50 flex w-[min(1120px,94vw)] -translate-x-1/2 -translate-y-1/2 flex-col',
            'h-[min(860px,88vh)] overflow-hidden rounded-xl border border-neutral-200 bg-surface shadow-xl',
            'duration-200 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95',
            'data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95',
          )}
        >
          {/* ---- Cabeçalho fixo ---------------------------------------- */}
          <header className="shrink-0 border-b border-neutral-100 px-6 py-4">
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <DialogPrimitive.Title asChild>
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
                </DialogPrimitive.Title>

                <div className="mt-1 flex flex-wrap items-center gap-2 px-2 text-xs text-neutral-500">
                  <span
                    className={cn(
                      'inline-flex items-center rounded-md border px-2 py-0.5 font-medium',
                      TONE_PILL[tone],
                    )}
                  >
                    {meta ? meta.label : 'Avulsa'} · {TASK_SECTOR_LABELS[task.sector]}
                  </span>
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
              </div>

              <div className="flex shrink-0 items-center gap-1">
                <Link
                  href={`/tarefas/${task.id}`}
                  title="Abrir em página cheia"
                  aria-label="Abrir em página cheia"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-900"
                >
                  <Maximize2 className="h-4 w-4" aria-hidden />
                </Link>
                <DialogPrimitive.Close
                  aria-label="Fechar"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-900"
                >
                  <X className="h-4 w-4" aria-hidden />
                </DialogPrimitive.Close>
              </div>
            </div>
          </header>

          {/* ---- Corpo: duas colunas com rolagem independente ----------- */}
          <div className="grid min-h-0 flex-1 grid-cols-1 gap-5 overflow-hidden p-5 lg:grid-cols-[minmax(0,1fr)_300px]">
            <div className="flex min-h-0 flex-col gap-4 overflow-y-auto lg:overflow-hidden">
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                onBlur={() => {
                  if (description !== (task.description ?? '')) {
                    saveField({ taskId: task.id, description });
                  }
                }}
                rows={3}
                aria-label="Descrição"
                placeholder="Escopo, local, concessionária, prazo — o que o próximo setor precisa saber."
                className="w-full shrink-0 resize-y rounded-lg border border-neutral-200 bg-surface px-3 py-2 text-sm text-neutral-700 shadow-2xs transition-colors focus:border-neutral-300 focus:outline-none"
              />

              <div className="shrink-0">
                <TaskAttachmentGrid
                  taskId={task.id}
                  orgId={orgId}
                  viewerId={viewerId}
                  attachments={[
                    ...task.cardAttachments,
                    ...task.messages.flatMap((m) => m.attachments),
                  ]}
                  onChanged={() => router.refresh()}
                />
              </div>

              <TaskActivity
                fill
                taskId={task.id}
                orgId={orgId}
                viewerId={viewerId}
                events={task.events}
                initialMessages={task.messages}
                members={members}
                onChanged={() => router.refresh()}
              />
            </div>

            <div className="min-h-0 overflow-y-auto">
              <TaskSidebar task={task} members={members} viewerId={viewerId} />
            </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
