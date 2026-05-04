'use client';

import { useMemo, useState, useTransition } from 'react';
import { Plus, Pencil, Power, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { ManagerFormDialog } from './ManagerFormDialog';
import { deactivateManager, reactivateManager } from '@/actions/people';
import { onPortalPrimaryButtonSmClass } from '@/lib/branding';
import type { ManagerRow } from '@/types/people';

interface ManagersTableProps {
  managers: ManagerRow[];
  onChange: (next: ManagerRow[]) => void;
}

function formatDate(value: string): string {
  try {
    return new Date(value).toLocaleDateString('pt-BR');
  } catch {
    return value;
  }
}

export function ManagersTable({ managers, onChange }: ManagersTableProps) {
  const [dialogState, setDialogState] = useState<
    | { mode: 'create' }
    | { mode: 'edit'; manager: ManagerRow }
    | null
  >(null);
  const [pending, startTransition] = useTransition();
  const [pendingId, setPendingId] = useState<string | null>(null);

  const sorted = useMemo(
    () => [...managers].sort((a, b) => a.fullName.localeCompare(b.fullName, 'pt-BR')),
    [managers],
  );

  const handleToggleActive = (manager: ManagerRow) => {
    setPendingId(manager.id);
    startTransition(async () => {
      const result = manager.isActive
        ? await deactivateManager(manager.id)
        : await reactivateManager(manager.id);
      setPendingId(null);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      onChange(
        managers.map((m) =>
          m.id === manager.id ? { ...m, isActive: !manager.isActive } : m,
        ),
      );
      toast.success(manager.isActive ? 'Gerente desativado.' : 'Gerente reativado.');
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">
          {sorted.length === 0
            ? 'Nenhum gerente cadastrado ainda.'
            : `${sorted.length} ${sorted.length === 1 ? 'gerente' : 'gerentes'} cadastrado${sorted.length === 1 ? '' : 's'}.`}
        </p>
        <button
          type="button"
          onClick={() => setDialogState({ mode: 'create' })}
          className={`${onPortalPrimaryButtonSmClass} inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm`}
        >
          <Plus className="h-4 w-4" />
          Novo Gerente
        </button>
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-4 py-3 text-left font-medium">Nome</th>
              <th className="px-4 py-3 text-left font-medium">E-mail</th>
              <th className="px-4 py-3 text-left font-medium">Telefone</th>
              <th className="px-4 py-3 text-left font-medium">Status</th>
              <th className="px-4 py-3 text-left font-medium">Criado em</th>
              <th className="px-4 py-3 text-right font-medium">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-sm text-gray-400">
                  Use o botão acima para cadastrar o primeiro gerente.
                </td>
              </tr>
            ) : (
              sorted.map((manager) => {
                const busy = pending && pendingId === manager.id;
                return (
                  <tr key={manager.id} className="hover:bg-gray-50/60">
                    <td className="px-4 py-3 font-medium text-[#1D3140]">{manager.fullName}</td>
                    <td className="px-4 py-3 text-gray-600">{manager.email ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-600">{manager.phone ?? '—'}</td>
                    <td className="px-4 py-3">
                      <span
                        className={
                          manager.isActive
                            ? 'inline-flex rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700'
                            : 'inline-flex rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500'
                        }
                      >
                        {manager.isActive ? 'Ativo' : 'Inativo'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500">{formatDate(manager.createdAt)}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          aria-label={`Editar ${manager.fullName}`}
                          onClick={() => setDialogState({ mode: 'edit', manager })}
                          className="rounded-md p-2 text-gray-500 hover:bg-gray-100 hover:text-[#1D3140]"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          aria-label={
                            manager.isActive
                              ? `Desativar ${manager.fullName}`
                              : `Reativar ${manager.fullName}`
                          }
                          onClick={() => handleToggleActive(manager)}
                          className="rounded-md p-2 text-gray-500 hover:bg-gray-100 hover:text-[#1D3140] disabled:opacity-50"
                        >
                          {manager.isActive ? (
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
        <ManagerFormDialog
          mode={dialogState.mode}
          manager={dialogState.mode === 'edit' ? dialogState.manager : undefined}
          onClose={() => setDialogState(null)}
          onCreated={(manager) => {
            onChange([...managers, manager]);
          }}
          onUpdated={(updated) => {
            onChange(managers.map((m) => (m.id === updated.id ? updated : m)));
          }}
        />
      )}
    </div>
  );
}
