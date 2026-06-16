'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { allocateCrewToWork } from '@/actions/workTeam';

interface Props {
  workId: string;
  availableCrew: Array<{ id: string; full_name: string; role: string | null }>;
}

export function AllocateCrewDialog({ workId, availableCrew }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [selectedId, setSelectedId] = useState('');
  const [roleInWork, setRoleInWork] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleOpen = () => {
    setOpen(true);
    setError(null);
    setSelectedId(availableCrew[0]?.id ?? '');
    setRoleInWork('');
  };

  const handleSubmit = () => {
    setError(null);
    if (!selectedId) {
      setError('Selecione um membro.');
      return;
    }

    startTransition(async () => {
      const result = await allocateCrewToWork({
        workId,
        crewMemberId: selectedId,
        roleInWork: roleInWork.trim() || undefined,
      });
      if (!result.success) {
        setError(result.error ?? 'Erro.');
        return;
      }
      setOpen(false);
      router.refresh();
    });
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={handleOpen}
        className="rounded-lg bg-[#64ABDE] px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-[#4A8FC2]"
      >
        + Adicionar membro
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30" onClick={() => setOpen(false)} />
      <div className="relative w-full max-w-sm rounded-xl bg-white p-6 shadow-xl">
        <h3 className="mb-4 text-lg font-semibold text-[#1D3140]">Adicionar à equipe</h3>

        <div className="space-y-3">
          <div>
            <label htmlFor="crew-select" className="block text-sm font-medium text-gray-700">
              Membro *
            </label>
            <select
              id="crew-select"
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            >
              {availableCrew.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.full_name}{c.role ? ` (${c.role})` : ''}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="role-input" className="block text-sm font-medium text-gray-700">
              Função na obra (opcional)
            </label>
            <input
              id="role-input"
              type="text"
              value={roleInWork}
              onChange={(e) => setRoleInWork(e.target.value)}
              placeholder="Ex.: Encarregado, Eletricista..."
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={pending}
              className="rounded-md bg-[#1D3140] px-4 py-2 text-sm font-medium text-white hover:bg-[#2A4557] disabled:opacity-50"
            >
              {pending ? 'Adicionando...' : 'Adicionar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
