'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { UserCheck, UserX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { assignTaskAction } from '@/app/tarefas/_actions/tasks';

interface AssignSelfButtonProps {
  taskId: string;
  assignedTo: string | null;
  viewerId: string;
}

/**
 * Atalho de "assumir tarefa" — atribuição a uma pessoa específica dentro do
 * setor (mapeamentooperacional.md §5.1 fala em setor responsável; a pessoa é
 * opcional, `tasks.assigned_to` na migration core). Sem UI de escolher outra
 * pessoa na v1 — só assumir/soltar a própria responsabilidade.
 */
export function AssignSelfButton({ taskId, assignedTo, viewerId }: AssignSelfButtonProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const isMine = assignedTo === viewerId;

  const handleClick = () => {
    startTransition(async () => {
      const result = await assignTaskAction(taskId, isMine ? null : viewerId);
      if (result.success) router.refresh();
    });
  };

  return (
    <Button variant="secondary" size="sm" onClick={handleClick} loading={pending}>
      {isMine ? <UserX className="h-3.5 w-3.5" /> : <UserCheck className="h-3.5 w-3.5" />}
      {isMine ? 'Deixar de ser responsável' : 'Assumir tarefa'}
    </Button>
  );
}
