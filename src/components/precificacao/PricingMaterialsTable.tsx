"use client";

import { Plus, Trash2 } from 'lucide-react';
import type { PricingMaterialLine } from './types';

interface PricingMaterialsTableProps {
  budgetItems: PricingMaterialLine[];
  manualItems: PricingMaterialLine[];
  onUpdateItem: (source: 'budget' | 'manual', id: string, field: keyof Omit<PricingMaterialLine, 'id' | 'source'>, value: string) => void;
  onAddManualItem: () => void;
  onRemoveManualItem: (id: string) => void;
}

const currencyFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

export function PricingMaterialsTable({
  budgetItems,
  manualItems,
  onUpdateItem,
  onAddManualItem,
  onRemoveManualItem,
}: PricingMaterialsTableProps) {
  const allItems = [...budgetItems, ...manualItems];

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-[#1D3140]">Materiais e Serviços</h2>
          <p className="mt-1 text-xs text-gray-500">
            Ajuste itens importados e adicione linhas manuais para compor o custo direto.
          </p>
        </div>
        <button
          type="button"
          onClick={onAddManualItem}
          className="inline-flex items-center gap-2 rounded-lg bg-[#64ABDE] px-3 py-2 text-xs font-semibold text-white hover:brightness-95"
        >
          <Plus className="h-4 w-4" />
          Adicionar item
        </button>
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-left text-xs uppercase tracking-wide text-gray-500">
              <th className="py-2 pr-3">Descrição</th>
              <th className="py-2 pr-3">Qtd</th>
              <th className="py-2 pr-3">UN</th>
              <th className="py-2 pr-3">V. Unitário</th>
              <th className="py-2 pr-3">Subtotal</th>
              <th className="py-2">Ações</th>
            </tr>
          </thead>
          <tbody>
            {allItems.map((item) => {
              const subtotal = item.quantity * item.unitPrice;
              return (
                <tr key={`${item.source}-${item.id}`} className="border-b border-gray-100 align-top">
                  <td className="py-2 pr-3">
                    <input
                      type="text"
                      value={item.description}
                      onChange={(event) => onUpdateItem(item.source, item.id, 'description', event.target.value)}
                      className="h-10 w-full rounded-lg border border-gray-200 px-3 text-sm text-gray-800 outline-none transition focus:border-[#64ABDE]/80 focus:ring-2 focus:ring-[#64ABDE]/20"
                      placeholder="Descrição do item"
                    />
                    <span className="mt-1 inline-flex rounded-md bg-gray-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-gray-600">
                      {item.source === 'budget' ? 'Importado' : 'Manual'}
                    </span>
                  </td>
                  <td className="py-2 pr-3">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={item.quantity}
                      onChange={(event) => onUpdateItem(item.source, item.id, 'quantity', event.target.value)}
                      className="h-10 w-24 rounded-lg border border-gray-200 px-3 text-sm text-gray-800 outline-none transition focus:border-[#64ABDE]/80 focus:ring-2 focus:ring-[#64ABDE]/20"
                    />
                  </td>
                  <td className="py-2 pr-3">
                    <input
                      type="text"
                      value={item.unit}
                      onChange={(event) => onUpdateItem(item.source, item.id, 'unit', event.target.value)}
                      className="h-10 w-20 rounded-lg border border-gray-200 px-3 text-sm uppercase text-gray-800 outline-none transition focus:border-[#64ABDE]/80 focus:ring-2 focus:ring-[#64ABDE]/20"
                    />
                  </td>
                  <td className="py-2 pr-3">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={item.unitPrice}
                      onChange={(event) => onUpdateItem(item.source, item.id, 'unitPrice', event.target.value)}
                      className="h-10 w-32 rounded-lg border border-gray-200 px-3 text-sm text-gray-800 outline-none transition focus:border-[#64ABDE]/80 focus:ring-2 focus:ring-[#64ABDE]/20"
                    />
                  </td>
                  <td className="py-2 pr-3 text-sm font-semibold text-[#1D3140]">
                    {currencyFormatter.format(subtotal)}
                  </td>
                  <td className="py-2">
                    {item.source === 'manual' ? (
                      <button
                        type="button"
                        onClick={() => onRemoveManualItem(item.id)}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-md text-gray-500 transition hover:bg-red-50 hover:text-red-600"
                        aria-label="Remover item manual"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    ) : (
                      <span className="text-xs text-gray-400">-</span>
                    )}
                  </td>
                </tr>
              );
            })}
            {allItems.length === 0 && (
              <tr>
                <td colSpan={6} className="py-8 text-center text-sm text-gray-500">
                  Selecione um orçamento ou adicione itens manuais para começar.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
