"use client";

import { Plus, Trash2 } from 'lucide-react';
import { DecimalInput } from './DecimalInput';
import type { CostItem, CostItemTipo, CostItemWithPercent, PercentualBase } from './types';

interface CostItemsTableProps {
  valorServico: number;
  costItems: CostItemWithPercent[];
  onAddCostItem: () => void;
  onUpdateCostItem: (id: string, patch: Partial<CostItem>) => void;
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

const TIPO_OPTIONS: Array<{ value: CostItemTipo; label: string }> = [
  { value: 'unitario', label: 'Qtd. × Valor' },
  { value: 'maoDeObra', label: 'Mão de obra (pessoas × dias)' },
  { value: 'percentual', label: 'Percentual (%)' },
];

const numberInputClass =
  'h-10 rounded-lg border border-gray-200 px-2 text-right text-sm text-gray-800 outline-none transition focus:border-[#64ABDE]/80 focus:ring-2 focus:ring-[#64ABDE]/20';

function formatPercentOfVS(valor: number, valorServico: number): string {
  if (valorServico <= 0) {
    return '--';
  }

  return `${percentFormatter.format((valor / valorServico) * 100)}%`;
}

function CostItemFields({
  item,
  onUpdate,
}: {
  item: CostItemWithPercent;
  onUpdate: (patch: Partial<CostItem>) => void;
}) {
  if (item.tipo === 'maoDeObra') {
    return (
      <div className="flex flex-wrap items-center gap-1.5">
        <DecimalInput
          value={item.pessoas}
          onValueChange={(pessoas) => onUpdate({ pessoas })}
          placeholder="3"
          aria-label="Pessoas"
          className={`${numberInputClass} w-16`}
        />
        <span className="text-xs text-gray-500">pessoas ×</span>
        <DecimalInput
          value={item.dias}
          onValueChange={(dias) => onUpdate({ dias })}
          placeholder="4"
          aria-label="Dias"
          className={`${numberInputClass} w-16`}
        />
        <span className="text-xs text-gray-500">dias ×</span>
        <DecimalInput
          value={item.valorUnitario}
          onValueChange={(valorUnitario) => onUpdate({ valorUnitario })}
          placeholder="70"
          aria-label="Valor por pessoa/dia (R$)"
          className={`${numberInputClass} w-24`}
        />
        <span className="text-xs text-gray-500">R$/pessoa/dia</span>
      </div>
    );
  }

  if (item.tipo === 'percentual') {
    return (
      <div className="flex flex-wrap items-center gap-1.5">
        <DecimalInput
          value={item.percentual}
          onValueChange={(percentual) => onUpdate({ percentual })}
          placeholder="3"
          aria-label="Percentual (%)"
          className={`${numberInputClass} w-20`}
        />
        <span className="text-xs text-gray-500">% de</span>
        <select
          value={item.percentualBase}
          onChange={(event) => onUpdate({ percentualBase: event.target.value as PercentualBase })}
          aria-label="Base do percentual"
          className="h-10 rounded-lg border border-gray-200 bg-white px-2 text-sm text-gray-800 outline-none transition focus:border-[#64ABDE]/80 focus:ring-2 focus:ring-[#64ABDE]/20"
        >
          <option value="total">Total ao cliente (materiais + serviço)</option>
          <option value="servico">Valor do serviço</option>
        </select>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <DecimalInput
        value={item.unidade}
        onValueChange={(unidade) => onUpdate({ unidade })}
        placeholder="10"
        aria-label="Quantidade"
        className={`${numberInputClass} w-20`}
      />
      <span className="text-xs text-gray-500">×</span>
      <DecimalInput
        value={item.valorUnitario}
        onValueChange={(valorUnitario) => onUpdate({ valorUnitario })}
        placeholder="50"
        aria-label="Valor por unidade (R$)"
        className={`${numberInputClass} w-24`}
      />
      <span className="text-xs text-gray-500">R$/unid.</span>
    </div>
  );
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
            Adicione os custos do serviço. Escolha o tipo: quantidade × valor, mão de obra (pessoas × dias ×
            diária) ou percentual (ex.: comissão de vendedor sobre o total).
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
              <th className="py-2 pr-3">Tipo</th>
              <th className="py-2 pr-3">Cálculo</th>
              <th className="py-2 pr-3 text-right">Total (R$)</th>
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
                    onChange={(event) => onUpdateCostItem(item.id, { descricao: event.target.value })}
                    placeholder="Ex: Mão de obra, Comissão, Alimentação..."
                    className="h-10 w-full min-w-[140px] rounded-lg border border-gray-200 px-3 text-sm text-gray-800 outline-none transition focus:border-[#64ABDE]/80 focus:ring-2 focus:ring-[#64ABDE]/20"
                  />
                </td>
                <td className="py-2 pr-3">
                  <select
                    value={item.tipo}
                    onChange={(event) => onUpdateCostItem(item.id, { tipo: event.target.value as CostItemTipo })}
                    aria-label="Tipo de custo"
                    className="h-10 w-full min-w-[150px] rounded-lg border border-gray-200 bg-white px-2 text-sm text-gray-800 outline-none transition focus:border-[#64ABDE]/80 focus:ring-2 focus:ring-[#64ABDE]/20"
                  >
                    {TIPO_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="py-2 pr-3">
                  <CostItemFields item={item} onUpdate={(patch) => onUpdateCostItem(item.id, patch)} />
                </td>
                <td className="py-2 pr-3 text-right text-sm font-medium text-[#1D3140]">
                  {currencyFormatter.format(item.valor)}
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
                <td colSpan={6} className="py-8 text-center text-sm text-gray-500">
                  Adicione custos do serviço (mão de obra, comissão, alimentação, etc.) para ver quanto sobra da
                  verba da obra.
                </td>
              </tr>
            )}
          </tbody>
          {costItems.length > 0 && (
            <tfoot>
              <tr className="bg-gray-50 text-sm font-semibold text-[#1D3140]">
                <td className="py-2 pr-3 text-right" colSpan={3}>
                  Total
                </td>
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
