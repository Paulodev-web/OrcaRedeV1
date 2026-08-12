'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ExternalLink, Lock, Trash2, Unlock, UserCheck } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import {
  assignTaskAction,
  deleteTaskAction,
  moveTaskAction,
  setTaskBlockedAction,
  updateTaskFieldsAction,
} from '@/app/tarefas/_actions/tasks';
import { ReturnNoteDialog, type PendingReturn } from '../board/ReturnNoteDialog';
import {
  TASK_SECTOR_LABELS,
  TASK_SECTOR_TONE,
  TASK_STAGE_META,
  TASK_STAGES,
  taskMoveDirection,
  type TaskBoardMember,
  type TaskDetail,
  type TaskStage,
} from '@/types/tasks';

interface TaskSidebarProps {
  task: TaskDetail;
  members: TaskBoardMember[];
  viewerId: string;
}

const TONE_PILL = {
  blue: 'bg-accent-50 text-accent-700 border-accent-200',
  teal: 'bg-teal-50 text-teal-700 border-teal-200',
  amber: 'bg-amber-50 text-amber-700 border-amber-200',
  purple: 'bg-purple-50 text-purple-700 border-purple-200',
} as const;

/**
 * Atalho para o módulo onde o trabalho DESTA etapa acontece de verdade.
 *
 * É o que separa uma esteira de uma lista de afazeres: o card não descreve o
 * trabalho, ele leva até ele.
 */
function stageDeepLink(task: TaskDetail): { href: string; label: string } | null {
  switch (task.stage) {
    case 'orcamento':
      return task.budgetId
        ? { href: `/orcamentos/${task.budgetId}/projeto`, label: 'Abrir no OrçaRede' }
        : null;
    case 'precificacao':
      return task.budgetId
        ? { href: `/orcamentos/${task.budgetId}/precificacao`, label: 'Abrir a precificação' }
        : null;
    case 'proposta':
      return task.budgetId
        ? { href: `/orcamentos/${task.budgetId}/proposta`, label: 'Abrir a proposta' }
        : null;
    case 'execucao':
      return task.workId
        ? { href: `/tools/andamento-obra/obras/${task.workId}`, label: 'Abrir a obra' }
        : null;
    default:
      return null;
  }
}

export function TaskSidebar({ task, members, viewerId }: TaskSidebarProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [pendingReturn, setPendingReturn] = useState<PendingReturn | null>(null);
  const [blockDraft, setBlockDraft] = useState('');
  const [blockOpen, setBlockOpen] = useState(false);

  const run = (fn: () => Promise<{ success: boolean; error?: string }>) => {
    startTransition(async () => {
      const result = await fn();
      if (!result.success) {
        toast.error(result.error ?? 'Não foi possível salvar.');
        return;
      }
      router.refresh();
    });
  };

  const changeStage = (next: TaskStage) => {
    if (next === task.stage) return;
    if (taskMoveDirection(task.stage, next) === 'retorno') {
      setPendingReturn({
        taskId: task.id,
        taskTitle: task.title,
        fromStage: task.stage,
        toStage: next,
      });
      return;
    }
    run(() => moveTaskAction({ taskId: task.id, stage: next }));
  };

  const isMine = task.assignedTo === viewerId;
  const deepLink = stageDeepLink(task);
  const tone = TASK_SECTOR_TONE[task.sector];

  return (
    <aside className="space-y-4">
      <div className="space-y-3 rounded-xl border border-neutral-200 bg-surface p-4">
        <div>
          <p className="mb-1.5 text-xs font-medium text-neutral-500">Etapa</p>
          <Select value={task.stage ?? 'avulsa'} onValueChange={(v) => changeStage(v as TaskStage)}>
            <SelectTrigger disabled={pending}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {task.stage === null && <SelectItem value="avulsa">Avulsa (sem etapa)</SelectItem>}
              {TASK_STAGES.map((stage) => (
                <SelectItem key={stage} value={stage}>
                  {TASK_STAGE_META[stage].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p
            className={cn(
              'mt-1.5 inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium',
              TONE_PILL[tone],
            )}
          >
            {TASK_SECTOR_LABELS[task.sector]}
          </p>
        </div>

        {deepLink && (
          <Link
            href={deepLink.href}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-accent-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-700"
          >
            <ExternalLink className="h-3.5 w-3.5" aria-hidden />
            {deepLink.label}
          </Link>
        )}
      </div>

      <div className="space-y-3 rounded-xl border border-neutral-200 bg-surface p-4">
        <div>
          <p className="mb-1.5 text-xs font-medium text-neutral-500">Responsável</p>
          <Select
            value={task.assignedTo ?? 'none'}
            onValueChange={(v) => run(() => assignTaskAction(task.id, v === 'none' ? null : v))}
          >
            <SelectTrigger disabled={pending}>
              <SelectValue placeholder="Ninguém" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Ninguém</SelectItem>
              {members.map((member) => (
                <SelectItem key={member.userId} value={member.userId}>
                  {member.name}
                  {member.sector ? ` · ${TASK_SECTOR_LABELS[member.sector]}` : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {!isMine && (
            <Button
              variant="secondary"
              size="sm"
              className="mt-2 w-full"
              disabled={pending}
              onClick={() => run(() => assignTaskAction(task.id, viewerId))}
            >
              <UserCheck className="h-3.5 w-3.5" aria-hidden />
              Assumir
            </Button>
          )}
        </div>

        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-neutral-500">Prazo</span>
          <input
            type="date"
            defaultValue={task.dueDate ?? ''}
            disabled={pending}
            onChange={(e) =>
              run(() => updateTaskFieldsAction({ taskId: task.id, dueDate: e.target.value || null }))
            }
            className="h-9 w-full rounded-lg border border-neutral-200/80 bg-surface/70 px-3 text-sm text-neutral-900 shadow-2xs focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/40"
          />
        </label>
      </div>

      <div className="rounded-xl border border-neutral-200 bg-surface p-4">
        {task.blockedReason ? (
          <>
            <p className="flex items-start gap-1.5 rounded-md bg-red-50 px-2.5 py-2 text-xs text-red-700">
              <Lock className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
              {task.blockedReason}
            </p>
            <Button
              variant="secondary"
              size="sm"
              className="mt-2 w-full"
              disabled={pending}
              onClick={() => run(() => setTaskBlockedAction(task.id, null))}
            >
              <Unlock className="h-3.5 w-3.5" aria-hidden />
              Destravar
            </Button>
          </>
        ) : blockOpen ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!blockDraft.trim()) return;
              run(() => setTaskBlockedAction(task.id, blockDraft));
              setBlockOpen(false);
              setBlockDraft('');
            }}
            className="space-y-2"
          >
            <input
              type="text"
              value={blockDraft}
              onChange={(e) => setBlockDraft(e.target.value)}
              autoFocus
              placeholder="Ex.: esperando a carta da RGE"
              className="h-9 w-full rounded-lg border border-neutral-200/80 bg-surface/70 px-3 text-sm shadow-2xs focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/40"
            />
            <div className="flex gap-2">
              <Button type="submit" size="sm" className="flex-1" disabled={!blockDraft.trim()}>
                Travar
              </Button>
              <Button type="button" variant="secondary" size="sm" onClick={() => setBlockOpen(false)}>
                Cancelar
              </Button>
            </div>
          </form>
        ) : (
          <Button
            variant="secondary"
            size="sm"
            className="w-full"
            disabled={pending}
            onClick={() => setBlockOpen(true)}
          >
            <Lock className="h-3.5 w-3.5" aria-hidden />
            Travar card
          </Button>
        )}
        <p className="mt-2 text-[11px] leading-relaxed text-neutral-400">
          Travar avisa quem acompanha e deixa o motivo visível na face do card.
        </p>
      </div>

      {task.followers.length > 0 && (
        <div className="rounded-xl border border-neutral-200 bg-surface p-4">
          <p className="mb-2 text-xs font-medium text-neutral-500">
            Acompanhando ({task.followers.length})
          </p>
          <ul className="space-y-1">
            {task.followers.map((follower) => (
              <li key={follower.userId} className="text-xs text-neutral-600">
                {follower.userName ?? 'Alguém'}
                <span className="ml-1 text-neutral-400">· {follower.reason}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <Button
        variant="destructive"
        size="sm"
        className="w-full"
        disabled={pending}
        onClick={() => {
          if (!window.confirm('Excluir este card? O histórico e a conversa vão junto.')) return;
          startTransition(async () => {
            const result = await deleteTaskAction(task.id);
            if (!result.success) {
              toast.error(result.error);
              return;
            }
            router.push('/tarefas');
          });
        }}
      >
        <Trash2 className="h-3.5 w-3.5" aria-hidden />
        Excluir card
      </Button>

      <ReturnNoteDialog
        pending={pendingReturn}
        onConfirm={(note) => {
          const target = pendingReturn?.toStage ?? null;
          setPendingReturn(null);
          run(() => moveTaskAction({ taskId: task.id, stage: target, note }));
        }}
        onCancel={() => setPendingReturn(null)}
      />
    </aside>
  );
}
