'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { UserCog } from 'lucide-react';
import { reassignWorkEngineerAction } from '@/app/configuracoes/_actions/organization';
import type { EngineerRow } from '@/types/people';

interface WorkEngineerAssignmentProps {
  workId: string;
  currentEngineerId: string;
  currentEngineerName: string | null;
  engineers: EngineerRow[];
  canManage: boolean;
}

/**
 * Troca o engenheiro responsável pela obra. Só dono/admin da organização
 * pode usar (canManage vem de ensureOrgAdmin() na page) — pra qualquer outra
 * pessoa vira um cartão só de leitura, sem formulário.
 */
export function WorkEngineerAssignment({
  workId,
  currentEngineerId,
  currentEngineerName,
  engineers,
  canManage,
}: WorkEngineerAssignmentProps) {
  const router = useRouter();
  const [selected, setSelected] = useState(currentEngineerId);
  const [pending, startTransition] = useTransition();

  const handleSave = () => {
    if (selected === currentEngineerId) return;

    startTransition(async () => {
      const result = await reassignWorkEngineerAction(workId, selected);
      if (!result.success) {
        toast.error(result.error);
        setSelected(currentEngineerId);
        return;
      }
      toast.success('Engenheiro responsável atualizado.');
      router.refresh();
    });
  };

  return (
    <div className="rounded-xl border border-gray-200 bg-surface p-5">
      <div className="flex items-center gap-2 text-sm font-semibold text-neutral-900">
        <UserCog className="h-4 w-4 text-gray-400" />
        Engenheiro responsável
      </div>

      {!canManage ? (
        <p className="mt-3 text-sm text-gray-700">
          {currentEngineerName ?? 'Não atribuído'}
        </p>
      ) : (
        <div className="mt-3 space-y-3">
          <p className="text-sm text-gray-500">
            Só o dono ou administrador da organização pode reatribuir a obra a outro engenheiro.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <select
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
              disabled={pending}
              className="flex-1 rounded-lg border border-gray-200 bg-surface px-3 py-2 text-sm text-neutral-900 disabled:opacity-60"
            >
              {!engineers.some((e) => e.id === currentEngineerId) && (
                <option value={currentEngineerId}>
                  {currentEngineerName ?? 'Engenheiro atual'}
                </option>
              )}
              {engineers.map((eng) => (
                <option key={eng.id} value={eng.id}>
                  {eng.fullName || eng.email || eng.id}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={handleSave}
              disabled={pending || selected === currentEngineerId}
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
