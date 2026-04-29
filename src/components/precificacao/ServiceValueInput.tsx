"use client";

import { AlertTriangle } from 'lucide-react';
import type { PricingInputMode } from './types';

interface ServiceValueInputProps {
  totalCustos: number;
  valorServico: number;
  lucroPercent: number;
  inputMode: PricingInputMode;
  onValorServicoChange: (value: string) => void;
  onLucroPercentChange: (value: string) => void;
}

const currencyFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

const percentFormatter = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function ServiceValueInput({
  totalCustos,
  valorServico,
  lucroPercent,
  inputMode,
  onValorServicoChange,
  onLucroPercentChange,
}: ServiceValueInputProps) {
  const lucroBruto = valorServico - totalCustos;
  const lucroBrutoPercent = valorServico > 0 ? (lucroBruto / valorServico) * 100 : 0;
  const isLucroInvalido = lucroPercent >= 100;
  const isLucroNegativo = lucroBruto < 0;
  const custosExcedemServico = totalCustos > valorServico && valorServico > 0;

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <h2 className="text-sm font-semibold text-[#1D3140]">Valor do Serviço</h2>
      <p className="mt-1 text-xs text-gray-500">
        Digite o valor do serviço diretamente ou informe o percentual de lucro desejado para calcular automaticamente.
      </p>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div className="space-y-1">
          <label htmlFor="valor-servico" className="text-xs font-medium text-gray-700">
            Valor do Serviço (R$)
          </label>
          <input
            id="valor-servico"
            type="number"
            min="0"
            step="0.01"
            value={valorServico}
            onChange={(event) => onValorServicoChange(event.target.value)}
            className={`h-10 w-full rounded-lg border px-3 text-sm outline-none transition focus:ring-2 ${
              inputMode === 'valor'
                ? 'border-[#64ABDE] bg-white text-[#1D3140] focus:border-[#64ABDE]/80 focus:ring-[#64ABDE]/20'
                : 'border-gray-200 bg-gray-50 text-gray-700 focus:border-gray-300 focus:ring-gray-200'
            }`}
          />
          <p className="text-[10px] text-gray-400">
            {inputMode === 'valor' ? 'Entrada ativa' : 'Calculado pelo lucro'}
          </p>
        </div>

        <div className="space-y-1">
          <label htmlFor="lucro-percent" className="text-xs font-medium text-gray-700">
            Lucro desejado (%)
          </label>
          <input
            id="lucro-percent"
            type="number"
            min="0"
            max="99.99"
            step="0.01"
            value={lucroPercent}
            onChange={(event) => onLucroPercentChange(event.target.value)}
            className={`h-10 w-full rounded-lg border px-3 text-sm outline-none transition focus:ring-2 ${
              inputMode === 'lucro'
                ? 'border-[#64ABDE] bg-white text-[#1D3140] focus:border-[#64ABDE]/80 focus:ring-[#64ABDE]/20'
                : 'border-gray-200 bg-gray-50 text-gray-700 focus:border-gray-300 focus:ring-gray-200'
            } ${isLucroInvalido ? 'border-red-300 bg-red-50' : ''}`}
          />
          <p className="text-[10px] text-gray-400">
            {inputMode === 'lucro' ? 'Entrada ativa' : 'Calculado pelo valor'}
          </p>
        </div>
      </div>

      {isLucroInvalido && (
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <span>
            Percentual de lucro inválido. O lucro deve ser menor que 100% para calcular o valor do serviço.
          </span>
        </div>
      )}

      {custosExcedemServico && !isLucroInvalido && (
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <span>
            Atenção: os custos do serviço ({currencyFormatter.format(totalCustos)}) excedem o valor do serviço.
            O lucro será negativo.
          </span>
        </div>
      )}

      <div className="mt-4 rounded-lg bg-[#1D3140]/5 px-3 py-2">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-sm">
          <span className="text-gray-600">Custos do serviço:</span>
          <span className="font-medium text-[#1D3140]">{currencyFormatter.format(totalCustos)}</span>
        </div>
        <div className="mt-1 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-sm">
          <span className="text-gray-600">Lucro bruto:</span>
          <span className={`font-semibold ${isLucroNegativo ? 'text-red-600' : 'text-emerald-600'}`}>
            {currencyFormatter.format(lucroBruto)}{' '}
            <span className="text-xs font-normal">
              ({valorServico > 0 ? `${percentFormatter.format(lucroBrutoPercent)}%` : '--'})
            </span>
          </span>
        </div>
      </div>
    </div>
  );
}
