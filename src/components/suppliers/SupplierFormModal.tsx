'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  createSupplierAction,
  updateSupplierAction,
} from '@/actions/suppliers';
import type { Supplier, SupplierInput } from '@/types';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  supplier?: Supplier | null;
  onSaved: (supplier: Supplier) => void;
}

const emptyForm: SupplierInput = {
  name: '',
  cnpj: '',
  phone: '',
  email: '',
  address: '',
  sales_contact: '',
  payment_terms: '',
  notes: '',
};

export default function SupplierFormModal({
  open,
  onOpenChange,
  supplier,
  onSaved,
}: Props) {
  const [form, setForm] = useState<SupplierInput>(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (supplier) {
      setForm({
        name: supplier.name,
        cnpj: supplier.cnpj ?? '',
        phone: supplier.phone ?? '',
        email: supplier.email ?? '',
        address: supplier.address ?? '',
        sales_contact: supplier.sales_contact ?? '',
        payment_terms: supplier.payment_terms ?? '',
        notes: supplier.notes ?? '',
      });
    } else {
      setForm(emptyForm);
    }
  }, [open, supplier]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const result = supplier
      ? await updateSupplierAction(supplier.id, form)
      : await createSupplierAction(form);

    setSaving(false);
    if (!result.success) {
      setError(result.error);
      return;
    }

    onSaved(result.data);
    onOpenChange(false);
  };

  const field = (
    id: keyof SupplierInput,
    label: string,
    required = false,
    type: 'text' | 'textarea' = 'text'
  ) => (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-gray-700">
        {label}
        {required && <span className="text-red-500"> *</span>}
      </label>
      {type === 'textarea' ? (
        <textarea
          id={id}
          rows={3}
          value={form[id] ?? ''}
          onChange={(e) => setForm((f) => ({ ...f, [id]: e.target.value }))}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#64ABDE] focus:outline-none focus:ring-1 focus:ring-[#64ABDE]"
        />
      ) : (
        <input
          id={id}
          type="text"
          value={form[id] ?? ''}
          onChange={(e) => setForm((f) => ({ ...f, [id]: e.target.value }))}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#64ABDE] focus:outline-none focus:ring-1 focus:ring-[#64ABDE]"
        />
      )}
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{supplier ? 'Editar fornecedor' : 'Novo fornecedor'}</DialogTitle>
          <DialogDescription>
            Cadastro usado ao vincular PDFs de cotação. O nome aparece nas comparações de cenários.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
          {field('name', 'Nome', true)}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {field('cnpj', 'CNPJ')}
            {field('phone', 'Telefone')}
          </div>
          {field('email', 'E-mail')}
          {field('address', 'Endereço')}
          {field('sales_contact', 'Vendedor responsável')}
          {field('payment_terms', 'Prazo de pagamento padrão')}
          {field('notes', 'Observações', false, 'textarea')}

          {error && (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving || !form.name.trim()}
              className="inline-flex items-center gap-2 rounded-lg bg-[#1D3140] px-4 py-2 text-sm font-medium text-white hover:bg-[#2a4558] disabled:opacity-50"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Salvar
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
