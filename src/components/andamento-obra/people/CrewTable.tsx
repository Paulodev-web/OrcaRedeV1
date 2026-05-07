'use client';

import { useMemo, useState, useTransition } from 'react';
import { Plus, Pencil, Power, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { CrewFormDialog } from './CrewFormDialog';
import { deactivateCrew, reactivateCrew } from '@/actions/people';
import { onPortalPrimaryButtonSmClass } from '@/lib/branding';
import type { CrewMemberRow } from '@/types/people';

interface CrewTableProps {
  crew: CrewMemberRow[];
  onChange: (next: CrewMemberRow[]) => void;
}

export function CrewTable({ crew, onChange }: CrewTableProps) {
  const [dialogState, setDialogState] = useState<
    | { mode: 'create' }
    | { mode: 'edit'; member: CrewMemberRow }
    | null
  >(null);
  const [pending, startTransition] = useTransition();
  const [pendingId, setPendingId] = useState<string | null>(null);

  const sorted = useMemo(
    () => [...crew].sort((a, b) => a.fullName.localeCompare(b.fullName, 'pt-BR')),
    [crew],
  );

  const handleToggleActive = (member: CrewMemberRow) => {
    setPendingId(member.id);
    startTransition(async () => {
      const result = member.isActive
        ? await deactivateCrew(member.id)
        : await reactivateCrew(member.id);
      setPendingId(null);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      onChange(
        crew.map((m) => (m.id === member.id ? { ...m, isActive: !member.isActive } : m)),
      );
      toast.success(member.isActive ? 'Membro desativado.' : 'Membro reativado.');
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">
          {sorted.length === 0
            ? 'Nenhum membro de equipe cadastrado ainda.'
            : `${sorted.length} ${sorted.length === 1 ? 'membro' : 'membros'} cadastrado${sorted.length === 1 ? '' : 's'}.`}
        </p>
        <button
          type="button"
          onClick={() => setDialogState({ mode: 'create' })}
          className={`${onPortalPrimaryButtonSmClass} inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm`}
        >
          <Plus className="h-4 w-4" />
          Novo Membro
        </button>
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-4 py-3 text-left font-medium">Nome</th>
              <th className="px-4 py-3 text-left font-medium">Função</th>
              <th className="px-4 py-3 text-left font-medium">Telefone</th>
              <th className="px-4 py-3 text-left font-medium">Status</th>
              <th className="px-4 py-3 text-right font-medium">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-sm text-gray-400">
                  Use o botão acima para cadastrar o primeiro membro de equipe.
                </td>
              </tr>
            ) : (
              sorted.map((member) => {
                const busy = pending && pendingId === member.id;
                return (
                  <tr key={member.id} className="hover:bg-gray-50/60">
                    <td className="px-4 py-3 font-medium text-[#1D3140]">{member.fullName}</td>
                    <td className="px-4 py-3 text-gray-600">{member.role ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-600">{member.phone ?? '—'}</td>
                    <td className="px-4 py-3">
                      <span
                        className={
                          member.isActive
                            ? 'inline-flex rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700'
                            : 'inline-flex rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500'
                        }
                      >
                        {member.isActive ? 'Ativo' : 'Inativo'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          aria-label={`Editar ${member.fullName}`}
                          onClick={() => setDialogState({ mode: 'edit', member })}
                          className="rounded-md p-2 text-gray-500 hover:bg-gray-100 hover:text-[#1D3140]"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          aria-label={
                            member.isActive
                              ? `Desativar ${member.fullName}`
                              : `Reativar ${member.fullName}`
                          }
                          onClick={() => handleToggleActive(member)}
                          className="rounded-md p-2 text-gray-500 hover:bg-gray-100 hover:text-[#1D3140] disabled:opacity-50"
                        >
                          {member.isActive ? (
                            <Power className="h-4 w-4" />
                          ) : (
                            <RotateCcw className="h-4 w-4" />
                          )}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {dialogState && (
        <CrewFormDialog
          mode={dialogState.mode}
          member={dialogState.mode === 'edit' ? dialogState.member : undefined}
          onClose={() => setDialogState(null)}
          onCreated={(member) => onChange([...crew, member])}
          onUpdated={(updated) =>
            onChange(crew.map((m) => (m.id === updated.id ? updated : m)))
          }
        />
      )}
    </div>
  );
}
