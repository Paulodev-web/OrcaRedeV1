"use client";

import { Plus, Trash2 } from 'lucide-react';
import type { CostItem } from './types';

interface CostItemsTableProps {
  valorServico: number;
  costItems: CostItem[];
  onAddCostItem: () => void;
  onUpdateCostItem: (id: string, field: 'descricao' | 'valor', value: string) => void;
  onRemoveCostItem: (id: string) => void;
}

const currencyFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

const percentFormatter = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function formatPercentOfVS(valor: number, valorServico: number): string {
  if (valorServico <= 0) {
    return '--';
  }

  return `${percentFormatter.format((valor / valorServico) * 100)}%`;
}

export function CostItemsTable({
  valorServico,
  costItems,
  onAddCostItem,
  onUpdateCostItem,
  onRemoveCostItem,
}: CostItemsTableProps) {
  const totalCustos = costItems.reduce((acc, item) => acc + item.valor, 0);

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-[#1D3140]">Custos do Serviço</h2>
          <p className="mt-1 text-xs text-gray-500">
            Adicione os custos variáveis do serviço: mão de obra, diárias, alimentação, hospedagem, etc.
          </p>
        </div>
        <button
          type="button"
          onClick={onAddCostItem}
          className="inline-flex items-center gap-2 rounded-lg bg-[#64ABDE] px-3 py-2 text-xs font-semibold text-white hover:brightness-95"
        >
          <Plus className="h-4 w-4" />
          Adicionar custo
        </button>
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-left text-xs uppercase tracking-wide text-gray-500">
              <th className="py-2 pr-3">Descrição</th>
              <th className="py-2 pr-3">Valor (R$)</th>
              <th className="py-2 pr-3">% do VS</th>
              <th className="py-2">Ações</th>
            </tr>
          </thead>
          <tbody>
            {costItems.map((item) => (
              <tr key={item.id} className="border-b border-gray-100 align-top">
                <td className="py-2 pr-3">
                  <input
                    type="text"
                    value={item.descricao}
                    onChange={(event) => onUpdateCostItem(item.id, 'descricao', event.target.value)}
                    placeholder="Ex: Mão de obra, Diária, Alimentação..."
                    className="h-10 w-full rounded-lg border border-gray-200 px-3 text-sm text-gray-800 outline-none transition focus:border-[#64ABDE]/80 focus:ring-2 focus:ring-[#64ABDE]/20"
                  />
                </td>
                <td className="py-2 pr-3">
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={item.valor}
                    onChange={(event) => onUpdateCostItem(item.id, 'valor', event.target.value)}
                    className="h-10 w-32 rounded-lg border border-gray-200 px-3 text-right text-sm text-gray-800 outline-none transition focus:border-[#64ABDE]/80 focus:ring-2 focus:ring-[#64ABDE]/20"
                  />
                </td>
                <td className="py-2 pr-3 text-sm font-medium text-[#1D3140]">
                  {formatPercentOfVS(item.valor, valorServico)}
                </td>
                <td className="py-2">
                  <button
                    type="button"
                    onClick={() => onRemoveCostItem(item.id)}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-md text-gray-500 transition hover:bg-red-50 hover:text-red-600"
                    aria-label="Remover custo"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}
            {costItems.length === 0 && (
              <tr>
                <td colSpan={4} className="py-8 text-center text-sm text-gray-500">
                  Adicione custos do serviço (mão de obra, diária, alimentação, etc.) para calcular o lucro.
                </td>
              </tr>
            )}
          </tbody>
          {costItems.length > 0 && (
            <tfoot>
              <tr className="bg-gray-50 text-sm font-semibold text-[#1D3140]">
                <td className="py-2 pr-3 text-right">Total</td>
                <td className="py-2 pr-3 text-right">{currencyFormatter.format(totalCustos)}</td>
                <td className="py-2 pr-3">{formatPercentOfVS(totalCustos, valorServico)}</td>
                <td />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
