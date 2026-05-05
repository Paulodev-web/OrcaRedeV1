'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { deallocateCrewFromWork } from '@/actions/workTeam';
import type { WorkTeamMember } from '@/types/works';
import { AllocateCrewDialog } from './AllocateCrewDialog';

interface Props {
  team: WorkTeamMember[];
  availableCrew: Array<{ id: string; full_name: string; role: string | null }>;
  workId: string;
  isEngineer: boolean;
}

export function WorkTeamSection({ team, availableCrew, workId, isEngineer }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const handleRemove = (crewMemberId: string, name: string) => {
    if (!confirm(`Remover ${name} da equipe?`)) return;
    startTransition(async () => {
      await deallocateCrewFromWork({ workId, crewMemberId });
      router.refresh();
    });
  };

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-[#1D3140]">Equipe Atual</h2>
        {isEngineer && availableCrew.length > 0 && (
          <AllocateCrewDialog workId={workId} availableCrew={availableCrew} />
        )}
      </div>

      {team.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 p-6 text-center">
          <p className="text-sm text-gray-500">Nenhum membro alocado à equipe desta obra.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-busy={pending}>
          {team.map((m) => (
            <div
              key={m.id}
              className="flex items-center justify-between rounded-lg border border-gray-200 bg-white p-3 shadow-sm"
            >
              <div>
                <p className="text-sm font-medium text-[#1D3140]">
                  {m.crewMemberName}
                  {!m.crewMemberIsActive && (
                    <span className="ml-1 rounded bg-red-50 px-1 py-0.5 text-[10px] text-red-500">
                      Inativo
                    </span>
                  )}
                </p>
                <p className="text-xs text-gray-500">
                  {m.roleInWork ?? m.crewMemberRole ?? 'Sem função definida'}
                </p>
              </div>
              {isEngineer && (
                <button
                  type="button"
                  onClick={() => handleRemove(m.crewMemberId, m.crewMemberName)}
                  disabled={pending}
                  className="rounded p-1 text-xs text-red-400 hover:bg-red-50 hover:text-red-600"
                  aria-label={`Remover ${m.crewMemberName}`}
                >
                  ✕
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
