'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { createTaskAction } from '@/app/tarefas/_actions/tasks';
import { TASK_SECTORS, TASK_SECTOR_LABELS, type TaskSector } from '@/types/tasks';

interface CreateTaskDialogProps {
  budgets: Array<{ id: string; projectName: string }>;
  defaultSector: TaskSector;
  /** Pré-seleciona e trava o orçamento — usado na aba do workspace de orçamento. */
  fixedBudgetId?: string;
}

export function CreateTaskDialog({ budgets, defaultSector, fixedBudgetId }: CreateTaskDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [budgetId, setBudgetId] = useState(fixedBudgetId ?? '');
  const [sector, setSector] = useState<TaskSector>(defaultSector);
  const [dueDate, setDueDate] = useState('');

  const resetForm = () => {
    setTitle('');
    setDescription('');
    setBudgetId(fixedBudgetId ?? '');
    setSector(defaultSector);
    setDueDate('');
    setError(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !budgetId) {
      setError('Título e orçamento são obrigatórios.');
      return;
    }

    startTransition(async () => {
      const result = await createTaskAction({
        title,
        description: description || null,
        budgetId,
        sector,
        dueDate: dueDate || null,
      });

      if (!result.success) {
        setError(result.error);
        return;
      }

      setOpen(false);
      resetForm();
      router.refresh();
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) resetForm();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="primary" size="md">
          <Plus className="h-4 w-4" />
          Nova tarefa
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Nova tarefa</DialogTitle>
          </DialogHeader>

          <div className="flex flex-col gap-4 px-6 py-5">
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-neutral-700">Título</span>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                className="h-[42px] rounded-lg border border-gray-200/80 bg-surface/70 px-3 text-sm text-gray-900 shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/40"
                placeholder="Ex.: Elaborar projeto executivo"
              />
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-neutral-700">Descrição (opcional)</span>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className="rounded-lg border border-gray-200/80 bg-surface/70 px-3 py-2 text-sm text-gray-900 shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/40"
              />
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-neutral-700">Orçamento</span>
              {fixedBudgetId ? (
                <p className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-600">
                  {budgets.find((b) => b.id === fixedBudgetId)?.projectName ?? fixedBudgetId}
                </p>
              ) : (
                <Select value={budgetId} onValueChange={setBudgetId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione um orçamento" />
                  </SelectTrigger>
                  <SelectContent>
                    {budgets.map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.projectName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-neutral-700">Setor responsável</span>
              <Select value={sector} onValueChange={(v) => setSector(v as TaskSector)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TASK_SECTORS.map((s) => (
                    <SelectItem key={s} value={s}>
                      {TASK_SECTOR_LABELS[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-neutral-700">Prazo (opcional)</span>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="h-[42px] rounded-lg border border-gray-200/80 bg-surface/70 px-3 text-sm text-gray-900 shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/40"
              />
            </label>

            {error && <p className="text-sm text-red-600">{error}</p>}
          </div>

          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setOpen(false)} disabled={pending}>
              Cancelar
            </Button>
            <Button type="submit" variant="primary" loading={pending}>
              Criar tarefa
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
