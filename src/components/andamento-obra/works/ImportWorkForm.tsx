'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { AlertTriangle, ArrowLeft, FileText } from 'lucide-react';
import {
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { createWorkFromBudget } from '@/actions/works';
import { onPortalPrimaryButtonSmClass } from '@/lib/branding';
import type { ManagerRow } from '@/types/people';
import type { ImportableBudget } from '@/types/works';

interface ImportWorkFormProps {
  budget: ImportableBudget;
  managers: ManagerRow[];
  onBack: () => void;
  onClose: () => void;
}

export function ImportWorkForm({ budget, managers, onBack, onClose }: ImportWorkFormProps) {
  const router = useRouter();
  const [name, setName] = useState(budget.projectName);
  const [clientName, setClientName] = useState(budget.clientName ?? '');
  const [utilityCompany, setUtilityCompany] = useState('');
  const [address, setAddress] = useState('');
  const [managerId, setManagerId] = useState('');
  const [startedAt, setStartedAt] = useState('');
  const [expectedEndAt, setExpectedEndAt] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const activeManagers = managers.filter((m) => m.isActive);

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

    startTransition(async () => {
      const result = await createWorkFromBudget({
        budgetId: budget.id,
        name: name.trim(),
        clientName: clientName || null,
        utilityCompany: utilityCompany || null,
        address: address || null,
        managerId: managerId || null,
        startedAt: startedAt || null,
        expectedEndAt: expectedEndAt || null,
        notes: notes || null,
      });
      if (!result.success) {
        setError(result.error);
        return;
      }
      const workId = result.data?.workId;
      if (!workId) {
        setError('Importação concluída mas a obra não foi retornada.');
        return;
      }
      toast.success('Obra criada a partir do orçamento.');
      onClose();
      router.push(`/tools/andamento-obra/obras/${workId}/visao-geral`);
    });
  };

  return (
    <form onSubmit={handleSubmit}>
      <DialogHeader>
        <DialogTitle>Importar do OrçaRede — {budget.projectName}</DialogTitle>
        <DialogDescription>
          Confirme os dados e importe. O snapshot é fixo: alterações posteriores no orçamento
          não atualizam a obra.
        </DialogDescription>
      </DialogHeader>

      <div className="grid gap-4 px-6 py-4 sm:grid-cols-2">
        <ImportSummary budget={budget} />
        <Warnings budget={budget} />

        <div className="space-y-1.5 sm:col-span-2">
          <label htmlFor="import-name" className="block text-sm font-medium text-gray-700">
            Nome da obra
          </label>
          <input
            id="import-name"
            type="text"
            required
            minLength={3}
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-[#64ABDE] focus:outline-none focus:ring-1 focus:ring-[#64ABDE]"
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="import-client" className="block text-sm font-medium text-gray-700">
            Cliente
          </label>
          <input
            id="import-client"
            type="text"
            value={clientName}
            onChange={(e) => setClientName(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-[#64ABDE] focus:outline-none focus:ring-1 focus:ring-[#64ABDE]"
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="import-utility" className="block text-sm font-medium text-gray-700">
            Concessionária
          </label>
          <input
            id="import-utility"
            type="text"
            value={utilityCompany}
            onChange={(e) => setUtilityCompany(e.target.value)}
            placeholder="Herda do orçamento se vazio"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-[#64ABDE] focus:outline-none focus:ring-1 focus:ring-[#64ABDE]"
          />
        </div>

        <div className="space-y-1.5 sm:col-span-2">
          <label htmlFor="import-address" className="block text-sm font-medium text-gray-700">
            Endereço
          </label>
          <input
            id="import-address"
            type="text"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-[#64ABDE] focus:outline-none focus:ring-1 focus:ring-[#64ABDE]"
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="import-manager" className="block text-sm font-medium text-gray-700">
            Gerente
          </label>
          <select
            id="import-manager"
            value={managerId}
            onChange={(e) => setManagerId(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-[#64ABDE] focus:outline-none focus:ring-1 focus:ring-[#64ABDE]"
          >
            <option value="">Sem gerente atribuído</option>
            {activeManagers.map((m) => (
              <option key={m.id} value={m.id}>
                {m.fullName}
              </option>
            ))}
          </select>
        </div>

        <div />

        <div className="space-y-1.5">
          <label htmlFor="import-start" className="block text-sm font-medium text-gray-700">
            Data de início
          </label>
          <input
            id="import-start"
            type="date"
            value={startedAt}
            onChange={(e) => setStartedAt(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-[#64ABDE] focus:outline-none focus:ring-1 focus:ring-[#64ABDE]"
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="import-end" className="block text-sm font-medium text-gray-700">
            Data prevista de término
          </label>
          <input
            id="import-end"
            type="date"
            value={expectedEndAt}
            onChange={(e) => setExpectedEndAt(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-[#64ABDE] focus:outline-none focus:ring-1 focus:ring-[#64ABDE]"
          />
        </div>

        <div className="space-y-1.5 sm:col-span-2">
          <label htmlFor="import-notes" className="block text-sm font-medium text-gray-700">
            Observações
          </label>
          <textarea
            id="import-notes"
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
          onClick={onBack}
          className="mr-auto inline-flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Voltar
        </button>
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
          {pending ? 'Importando…' : 'Importar e criar obra'}
        </button>
      </DialogFooter>
    </form>
  );
}

function ImportSummary({ budget }: { budget: ImportableBudget }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 sm:col-span-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
        Resumo da importação
      </p>
      <ul className="mt-2 grid grid-cols-1 gap-1.5 text-xs text-gray-700 sm:grid-cols-2">
        <li>
          <strong className="font-semibold">{budget.postsCount}</strong> postes planejados
        </li>
        <li>
          <strong className="font-semibold">{budget.persistedConnectionsCount}</strong>{' '}
          conexões persistidas
        </li>
        <li className="flex items-center gap-1.5">
          {budget.hasPdf ? (
            <>
              <FileText className="h-3.5 w-3.5 text-blue-600" /> PDF/planta será copiado
            </>
          ) : (
            <span className="text-gray-500">Sem PDF/planta no orçamento</span>
          )}
        </li>
        <li className="text-gray-500">
          Metragem planejada:{' '}
          <span className="font-medium text-gray-700">0 m</span>{' '}
          <span className="text-[11px] text-gray-500">(definida via OrçaRede legado)</span>
        </li>
      </ul>
    </div>
  );
}

function Warnings({ budget }: { budget: ImportableBudget }) {
  const warnings: string[] = [];
  if (budget.existingActiveWorksCount > 0) {
    warnings.push(
      `Este orçamento já foi importado em ${budget.existingActiveWorksCount} obra(s) ativa(s). Importar novamente cria uma nova obra independente.`,
    );
  }
  if (!budget.hasPdf) {
    warnings.push('Este orçamento não tem PDF/planta. A obra será criada sem canvas visual.');
  }
  if (budget.postsCount === 0) {
    warnings.push('Este orçamento não tem postes planejados.');
  }
  if (budget.persistedConnectionsCount === 0) {
    warnings.push(
      'Este orçamento não tem conexões persistidas. Conexões só são salvas quando há uma obra de acompanhamento associada no OrçaRede legado.',
    );
  }

  if (warnings.length === 0) return null;

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 sm:col-span-2">
      <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-amber-800">
        <AlertTriangle className="h-3.5 w-3.5" /> Avisos
      </p>
      <ul className="mt-2 space-y-1 text-xs text-amber-900">
        {warnings.map((w, idx) => (
          <li key={idx}>· {w}</li>
        ))}
      </ul>
    </div>
  );
}
