'use client';

import { useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { createPurchaseOrderAction, type CreatePurchaseOrderItemInput } from '@/actions/purchaseOrders';

const formatCurrency = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

export interface PurchaseOrderCandidateItem {
  materialId: string;
  materialName: string;
  materialCode: string;
  materialUnit: string;
  quantidade: number;
  /** Preço unitário sugerido (do vencedor no Cenário Ideal). */
  suggestedUnitPrice: number;
  supplierName: string;
  supplierId: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sessionId: string;
  items: PurchaseOrderCandidateItem[];
  onCreated: () => void | Promise<void>;
}

export default function CreatePurchaseOrderModal({
  open,
  onOpenChange,
  sessionId,
  items,
  onCreated,
}: Props) {
  const [ocNumber, setOcNumber] = useState('');
  const [supplierName, setSupplierName] = useState('');
  const [freightValue, setFreightValue] = useState('');
  const [freightType, setFreightType] = useState<'cif' | 'fob' | ''>('');
  const [deliveryDate, setDeliveryDate] = useState('');
  const [notes, setNotes] = useState('');
  const [unitPrices, setUnitPrices] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const singleSupplierId = useMemo(() => {
    const ids = new Set(items.map((i) => i.supplierId ?? ''));
    return ids.size === 1 ? items[0]?.supplierId ?? null : null;
  }, [items]);

  const [lastOpen, setLastOpen] = useState(false);
  if (open && !lastOpen) {
    setLastOpen(true);
    setOcNumber('');
    setFreightValue('');
    setFreightType('');
    setDeliveryDate('');
    setNotes('');
    setError(null);

    const names = new Set(items.map((i) => i.supplierName));
    setSupplierName(names.size === 1 ? items[0]?.supplierName ?? '' : '');

    const initialPrices: Record<string, string> = {};
    for (const item of items) {
      initialPrices[item.materialId] = item.suggestedUnitPrice
        ? item.suggestedUnitPrice.toFixed(2)
        : '';
    }
    setUnitPrices(initialPrices);
  } else if (!open && lastOpen) {
    setLastOpen(false);
  }

  const total = items.reduce((sum, item) => {
    const price = parseFloat((unitPrices[item.materialId] ?? '0').replace(',', '.'));
    if (Number.isNaN(price)) return sum;
    return sum + price * item.quantidade;
  }, 0);

  const handleSave = async () => {
    if (!ocNumber.trim()) {
      setError('Informe o número da OC.');
      return;
    }
    if (!supplierName.trim()) {
      setError('Informe o fornecedor.');
      return;
    }

    const parsedItems: CreatePurchaseOrderItemInput[] = [];
    for (const item of items) {
      const raw = unitPrices[item.materialId] ?? '';
      const price = parseFloat(raw.replace(',', '.'));
      if (Number.isNaN(price) || price < 0) {
        setError(`Preço inválido para ${item.materialName}.`);
        return;
      }
      parsedItems.push({ materialId: item.materialId, quantidade: item.quantidade, precoUnit: price });
    }

    const freightParsed = freightValue.trim() === '' ? null : parseFloat(freightValue.replace(',', '.'));
    if (freightParsed !== null && Number.isNaN(freightParsed)) {
      setError('Valor de frete inválido.');
      return;
    }

    setSaving(true);
    setError(null);
    const res = await createPurchaseOrderAction({
      sessionId,
      ocNumber,
      supplierName,
      supplierId: singleSupplierId,
      freightValue: freightParsed,
      freightType: freightType || null,
      deliveryDate: deliveryDate || null,
      notes: notes.trim() || null,
      items: parsedItems,
    });
    setSaving(false);

    if (!res.success) {
      setError(res.error);
      return;
    }

    await onCreated();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Criar OC</DialogTitle>
          <DialogDescription>
            {items.length} material(is) selecionado(s) entram nesta mesma ordem de compra.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="block text-sm font-medium text-gray-700">
              Número da OC
              <input
                type="text"
                value={ocNumber}
                onChange={(e) => setOcNumber(e.target.value)}
                placeholder="Ex.: 596"
                className="mt-1.5 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500"
              />
            </label>
            <label className="block text-sm font-medium text-gray-700">
              Fornecedor
              <input
                type="text"
                value={supplierName}
                onChange={(e) => setSupplierName(e.target.value)}
                placeholder="Nome do fornecedor"
                className="mt-1.5 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500"
              />
            </label>
            <label className="block text-sm font-medium text-gray-700">
              Frete
              <input
                type="number"
                min={0}
                step="any"
                value={freightValue}
                onChange={(e) => setFreightValue(e.target.value)}
                placeholder="0,00"
                className="mt-1.5 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500"
              />
            </label>
            <label className="block text-sm font-medium text-gray-700">
              Tipo de frete
              <select
                value={freightType}
                onChange={(e) => setFreightType(e.target.value as 'cif' | 'fob' | '')}
                className="mt-1.5 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500"
              >
                <option value="">Não informado</option>
                <option value="cif">CIF (incluso no material)</option>
                <option value="fob">FOB (à parte)</option>
              </select>
            </label>
            <label className="block text-sm font-medium text-gray-700 sm:col-span-2">
              Data de entrega
              <input
                type="date"
                value={deliveryDate}
                onChange={(e) => setDeliveryDate(e.target.value)}
                className="mt-1.5 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500 sm:max-w-[calc(50%-0.5rem)]"
              />
            </label>
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
              Materiais desta OC
            </p>
            <div className="max-h-64 overflow-y-auto rounded-lg border border-gray-200">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="sticky top-0 bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Material</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase w-24">Qtd.</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase w-32">
                      Preço unit.
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-surface">
                  {items.map((item) => (
                    <tr key={item.materialId}>
                      <td className="px-3 py-2.5">
                        <p className="font-medium text-neutral-900">{item.materialName}</p>
                        <p className="text-xs text-gray-400">{item.materialCode}</p>
                      </td>
                      <td className="px-3 py-2.5 text-right text-gray-600">
                        {item.quantidade.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}
                        {item.materialUnit ? ` ${item.materialUnit}` : ''}
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <input
                          type="number"
                          min={0}
                          step="any"
                          value={unitPrices[item.materialId] ?? ''}
                          onChange={(e) =>
                            setUnitPrices((prev) => ({ ...prev, [item.materialId]: e.target.value }))
                          }
                          className="w-28 rounded border border-gray-300 px-2 py-1.5 text-right text-sm focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-right text-sm text-gray-600">
              Total: <span className="font-bold text-neutral-900">{formatCurrency(total)}</span>
            </p>
          </div>

          {error && (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
          )}
        </div>

        <DialogFooter>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            disabled={saving}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving || items.length === 0}
            className="inline-flex items-center gap-2 rounded-lg bg-accent-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-700 disabled:opacity-50"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Criar OC
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
