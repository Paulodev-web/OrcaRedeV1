"use client";

import { AlertTriangle, Package } from 'lucide-react';
import { DecimalInput } from './DecimalInput';
import type { PricingInputMode } from './types';

interface ServiceValueInputProps {
  valorMateriais: number;
  totalCustos: number;
  valorServico: number;
  percentMateriais: number;
  inputMode: PricingInputMode;
  onValorServicoChange: (value: number) => void;
  onPercentMateriaisChange: (value: number) => void;
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
  valorMateriais,
  totalCustos,
  valorServico,
  percentMateriais,
  inputMode,
  onValorServicoChange,
  onPercentMateriaisChange,
}: ServiceValueInputProps) {
  const hasMateriais = valorMateriais > 0;
  const totalCliente = valorMateriais + valorServico;
  const sobraAposCustos = valorServico - totalCustos;
  const sobraNegativa = sobraAposCustos < 0;
  const semBaseParaPercent = !hasMateriais && inputMode === 'percentual';

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <h2 className="text-sm font-semibold text-[#1D3140]">Valor do Serviço</h2>
      <p className="mt-1 text-xs text-gray-500">
        Defina o percentual sobre o total dos materiais para calcular o valor do serviço, ou digite o valor
        diretamente para descobrir o percentual.
      </p>

      <div className="mt-3 flex items-center justify-between gap-3 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
        <span className="inline-flex items-center gap-2 text-xs text-gray-600">
          <Package className="h-4 w-4 text-gray-400" />
          Total dos materiais importados
        </span>
        <span className="text-sm font-semibold text-[#1D3140]">
          {hasMateriais ? currencyFormatter.format(valorMateriais) : 'Nenhum orçamento importado'}
        </span>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div className="space-y-1">
          <label htmlFor="percent-materiais" className="text-xs font-medium text-gray-700">
            % sobre os materiais
          </label>
          <DecimalInput
            id="percent-materiais"
            value={percentMateriais}
            onValueChange={onPercentMateriaisChange}
            placeholder="Ex: 40"
            className={`h-10 w-full rounded-lg border px-3 text-sm outline-none transition focus:ring-2 ${
              inputMode === 'percentual'
                ? 'border-[#64ABDE] bg-white text-[#1D3140] focus:border-[#64ABDE]/80 focus:ring-[#64ABDE]/20'
                : 'border-gray-200 bg-gray-50 text-gray-700 focus:border-gray-300 focus:ring-gray-200'
            }`}
          />
          <p className="text-[10px] text-gray-400">
            {inputMode === 'percentual' ? 'Entrada ativa' : 'Calculado pelo valor'}
          </p>
        </div>

        <div className="space-y-1">
          <label htmlFor="valor-servico" className="text-xs font-medium text-gray-700">
            Valor do Serviço (R$)
          </label>
          <DecimalInput
            id="valor-servico"
            value={valorServico}
            onValueChange={onValorServicoChange}
            className={`h-10 w-full rounded-lg border px-3 text-sm outline-none transition focus:ring-2 ${
              inputMode === 'valor'
                ? 'border-[#64ABDE] bg-white text-[#1D3140] focus:border-[#64ABDE]/80 focus:ring-[#64ABDE]/20'
                : 'border-gray-200 bg-gray-50 text-gray-700 focus:border-gray-300 focus:ring-gray-200'
            }`}
          />
          <p className="text-[10px] text-gray-400">
            {inputMode === 'valor' ? 'Entrada ativa' : 'Calculado pelo percentual'}
          </p>
        </div>
      </div>

      {semBaseParaPercent && (
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <span>
            Importe um orçamento para calcular o serviço pelo percentual, ou digite o valor do serviço
            diretamente.
          </span>
        </div>
      )}

      <div className="mt-4 rounded-lg bg-[#1D3140]/5 px-3 py-2">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-sm">
          <span className="text-gray-600">Total ao cliente (materiais + serviço):</span>
          <span className="font-semibold text-[#1D3140]">{currencyFormatter.format(totalCliente)}</span>
        </div>
        <div className="mt-1 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-sm">
          <span className="text-gray-600">Verba para executar a obra (serviço):</span>
          <span className="font-medium text-[#1D3140]">
            {currencyFormatter.format(valorServico)}{' '}
            <span className="text-xs font-normal text-gray-500">
              ({hasMateriais ? `${percentFormatter.format(percentMateriais)}% dos materiais` : '--'})
            </span>
          </span>
        </div>
        <div className="mt-1 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-sm">
          <span className="text-gray-600">Sobra após custos do serviço:</span>
          <span className={`font-semibold ${sobraNegativa ? 'text-red-600' : 'text-emerald-600'}`}>
            {currencyFormatter.format(sobraAposCustos)}
          </span>
        </div>
      </div>

      {sobraNegativa && valorServico > 0 && (
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <span>
            Os custos do serviço ({currencyFormatter.format(totalCustos)}) excedem a verba da obra. Aumente o
            percentual ou revise os custos.
          </span>
        </div>
      )}
    </div>
  );
}
