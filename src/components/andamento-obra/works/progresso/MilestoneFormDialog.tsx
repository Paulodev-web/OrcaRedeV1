'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { createWorkMilestone, renameWorkMilestone } from '@/actions/workMilestones';
import { onPortalPrimaryButtonSmClass } from '@/lib/branding';
import { MILESTONE_NAME_MAX, MILESTONE_NAME_MIN } from '@/types/works';

interface MilestoneFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workId: string;
  /** Se fornecido, o dialog renomeia este marco; senao cria um novo. */
  milestone?: { id: string; name: string } | null;
  onSaved?: () => void;
}

export function MilestoneFormDialog({
  open,
  onOpenChange,
  workId,
  milestone,
  onSaved,
}: MilestoneFormDialogProps) {
  const handleOpenChange = (next: boolean) => {
    if (!next) onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        {open && (
          <FormBody
            key={milestone ? `edit-${milestone.id}` : 'create'}
            workId={workId}
            milestone={milestone ?? null}
            onClose={() => onOpenChange(false)}
            onSaved={onSaved}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

interface FormBodyProps {
  workId: string;
  milestone: { id: string; name: string } | null;
  onClose: () => void;
  onSaved?: () => void;
}

function FormBody({ workId, milestone, onClose, onSaved }: FormBodyProps) {
  const isEdit = milestone !== null;
  const [name, setName] = useState(milestone?.name ?? '');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 50);
    return () => clearTimeout(t);
  }, []);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (trimmed.length < MILESTONE_NAME_MIN || trimmed.length > MILESTONE_NAME_MAX) {
      setError(`Nome deve ter entre ${MILESTONE_NAME_MIN} e ${MILESTONE_NAME_MAX} caracteres.`);
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = isEdit
        ? await renameWorkMilestone({ milestoneId: milestone.id, name: trimmed })
        : await createWorkMilestone({ workId, name: trimmed });
      if (!result.success) {
        setError(result.error);
        return;
      }
      toast.success(isEdit ? 'Marco renomeado.' : 'Marco adicionado.');
      onSaved?.();
      onClose();
    });
  }

  return (
    <form onSubmit={onSubmit}>
      <DialogHeader>
        <DialogTitle>{isEdit ? 'Renomear marco' : 'Adicionar marco'}</DialogTitle>
        <DialogDescription>
          {isEdit
            ? 'Altera apenas o nome exibido. Não afeta status ou histórico do marco.'
            : 'Cria um novo marco ao final da lista desta obra.'}
        </DialogDescription>
      </DialogHeader>

      <div className="flex flex-col gap-3 px-6 py-4">
        <label htmlFor="milestone-name" className="block text-sm font-medium text-gray-700">
          Nome do marco
        </label>
        <input
          ref={inputRef}
          id="milestone-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={isPending}
          maxLength={MILESTONE_NAME_MAX}
          placeholder="Ex.: Vistoria final"
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500 disabled:bg-gray-50 disabled:text-gray-500"
        />
        {error && (
          <p role="alert" className="text-xs text-red-600">
            {error}
          </p>
        )}
      </div>

      <DialogFooter>
        <button
          type="button"
          onClick={onClose}
          disabled={isPending}
          className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={isPending}
          className={`${onPortalPrimaryButtonSmClass} rounded-lg px-4 py-2 text-sm disabled:opacity-60`}
        >
          {isPending ? 'Salvando...' : isEdit ? 'Salvar' : 'Adicionar marco'}
        </button>
      </DialogFooter>
    </form>
  );
}
