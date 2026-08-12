'use client';

import { useState } from 'react';
import { CornerUpLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { TASK_STAGE_LABELS, type TaskStage } from '@/types/tasks';

export interface PendingReturn {
  taskId: string;
  taskTitle: string;
  fromStage: TaskStage | null;
  toStage: TaskStage | null;
}

interface ReturnNoteDialogProps {
  pending: PendingReturn | null;
  onConfirm: (note: string) => void;
  onCancel: () => void;
}

/**
 * Devolver um card exige motivo — a única nota obrigatória do módulo.
 *
 * É o que faz o histórico responder "por que isso voltou pra mim?". A versão
 * anterior tinha a coluna `transition_note` e o trigger que a gravava, mas
 * nenhuma tela mandava nota nenhuma: o histórico nascia mudo e o handoff
 * perdia justamente a informação que importa.
 */
export function ReturnNoteDialog({ pending, onConfirm, onCancel }: ReturnNoteDialogProps) {
  return (
    <Dialog open={pending !== null} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="max-w-md">
        {/* `key` zera o rascunho da nota a cada card diferente. Um efeito com
            setState faria o mesmo, ao custo de um render em cascata. */}
        {pending && (
          <ReturnNoteForm
            key={pending.taskId}
            pending={pending}
            onConfirm={onConfirm}
            onCancel={onCancel}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function ReturnNoteForm({
  pending,
  onConfirm,
  onCancel,
}: {
  pending: PendingReturn;
  onConfirm: (note: string) => void;
  onCancel: () => void;
}) {
  const [note, setNote] = useState('');
  const trimmed = note.trim();

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (trimmed) onConfirm(trimmed);
      }}
    >
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <CornerUpLeft className="h-4 w-4 text-amber-600" aria-hidden />
          Devolver o card
        </DialogTitle>
      </DialogHeader>

      <div className="flex flex-col gap-3 px-6 py-5">
        <p className="text-sm text-neutral-600">
          <span className="font-medium text-neutral-900">{pending.taskTitle}</span> volta de{' '}
          <span className="font-medium">
            {pending.fromStage ? TASK_STAGE_LABELS[pending.fromStage] : 'Avulsas'}
          </span>{' '}
          para{' '}
          <span className="font-medium">
            {pending.toStage ? TASK_STAGE_LABELS[pending.toStage] : 'Avulsas'}
          </span>
          .
        </p>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-neutral-700">O que falta?</span>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            autoFocus
            placeholder="Ex.: faltou o trecho de baixa tensão no canvas"
            className="rounded-lg border border-neutral-200/80 bg-surface/70 px-3 py-2 text-sm text-neutral-900 shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/40"
          />
          <span className="text-xs text-neutral-500">
            Fica no histórico do card e vai na notificação de quem recebe.
          </span>
        </label>
      </div>

      <DialogFooter>
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancelar
        </Button>
        <Button type="submit" variant="primary" disabled={!trimmed}>
          Devolver
        </Button>
      </DialogFooter>
    </form>
  );
}
