'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
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
import type { WorkWithManager } from '@/types/works';

interface NewWorkDialogProps {
  open: boolean;
  onClose: () => void;
  managers: ManagerRow[];
  /** Se fornecido, o dialog opera em modo edição. */
  work?: WorkWithManager | null;
}

export function NewWorkDialog({ open, onClose, managers, work }: NewWorkDialogProps) {
  const handleOpenChange = (next: boolean) => {
    if (!next) onClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl">
        {open && (
          <WorkForm
            key={work?.id ?? 'new'}
            managers={managers}
            work={work ?? null}
            onClose={onClose}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

interface WorkFormProps {
  managers: ManagerRow[];
  work: WorkWithManager | null;
  onClose: () => void;
}

function WorkForm({ managers, work, onClose }: WorkFormProps) {
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
        <DialogTitle>{isEdit ? 'Editar obra' : 'Nova obra'}</DialogTitle>
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
