'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, Plus, Search } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { listSuppliersAction } from '@/actions/suppliers';
import type { Supplier } from '@/types';
import SupplierFormModal from './SupplierFormModal';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fileLabel?: string;
  /** PDFs ainda na fila após o atual (exibe opção de aplicar o mesmo fornecedor). */
  remainingInBatch?: number;
  onConfirm: (supplierId: string, applyToRemaining: boolean) => void;
}

export default function SupplierPickerModal({
  open,
  onOpenChange,
  fileLabel,
  remainingInBatch = 0,
  onConfirm,
}: Props) {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [applyToRemaining, setApplyToRemaining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  const loadSuppliers = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await listSuppliersAction();
    setLoading(false);
    if (!res.success) {
      setError(res.error);
      setSuppliers([]);
      return;
    }
    setSuppliers(res.data);
  }, []);

  useEffect(() => {
    if (!open) return;
    setSelectedId(null);
    setSearch('');
    setApplyToRemaining(false);
    void loadSuppliers();
  }, [open, loadSuppliers]);

  const filtered = suppliers.filter((s) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      s.name.toLowerCase().includes(q) ||
      (s.cnpj?.toLowerCase().includes(q) ?? false) ||
      (s.sales_contact?.toLowerCase().includes(q) ?? false)
    );
  });

  const handleConfirm = () => {
    if (!selectedId) {
      setError('Selecione um fornecedor para continuar.');
      return;
    }
    onConfirm(selectedId, applyToRemaining && remainingInBatch > 0);
    onOpenChange(false);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Vincular fornecedor</DialogTitle>
            <DialogDescription>
              {fileLabel
                ? `Escolha o fornecedor da cotação: ${fileLabel}`
                : 'Escolha o fornecedor desta cotação antes de processar o PDF.'}
            </DialogDescription>
          </DialogHeader>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="search"
              placeholder="Buscar por nome..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm"
            />
          </div>

          <button
            type="button"
            onClick={() => setFormOpen(true)}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-[#64ABDE]/60 py-2 text-sm font-medium text-[#1D3140] hover:bg-[#64ABDE]/10"
          >
            <Plus className="h-4 w-4" />
            Criar novo fornecedor
          </button>

          <div className="max-h-56 overflow-y-auto rounded-lg border border-gray-200">
            {loading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-[#64ABDE]" />
              </div>
            ) : filtered.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-gray-500">
                Nenhum fornecedor ativo encontrado.
              </p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {filtered.map((s) => (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedId(s.id);
                        setError(null);
                      }}
                      className={[
                        'w-full px-4 py-3 text-left text-sm transition-colors',
                        selectedId === s.id
                          ? 'bg-[#64ABDE]/15 font-semibold text-[#1D3140]'
                          : 'hover:bg-gray-50 text-gray-800',
                      ].join(' ')}
                    >
                      {s.name}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {remainingInBatch > 0 && (
            <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-[#64ABDE]/30 bg-[#64ABDE]/5 px-3 py-2.5 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={applyToRemaining}
                onChange={(e) => setApplyToRemaining(e.target.checked)}
                className="mt-0.5 rounded border-gray-300"
              />
              <span>
                Aplicar este fornecedor para os demais arquivos desta remessa (
                {remainingInBatch} restante{remainingInBatch === 1 ? '' : 's'})
              </span>
            </label>
          )}

          {error && (
            <p className="text-sm text-red-600">{error}</p>
          )}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={!selectedId}
              className="rounded-lg bg-[#1D3140] px-4 py-2 text-sm font-medium text-white hover:bg-[#2a4558] disabled:opacity-50"
            >
              Confirmar e processar
            </button>
          </div>
        </DialogContent>
      </Dialog>

      <SupplierFormModal
        open={formOpen}
        onOpenChange={setFormOpen}
        onSaved={(created) => {
          setSuppliers((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')));
          setSelectedId(created.id);
          setError(null);
        }}
      />
    </>
  );
}
