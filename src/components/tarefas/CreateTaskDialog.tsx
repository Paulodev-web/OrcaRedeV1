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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { createTaskAction } from '@/app/tarefas/_actions/tasks';
import {
  TASK_SECTORS,
  TASK_SECTOR_LABELS,
  TASK_STAGE_META,
  TASK_WORKING_STAGES,
  type TaskSector,
  type TaskStage,
} from '@/types/tasks';

interface CreateTaskDialogProps {
  budgets: Array<{ id: string; projectName: string; clientName: string | null }>;
  /** Setor de quem está criando — vira o dono do card avulso. */
  viewerSector: TaskSector | null;
  /** Pré-seleciona e trava o orçamento — usado na aba do workspace de orçamento. */
  fixedBudgetId?: string;
}

const AVULSA = '__avulsa__';

/**
 * A demanda nasce em "Solicitação", SEM orçamento.
 *
 * Esse era o defeito de modelo da versão anterior: `budget_id NOT NULL` obrigava
 * um orçamento a existir antes do primeiro contato, e o Comercial — que é o
 * ponto de entrada de todo projeto (mapeamentooperacional.md, Fase 1) — ficava
 * sem como abrir a demanda. O vínculo com o orçamento é opcional aqui e entra
 * depois, quando a Engenharia cria o orçamento de fato.
 */
export function CreateTaskDialog({ budgets, viewerSector, fixedBudgetId }: CreateTaskDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState('');
  const [clientName, setClientName] = useState('');
  const [description, setDescription] = useState('');
  const [stageValue, setStageValue] = useState<string>('solicitacao');
  const [sector, setSector] = useState<TaskSector>(viewerSector ?? 'comercial');
  const [budgetId, setBudgetId] = useState(fixedBudgetId ?? '');
  const [dueDate, setDueDate] = useState('');

  const isAvulsa = stageValue === AVULSA;

  const resetForm = () => {
    setTitle('');
    setClientName('');
    setDescription('');
    setStageValue('solicitacao');
    setSector(viewerSector ?? 'comercial');
    setBudgetId(fixedBudgetId ?? '');
    setDueDate('');
    setError(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError('O título é obrigatório.');
      return;
    }

    startTransition(async () => {
      const result = await createTaskAction({
        title,
        description: description || null,
        clientName: clientName || null,
        stage: isAvulsa ? null : (stageValue as TaskStage),
        sector,
        budgetId: budgetId || null,
        dueDate: dueDate || null,
      });

      if (!result.success) {
        setError(result.error);
        return;
      }

      setOpen(false);
      resetForm();
      // O board é client-side e recebe o card novo pelo Realtime; o refresh
      // aqui é só para quem abriu a página por deep link e ainda não tem canal.
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
          Nova demanda
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-lg">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Nova demanda</DialogTitle>
          </DialogHeader>

          <div className="flex flex-col gap-4 px-6 py-5">
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-neutral-700">Título</span>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                autoFocus
                placeholder="Ex.: Ampliação de rede — Loteamento Vila Nova"
                className="h-[42px] rounded-lg border border-neutral-200/80 bg-surface/70 px-3 text-sm text-neutral-900 shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/40"
              />
            </label>

            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-neutral-700">Etapa</span>
                <Select value={stageValue} onValueChange={setStageValue}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TASK_WORKING_STAGES.map((stage) => (
                      <SelectItem key={stage} value={stage}>
                        {TASK_STAGE_META[stage].label}
                      </SelectItem>
                    ))}
                    <SelectItem value={AVULSA}>Avulsa (sem etapa)</SelectItem>
                  </SelectContent>
                </Select>
              </label>

              {isAvulsa ? (
                <label className="flex flex-col gap-1.5">
                  <span className="text-sm font-medium text-neutral-700">Setor</span>
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
              ) : (
                <label className="flex flex-col gap-1.5">
                  <span className="text-sm font-medium text-neutral-700">Prazo (opcional)</span>
                  <input
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    className="h-[42px] rounded-lg border border-neutral-200/80 bg-surface/70 px-3 text-sm text-neutral-900 shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/40"
                  />
                </label>
              )}
            </div>

            {!isAvulsa && (
              <p className="-mt-2 text-xs text-neutral-500">
                {TASK_STAGE_META[stageValue as TaskStage]?.hint}
              </p>
            )}

            {!isAvulsa && (
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-neutral-700">Cliente (opcional)</span>
                <input
                  type="text"
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  placeholder="Quem pediu o orçamento"
                  className="h-[42px] rounded-lg border border-neutral-200/80 bg-surface/70 px-3 text-sm text-neutral-900 shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/40"
                />
              </label>
            )}

            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-neutral-700">Descrição (opcional)</span>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                placeholder="Escopo, local, concessionária, prazo — o que a Engenharia precisa saber."
                className="rounded-lg border border-neutral-200/80 bg-surface/70 px-3 py-2 text-sm text-neutral-900 shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/40"
              />
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-neutral-700">
                Orçamento (opcional — pode vincular depois)
              </span>
              {fixedBudgetId ? (
                <p className="rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2.5 text-sm text-neutral-600">
                  {budgets.find((b) => b.id === fixedBudgetId)?.projectName ?? fixedBudgetId}
                </p>
              ) : (
                <Select value={budgetId || 'none'} onValueChange={(v) => setBudgetId(v === 'none' ? '' : v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Sem orçamento ainda" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sem orçamento ainda</SelectItem>
                    {budgets.map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.projectName}
                        {b.clientName ? ` — ${b.clientName}` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </label>

            {error && <p className="text-sm text-red-600">{error}</p>}
          </div>

          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setOpen(false)} disabled={pending}>
              Cancelar
            </Button>
            <Button type="submit" variant="primary" loading={pending}>
              Criar demanda
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
