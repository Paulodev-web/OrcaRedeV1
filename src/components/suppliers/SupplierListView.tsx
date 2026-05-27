'use client';

import { useMemo, useState } from 'react';
import { suppliesTableScrollClass } from '@/lib/suppliesLayout';
import { History, Loader2, Pencil, Plus, UserX, UserCheck } from 'lucide-react';
import {
  deactivateSupplierAction,
  listAllSuppliersAction,
  reactivateSupplierAction,
} from '@/actions/suppliers';
import type { Supplier } from '@/types';
import SupplierFormModal from './SupplierFormModal';
import SupplierPdfHistoryModal from './SupplierPdfHistoryModal';

interface Props {
  initialSuppliers: Supplier[];
}

export default function SupplierListView({ initialSuppliers }: Props) {
  const [suppliers, setSuppliers] = useState<Supplier[]>(initialSuppliers);
  const [showInactive, setShowInactive] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [historySupplier, setHistorySupplier] = useState<Supplier | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);

  const visible = useMemo(
    () => (showInactive ? suppliers : suppliers.filter((s) => s.is_active)),
    [suppliers, showInactive]
  );

  const refresh = async () => {
    const res = await listAllSuppliersAction();
    if (res.success) setSuppliers(res.data);
  };

  const openCreate = () => {
    setEditing(null);
    setModalOpen(true);
  };

  const openEdit = (s: Supplier) => {
    setEditing(s);
    setModalOpen(true);
  };

  const openHistory = (s: Supplier) => {
    setHistorySupplier(s);
    setHistoryOpen(true);
  };

  const handleDeactivate = async (id: string) => {
    if (!confirm('Desativar este fornecedor? Ele não aparecerá em novos uploads.')) return;
    setBusyId(id);
    setError(null);
    const res = await deactivateSupplierAction(id);
    setBusyId(null);
    if (!res.success) {
      setError(res.error);
      return;
    }
    await refresh();
  };

  const handleReactivate = async (id: string) => {
    setBusyId(id);
    setError(null);
    const res = await reactivateSupplierAction(id);
    setBusyId(null);
    if (!res.success) {
      setError(res.error);
      return;
    }
    await refresh();
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col rounded-2xl border border-[#64ABDE]/30 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-gray-100 px-6 py-4">
        <div className="flex items-center gap-3">
          <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-600">
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(e) => setShowInactive(e.target.checked)}
              className="rounded border-gray-300"
            />
            Mostrar inativos
          </label>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center gap-2 rounded-lg bg-[#1D3140] px-4 py-2 text-sm font-medium text-white hover:bg-[#2a4558]"
        >
          <Plus className="h-4 w-4" />
          Novo fornecedor
        </button>
      </div>

      {error && (
        <p className="mx-6 mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <div className={`mx-6 mb-6 min-h-0 flex-1 ${suppliesTableScrollClass}`}>
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-slate-50/80 text-xs font-semibold uppercase tracking-wide text-gray-500">
              <th className="px-6 py-3">Nome</th>
              <th className="px-4 py-3">CNPJ</th>
              <th className="px-4 py-3">Contato</th>
              <th className="px-4 py-3">Telefone</th>
              <th className="px-6 py-3 text-right">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {visible.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-12 text-center text-gray-500">
                  Nenhum fornecedor cadastrado. Crie o primeiro para vincular cotações.
                </td>
              </tr>
            ) : (
              visible.map((s) => (
                <tr key={s.id} className={!s.is_active ? 'bg-gray-50/80 text-gray-500' : ''}>
                  <td className="px-6 py-3 font-medium text-[#1D3140]">
                    {s.name}
                    {!s.is_active && (
                      <span className="ml-2 rounded-full bg-gray-200 px-2 py-0.5 text-xs font-normal text-gray-600">
                        Inativo
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{s.cnpj || '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{s.sales_contact || '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{s.phone || '—'}</td>
                  <td className="px-6 py-3">
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => openHistory(s)}
                        className="inline-flex items-center gap-1 rounded-lg border border-[#64ABDE]/40 px-2.5 py-1.5 text-xs font-medium text-[#1D3140] hover:bg-[#64ABDE]/10"
                      >
                        <History className="h-3.5 w-3.5" />
                        Histórico
                      </button>
                      <button
                        type="button"
                        onClick={() => openEdit(s)}
                        className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        Editar
                      </button>
                      {s.is_active ? (
                        <button
                          type="button"
                          disabled={busyId === s.id}
                          onClick={() => void handleDeactivate(s.id)}
                          className="inline-flex items-center gap-1 rounded-lg border border-amber-200 px-2.5 py-1.5 text-xs font-medium text-amber-800 hover:bg-amber-50 disabled:opacity-50"
                        >
                          {busyId === s.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <UserX className="h-3.5 w-3.5" />
                          )}
                          Desativar
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={busyId === s.id}
                          onClick={() => void handleReactivate(s.id)}
                          className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 px-2.5 py-1.5 text-xs font-medium text-emerald-800 hover:bg-emerald-50 disabled:opacity-50"
                        >
                          {busyId === s.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <UserCheck className="h-3.5 w-3.5" />
                          )}
                          Reativar
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <SupplierFormModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        supplier={editing}
        onSaved={async () => {
          await refresh();
        }}
      />

      <SupplierPdfHistoryModal
        supplier={historySupplier}
        open={historyOpen}
        onOpenChange={(open) => {
          setHistoryOpen(open);
          if (!open) setHistorySupplier(null);
        }}
      />
    </div>
  );
}
