"use client";

import { Lock, Plus, Trash2 } from 'lucide-react';
import type { CostItem, RevenueSource } from './types';

interface CostItemsTableProps {
  receitaBruta: number;
  revenueSource: RevenueSource;
  onReceitaBrutaChange: (value: string) => void;
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
  style: 'percent',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function formatPercentOfRevenue(valor: number, receitaBruta: number): string {
  if (receitaBruta <= 0) {
    return '--';
  }

  return percentFormatter.format(valor / receitaBruta);
}

export function CostItemsTable({
  receitaBruta,
  revenueSource,
  onReceitaBrutaChange,
  costItems,
  onAddCostItem,
  onUpdateCostItem,
  onRemoveCostItem,
}: CostItemsTableProps) {
  const isImported = revenueSource === 'budget';
  const totalCustos = costItems.reduce((acc, item) => acc + item.valor, 0);

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-[#1D3140]">Receita e Custos Variáveis</h2>
          <p className="mt-1 text-xs text-gray-500">
            A Receita Bruta é o valor consolidado do orçamento (ou inserida manualmente). Adicione os custos variáveis
            do projeto livremente.
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

      <div className="mt-4 rounded-lg border border-[#64ABDE]/30 bg-[#64ABDE]/5 p-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-[#64ABDE]">Receita Bruta</p>
            <p className="mt-0.5 text-xs text-gray-600">
              {isImported
                ? 'Origem: orçamento importado (somente leitura).'
                : 'Origem: entrada manual.'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {isImported && <Lock className="h-4 w-4 text-gray-400" aria-hidden="true" />}
            <input
              type="number"
              min="0"
              step="0.01"
              value={receitaBruta}
              readOnly={isImported}
              disabled={isImported}
              onChange={(event) => onReceitaBrutaChange(event.target.value)}
              className={`h-10 w-44 rounded-lg border px-3 text-right text-sm font-semibold outline-none transition focus:border-[#64ABDE]/80 focus:ring-2 focus:ring-[#64ABDE]/20 ${
                isImported
                  ? 'cursor-not-allowed border-gray-200 bg-gray-100 text-gray-700'
                  : 'border-gray-200 bg-white text-[#1D3140]'
              }`}
              aria-label="Receita Bruta (R$)"
            />
          </div>
        </div>
        <p className="mt-2 text-right text-xs text-gray-600">
          {currencyFormatter.format(receitaBruta)}
        </p>
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-left text-xs uppercase tracking-wide text-gray-500">
              <th className="py-2 pr-3">Descrição</th>
              <th className="py-2 pr-3">Valor (R$)</th>
              <th className="py-2 pr-3">% da Receita</th>
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
                  {formatPercentOfRevenue(item.valor, receitaBruta)}
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
                  Adicione custos variáveis (mão de obra, diária, alimentação, etc.) para compor a Margem de Contribuição.
                </td>
              </tr>
            )}
          </tbody>
          {costItems.length > 0 && (
            <tfoot>
              <tr className="bg-gray-50 text-sm font-semibold text-[#1D3140]">
                <td className="py-2 pr-3 text-right">Total</td>
                <td className="py-2 pr-3 text-right">{currencyFormatter.format(totalCustos)}</td>
                <td className="py-2 pr-3">{formatPercentOfRevenue(totalCustos, receitaBruta)}</td>
                <td />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
