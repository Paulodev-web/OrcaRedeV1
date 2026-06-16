'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ArrowLeft, FilePlus2, FileSearch } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { createWork, updateWork } from '@/actions/works';
import { onPortalPrimaryButtonSmClass } from '@/lib/branding';
import type { ManagerRow } from '@/types/people';
import type { ImportableBudget, WorkWithManager } from '@/types/works';
import { BudgetPickerStep } from './BudgetPickerStep';
import { ImportWorkForm } from './ImportWorkForm';

type DialogStep = 'mode' | 'create' | 'pick-budget' | 'import-form';

interface NewWorkDialogProps {
  open: boolean;
  onClose: () => void;
  managers: ManagerRow[];
  /** Se fornecido, o dialog opera em modo edição (segue fluxo do Bloco 2). */
  work?: WorkWithManager | null;
}

export function NewWorkDialog({ open, onClose, managers, work }: NewWorkDialogProps) {
  const handleOpenChange = (next: boolean) => {
    if (!next) onClose();
  };

  const isEdit = work !== null && work !== undefined;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl">
        {open && (
          <DialogBody
            key={isEdit ? `edit-${work.id}` : 'new'}
            managers={managers}
            work={work ?? null}
            onClose={onClose}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

interface DialogBodyProps {
  managers: ManagerRow[];
  work: WorkWithManager | null;
  onClose: () => void;
}

function DialogBody({ managers, work, onClose }: DialogBodyProps) {
  const isEdit = work !== null;
  const [step, setStep] = useState<DialogStep>(isEdit ? 'create' : 'mode');
  const [selectedBudget, setSelectedBudget] = useState<ImportableBudget | null>(null);

  if (isEdit || step === 'create') {
    return (
      <WorkForm
        managers={managers}
        work={work}
        onClose={onClose}
        onBack={isEdit ? null : () => setStep('mode')}
      />
    );
  }

  if (step === 'pick-budget') {
    return (
      <BudgetPickerStep
        onBack={() => setStep('mode')}
        onSelect={(budget) => {
          setSelectedBudget(budget);
          setStep('import-form');
        }}
      />
    );
  }

  if (step === 'import-form' && selectedBudget) {
    return (
      <ImportWorkForm
        budget={selectedBudget}
        managers={managers}
        onBack={() => setStep('pick-budget')}
        onClose={onClose}
      />
    );
  }

  return <ModeStep onPickCreate={() => setStep('create')} onPickImport={() => setStep('pick-budget')} />;
}

function ModeStep({
  onPickCreate,
  onPickImport,
}: {
  onPickCreate: () => void;
  onPickImport: () => void;
}) {
  return (
    <>
      <DialogHeader>
        <DialogTitle>Nova obra</DialogTitle>
        <DialogDescription>
          Como você quer criar esta obra de Andamento?
        </DialogDescription>
      </DialogHeader>

      <div className="grid gap-3 px-6 py-4 sm:grid-cols-2">
        <button
          type="button"
          onClick={onPickCreate}
          className="group flex flex-col items-start gap-2 rounded-xl border border-gray-200 bg-white p-4 text-left transition-all hover:border-[#64ABDE]/60 hover:shadow-md"
        >
          <span className="rounded-lg bg-[#64ABDE]/10 p-2 text-[#1D3140] group-hover:bg-[#64ABDE]/20">
            <FilePlus2 className="h-5 w-5" />
          </span>
          <span className="text-sm font-semibold text-[#1D3140]">Criar do zero</span>
          <span className="text-xs text-gray-500">
            Cadastra uma obra sem vínculo com orçamento. Você adiciona postes e materiais
            depois, manualmente.
          </span>
        </button>

        <button
          type="button"
          onClick={onPickImport}
          className="group flex flex-col items-start gap-2 rounded-xl border border-gray-200 bg-white p-4 text-left transition-all hover:border-[#64ABDE]/60 hover:shadow-md"
        >
          <span className="rounded-lg bg-[#64ABDE]/10 p-2 text-[#1D3140] group-hover:bg-[#64ABDE]/20">
            <FileSearch className="h-5 w-5" />
          </span>
          <span className="text-sm font-semibold text-[#1D3140]">Importar do OrçaRede</span>
          <span className="text-xs text-gray-500">
            Importa PDF, postes, materiais e metragem de um orçamento finalizado. Snapshot
            fixo: alterações posteriores no orçamento não alteram a obra.
          </span>
        </button>
      </div>

      <DialogFooter />
    </>
  );
}

interface WorkFormProps {
  managers: ManagerRow[];
  work: WorkWithManager | null;
  onClose: () => void;
  onBack: (() => void) | null;
}

function WorkForm({ managers, work, onClose, onBack }: WorkFormProps) {
  const router = useRouter();
  const isEdit = work !== null;

  const [name, setName] = useState(work?.name ?? '');
  const [clientName, setClientName] = useState(work?.clientName ?? '');
  const [utilityCompany, setUtilityCompany] = useState(work?.utilityCompany ?? '');
  const [address, setAddress] = useState(work?.address ?? '');
  const [managerId, setManagerId] = useState(work?.managerId ?? '');
  const [startedAt, setStartedAt] = useState(work?.startedAt ?? '');
  const [expectedEndAt, setExpectedEndAt] = useState(work?.expectedEndAt ?? '');
  const [notes, setNotes] = useState(work?.notes ?? '');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const firstFieldRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const t = setTimeout(() => firstFieldRef.current?.focus(), 50);
    return () => clearTimeout(t);
  }, []);

  const activeManagers = managers.filter((m) => m.isActive || m.id === work?.managerId);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (name.trim().length < 3) {
      setError('Informe um nome com ao menos 3 caracteres.');
      return;
    }
    if (startedAt && expectedEndAt && expectedEndAt < startedAt) {
      setError('A data prevista de término deve ser igual ou posterior à data de início.');
      return;
    }

    const payload = {
      name: name.trim(),
      clientName: clientName || null,
      utilityCompany: utilityCompany || null,
      address: address || null,
      managerId: managerId || null,
      startedAt: startedAt || null,
      expectedEndAt: expectedEndAt || null,
      notes: notes || null,
    };

    startTransition(async () => {
      if (isEdit && work) {
        const result = await updateWork({ id: work.id, ...payload });
        if (!result.success) {
          setError(result.error);
          return;
        }
        toast.success('Obra atualizada.');
        onClose();
        router.refresh();
        return;
      }

      const result = await createWork(payload);
      if (!result.success) {
        setError(result.error);
        return;
      }
      const workId = result.data?.workId;
      if (workId) {
        toast.success('Obra criada.');
        onClose();
        router.push(`/tools/andamento-obra/obras/${workId}`);
      }
    });
  };

  return (
    <form onSubmit={handleSubmit}>
      <DialogHeader>
        <DialogTitle>
          {isEdit ? 'Editar obra' : 'Nova obra — criar do zero'}
        </DialogTitle>
        <DialogDescription>
          {isEdit
            ? 'Atualize os dados da obra. Mudanças de status são feitas pelo botão de status.'
            : 'Cadastre uma obra do zero. Marcos padrão e notificação serão criados automaticamente.'}
        </DialogDescription>
      </DialogHeader>

      <div className="grid gap-4 px-6 py-4 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <label htmlFor="work-name" className="block text-sm font-medium text-gray-700">
            Nome da obra
          </label>
          <input
            ref={firstFieldRef}
            id="work-name"
            type="text"
            required
            minLength={3}
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-[#64ABDE] focus:outline-none focus:ring-1 focus:ring-[#64ABDE]"
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="work-client" className="block text-sm font-medium text-gray-700">
            Cliente
          </label>
          <input
            id="work-client"
            type="text"
            value={clientName}
            onChange={(e) => setClientName(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-[#64ABDE] focus:outline-none focus:ring-1 focus:ring-[#64ABDE]"
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="work-utility" className="block text-sm font-medium text-gray-700">
            Concessionária
          </label>
          <input
            id="work-utility"
            type="text"
            value={utilityCompany}
            onChange={(e) => setUtilityCompany(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-[#64ABDE] focus:outline-none focus:ring-1 focus:ring-[#64ABDE]"
          />
        </div>

        <div className="space-y-1.5 sm:col-span-2">
          <label htmlFor="work-address" className="block text-sm font-medium text-gray-700">
            Endereço
          </label>
          <input
            id="work-address"
            type="text"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-[#64ABDE] focus:outline-none focus:ring-1 focus:ring-[#64ABDE]"
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="work-manager" className="block text-sm font-medium text-gray-700">
            Gerente
          </label>
          <select
            id="work-manager"
            value={managerId}
            onChange={(e) => setManagerId(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-[#64ABDE] focus:outline-none focus:ring-1 focus:ring-[#64ABDE]"
          >
            <option value="">Sem gerente atribuído</option>
            {activeManagers.map((m) => (
              <option key={m.id} value={m.id}>
                {m.fullName} {!m.isActive && '(inativo)'}
              </option>
            ))}
          </select>
          {managers.length === 0 && (
            <p className="text-[11px] text-gray-500">
              Você ainda não cadastrou gerentes. Vá em Pessoas para criar.
            </p>
          )}
        </div>

        <div />

        <div className="space-y-1.5">
          <label htmlFor="work-start" className="block text-sm font-medium text-gray-700">
            Data de início
          </label>
          <input
            id="work-start"
            type="date"
            value={startedAt}
            onChange={(e) => setStartedAt(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-[#64ABDE] focus:outline-none focus:ring-1 focus:ring-[#64ABDE]"
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="work-end" className="block text-sm font-medium text-gray-700">
            Data prevista de término
          </label>
          <input
            id="work-end"
            type="date"
            value={expectedEndAt}
            onChange={(e) => setExpectedEndAt(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-[#64ABDE] focus:outline-none focus:ring-1 focus:ring-[#64ABDE]"
          />
        </div>

        <div className="space-y-1.5 sm:col-span-2">
          <label htmlFor="work-notes" className="block text-sm font-medium text-gray-700">
            Observações
          </label>
          <textarea
            id="work-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-[#64ABDE] focus:outline-none focus:ring-1 focus:ring-[#64ABDE]"
          />
        </div>

        {error && (
          <div
            role="alert"
            className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 sm:col-span-2"
          >
            {error}
          </div>
        )}
      </div>

      <DialogFooter>
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="mr-auto inline-flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Voltar
          </button>
        )}
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={pending}
          className={`${onPortalPrimaryButtonSmClass} rounded-lg px-4 py-2 text-sm disabled:opacity-60`}
        >
          {pending ? 'Salvando...' : isEdit ? 'Salvar alterações' : 'Criar obra'}
        </button>
      </DialogFooter>
    </form>
  );
}
