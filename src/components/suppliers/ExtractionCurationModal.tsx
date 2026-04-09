'use client';

import { useEffect, useState, useTransition } from 'react';
import { CheckCircle2, Loader2, Pencil, Save, X } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  getQuoteWithItemsAction,
  validateExtractionAction,
  updateExtractionItemAction,
} from '@/actions/supplierQuotes';
import type { SupplierQuoteItemWithMaterial } from '@/actions/supplierQuotes';

const fmt = (v: number) =>
  new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);

const fmtCurrency = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

interface Props {
  quoteId: string;
  supplierName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onValidated?: () => void;
}

interface EditingState {
  descricao: string;
  unidade: string;
  quantidade: string;
  preco_unit: string;
  total_item: string;
}

export default function ExtractionCurationModal({
  quoteId,
  supplierName,
  open,
  onOpenChange,
  onValidated,
}: Props) {
  const [items, setItems] = useState<SupplierQuoteItemWithMaterial[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editState, setEditState] = useState<EditingState | null>(null);
  const [isSaving, startSaving] = useTransition();
  const [isValidating, startValidating] = useTransition();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setError(null);
    void getQuoteWithItemsAction(quoteId).then((res) => {
      setLoading(false);
      if (res.success) {
        setItems(res.data.items);
      } else {
        setError(res.error);
      }
    });
  }, [open, quoteId]);

  const startEditing = (item: SupplierQuoteItemWithMaterial) => {
    setEditingId(item.id);
    setEditState({
      descricao: item.descricao,
      unidade: item.unidade,
      quantidade: String(item.quantidade),
      preco_unit: String(item.preco_unit),
      total_item: String(item.total_item),
    });
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditState(null);
  };

  const saveEditing = () => {
    if (!editingId || !editState) return;
    startSaving(async () => {
      const res = await updateExtractionItemAction({
        itemId: editingId,
        descricao: editState.descricao,
        unidade: editState.unidade,
        quantidade: parseFloat(editState.quantidade) || 0,
        preco_unit: parseFloat(editState.preco_unit) || 0,
        total_item: parseFloat(editState.total_item) || 0,
      });
      if (res.success) {
        setItems((prev) =>
          prev.map((it) =>
            it.id === editingId
              ? {
                  ...it,
                  descricao: editState.descricao,
                  unidade: editState.unidade,
                  quantidade: parseFloat(editState.quantidade) || 0,
                  preco_unit: parseFloat(editState.preco_unit) || 0,
                  total_item: parseFloat(editState.total_item) || 0,
                }
              : it,
          ),
        );
        cancelEditing();
      }
    });
  };

  const handleValidate = () => {
    startValidating(async () => {
      const res = await validateExtractionAction(quoteId);
      if (res.success) {
        onValidated?.();
        onOpenChange(false);
      }
    });
  };

  const totalGeral = items.reduce((sum, it) => sum + it.total_item, 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Curadoria de extração — {supplierName}</DialogTitle>
          <DialogDescription>
            Revise os itens extraídos do PDF. Edite se necessário e valide a extração.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-auto px-6 py-4">
          {loading && (
            <div className="flex items-center justify-center py-12 text-gray-500">
              <Loader2 className="h-5 w-5 animate-spin mr-2" />
              Carregando itens…
            </div>
          )}

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {error}
            </div>
          )}

          {!loading && !error && items.length === 0 && (
            <p className="py-8 text-center text-sm text-gray-500">Nenhum item extraído.</p>
          )}

          {!loading && items.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-left text-xs font-medium uppercase text-gray-500">
                    <th className="px-3 py-2 w-8">#</th>
                    <th className="px-3 py-2">Descrição</th>
                    <th className="px-3 py-2 w-20">Unid.</th>
                    <th className="px-3 py-2 w-24 text-right">Qtd</th>
                    <th className="px-3 py-2 w-28 text-right">Preço Unit.</th>
                    <th className="px-3 py-2 w-28 text-right">Total</th>
                    <th className="px-3 py-2 w-16" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {items.map((item, idx) => {
                    const isEditing = editingId === item.id;
                    return (
                      <tr key={item.id} className={item.alerta ? 'bg-amber-50/50' : ''}>
                        <td className="px-3 py-2 text-gray-400">{idx + 1}</td>
                        <td className="px-3 py-2">
                          {isEditing ? (
                            <input
                              className="w-full rounded border border-gray-300 px-2 py-1 text-sm focus:border-[#64ABDE] focus:outline-none"
                              value={editState!.descricao}
                              onChange={(e) =>
                                setEditState((s) => (s ? { ...s, descricao: e.target.value } : s))
                              }
                            />
                          ) : (
                            <span className="text-gray-800">{item.descricao}</span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          {isEditing ? (
                            <input
                              className="w-full rounded border border-gray-300 px-2 py-1 text-sm focus:border-[#64ABDE] focus:outline-none"
                              value={editState!.unidade}
                              onChange={(e) =>
                                setEditState((s) => (s ? { ...s, unidade: e.target.value } : s))
                              }
                            />
                          ) : (
                            <span className="text-gray-600">{item.unidade}</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right">
                          {isEditing ? (
                            <input
                              type="number"
                              className="w-full rounded border border-gray-300 px-2 py-1 text-right text-sm focus:border-[#64ABDE] focus:outline-none"
                              value={editState!.quantidade}
                              onChange={(e) =>
                                setEditState((s) => (s ? { ...s, quantidade: e.target.value } : s))
                              }
                            />
                          ) : (
                            <span className="text-gray-700">{fmt(item.quantidade)}</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right">
                          {isEditing ? (
                            <input
                              type="number"
                              step="0.01"
                              className="w-full rounded border border-gray-300 px-2 py-1 text-right text-sm focus:border-[#64ABDE] focus:outline-none"
                              value={editState!.preco_unit}
                              onChange={(e) =>
                                setEditState((s) => (s ? { ...s, preco_unit: e.target.value } : s))
                              }
                            />
                          ) : (
                            <span className="text-gray-700">{fmtCurrency(item.preco_unit)}</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right">
                          {isEditing ? (
                            <input
                              type="number"
                              step="0.01"
                              className="w-full rounded border border-gray-300 px-2 py-1 text-right text-sm focus:border-[#64ABDE] focus:outline-none"
                              value={editState!.total_item}
                              onChange={(e) =>
                                setEditState((s) => (s ? { ...s, total_item: e.target.value } : s))
                              }
                            />
                          ) : (
                            <span className={item.alerta ? 'text-amber-700 font-medium' : 'text-gray-700'}>
                              {fmtCurrency(item.total_item)}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          {isEditing ? (
                            <div className="flex gap-1">
                              <button
                                type="button"
                                onClick={saveEditing}
                                disabled={isSaving}
                                className="rounded p-1 text-green-600 hover:bg-green-50"
                              >
                                {isSaving ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Save className="h-4 w-4" />
                                )}
                              </button>
                              <button
                                type="button"
                                onClick={cancelEditing}
                                className="rounded p-1 text-gray-400 hover:bg-gray-100"
                              >
                                <X className="h-4 w-4" />
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => startEditing(item)}
                              className="rounded p-1 text-gray-400 hover:text-[#64ABDE] hover:bg-blue-50"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t border-gray-200 font-medium">
                    <td colSpan={5} className="px-3 py-2 text-right text-gray-700">
                      Total geral
                    </td>
                    <td className="px-3 py-2 text-right text-[#1D3140]">{fmtCurrency(totalGeral)}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>

        <DialogFooter>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Fechar
          </button>
          <button
            type="button"
            onClick={handleValidate}
            disabled={isValidating || loading || items.length === 0}
            className="inline-flex items-center gap-2 rounded-lg bg-[#64ABDE] px-5 py-2 text-sm font-medium text-white shadow-sm hover:bg-[#5596c5] disabled:opacity-50 transition-colors"
          >
            {isValidating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle2 className="h-4 w-4" />
            )}
            Validar Extração
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
