'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { HardHat } from 'lucide-react';
import { reassignWorkManagerAction } from '@/app/configuracoes/_actions/organization';
import type { ManagerRow } from '@/types/people';

const NONE_VALUE = '__none__';

interface WorkManagerAssignmentProps {
  workId: string;
  currentManagerId: string | null;
  currentManagerName: string | null;
  managers: ManagerRow[];
  canManage: boolean;
}

/**
 * Troca (ou remove) o gerente de obra, ao lado de "Engenheiro responsável" na
 * mesma aba. O select só lista gerentes cadastrados pelo engenheiro atual da
 * obra (`getManagers(supabase, work.engineerId)` na page) — mesma regra que
 * `ensureManagerBelongsToEngineer` já aplica em outras telas.
 */
export function WorkManagerAssignment({
  workId,
  currentManagerId,
  currentManagerName,
  managers,
  canManage,
}: WorkManagerAssignmentProps) {
  const router = useRouter();
  const [selected, setSelected] = useState(currentManagerId ?? NONE_VALUE);
  const [pending, startTransition] = useTransition();

  const handleSave = () => {
    const nextManagerId = selected === NONE_VALUE ? null : selected;
    if (nextManagerId === currentManagerId) return;

    startTransition(async () => {
      const result = await reassignWorkManagerAction(workId, nextManagerId);
      if (!result.success) {
        toast.error(result.error);
        setSelected(currentManagerId ?? NONE_VALUE);
        return;
      }
      toast.success('Gerente de obra atualizado.');
      router.refresh();
    });
  };

  return (
    <div className="rounded-xl border border-gray-200 bg-surface p-5">
      <div className="flex items-center gap-2 text-sm font-semibold text-neutral-900">
        <HardHat className="h-4 w-4 text-gray-400" />
        Gerente de obra
      </div>

      {!canManage ? (
        <p className="mt-3 text-sm text-gray-700">
          {currentManagerName ?? 'Não atribuído'}
        </p>
      ) : (
        <div className="mt-3 space-y-3">
          <p className="text-sm text-gray-500">
            Só gerentes cadastrados pelo engenheiro responsável atual da obra aparecem aqui.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <select
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
              disabled={pending}
              className="flex-1 rounded-lg border border-gray-200 bg-surface px-3 py-2 text-sm text-neutral-900 disabled:opacity-60"
            >
              <option value={NONE_VALUE}>Nenhum</option>
              {currentManagerId && !managers.some((m) => m.id === currentManagerId) && (
                <option value={currentManagerId}>
                  {currentManagerName ?? 'Gerente atual'}
                </option>
              )}
              {managers.map((mgr) => (
                <option key={mgr.id} value={mgr.id}>
                  {mgr.fullName || mgr.email || mgr.id}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={handleSave}
              disabled={pending || (selected === NONE_VALUE ? currentManagerId === null : selected === currentManagerId)}
              className="inline-flex items-center justify-center rounded-lg bg-accent-600 px-4 py-2 text-sm font-medium text-white hover:bg-accent-700 disabled:opacity-60"
            >
              {pending ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
