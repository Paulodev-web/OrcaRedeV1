"use client";

import { FileSpreadsheet, Loader2, Package, Save } from 'lucide-react';
import { useState } from 'react';
import type { PricingSaveMode, ServicePricingResult } from './types';

interface ServicePricingSummaryProps {
  result: ServicePricingResult;
  canSave?: boolean;
  canExport?: boolean;
  savingMode?: PricingSaveMode | null;
  isExportingExcel?: boolean;
  onSaveSnapshot?: () => void;
  onSaveLive?: () => void;
  onExportExcel?: () => void;
}

const currencyFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

const percentFormatter = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function formatPercent(value: number, hasVS: boolean): string {
  if (!hasVS) {
    return '--';
  }

  return `${percentFormatter.format(value)}%`;
}

export function ServicePricingSummary({
  result,
  canSave = false,
  canExport = false,
  savingMode = null,
  isExportingExcel = false,
  onSaveSnapshot,
  onSaveLive,
  onExportExcel,
}: ServicePricingSummaryProps) {
  const [showSaveChoices, setShowSaveChoices] = useState(false);
  const hasVS = result.valorServico > 0;
  const lucroNegativo = result.lucroLiquido < 0;
  const lucroBrutoNegativo = result.lucroBruto < 0;
  const hasMateriais = result.valorMateriais > 0;
  const isSaving = Boolean(savingMode);

  return (
    <aside className="space-y-4 lg:sticky lg:top-6">
      {/* Bloco 1 — Materiais (informativo) */}
      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="flex items-center gap-2">
          <Package className="h-4 w-4 text-gray-400" />
          <h2 className="text-sm font-semibold text-[#1D3140]">Materiais</h2>
        </div>
        <p className="mt-1 text-xs text-gray-500">
          Faturados diretamente ao cliente, sem margem e sem imposto.
        </p>

        <div className="mt-3 rounded-lg border border-gray-100 bg-gray-50 p-3">
          <p className="text-xs uppercase tracking-wide text-gray-500">Valor dos Materiais</p>
          <p className="mt-1 text-xl font-semibold text-[#1D3140]">
            {currencyFormatter.format(result.valorMateriais)}
          </p>
          <p className="mt-0.5 text-[11px] text-gray-500">
            {hasMateriais
              ? 'Importado do orçamento (não entra no cálculo de lucro/imposto).'
              : 'Nenhum orçamento importado.'}
          </p>
        </div>
      </div>

      {/* Bloco 2 — Serviço */}
      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-[#1D3140]">Serviço</h2>

        <div className="mt-4 grid gap-3">
          <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
            <p className="text-xs uppercase tracking-wide text-gray-500">Valor do Serviço</p>
            <p className="mt-1 text-xl font-semibold text-[#1D3140]">
              {currencyFormatter.format(result.valorServico)}
            </p>
            <p className="mt-0.5 text-[11px] text-gray-500">
              {hasVS ? '100,00% (base de cálculo do serviço)' : 'Informe o valor ou lucro desejado.'}
            </p>
          </div>

          <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
            <p className="text-xs uppercase tracking-wide text-gray-500">Total de Custos</p>
            <p className="mt-1 text-xl font-semibold text-[#1D3140]">
              {currencyFormatter.format(result.totalCustos)}
            </p>
            <p className="mt-0.5 text-[11px] text-gray-500">
              {formatPercent(result.totalCustosPercent, hasVS)} do Valor do Serviço
            </p>
          </div>

          <div
            className={`rounded-lg border p-3 ${
              lucroBrutoNegativo ? 'border-red-200 bg-red-50' : 'border-emerald-200 bg-emerald-50'
            }`}
          >
            <p className="text-xs uppercase tracking-wide text-gray-500">Lucro Bruto</p>
            <p className={`mt-1 text-xl font-semibold ${lucroBrutoNegativo ? 'text-red-700' : 'text-emerald-700'}`}>
              {currencyFormatter.format(result.lucroBruto)}
            </p>
            <p className="mt-0.5 text-[11px] text-gray-500">
              {formatPercent(result.lucroBrutoPercent, hasVS)} do Valor do Serviço
            </p>
          </div>

          <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
            <p className="text-xs uppercase tracking-wide text-gray-500">Imposto sobre VS</p>
            <p className="mt-1 text-xl font-semibold text-[#1D3140]">
              {currencyFormatter.format(result.impostoValor)}
            </p>
            <p className="mt-0.5 text-[11px] text-gray-500">
              {percentFormatter.format(result.impostoPercent)}% aplicado sobre o Valor do Serviço
            </p>
          </div>

          <div
            className={`rounded-lg border p-3 ${
              lucroNegativo ? 'border-red-200 bg-red-50' : 'border-emerald-200 bg-emerald-50'
            }`}
          >
            <p className="text-xs uppercase tracking-wide text-gray-500">Lucro Líquido</p>
            <p className={`mt-1 text-xl font-semibold ${lucroNegativo ? 'text-red-700' : 'text-emerald-700'}`}>
              {currencyFormatter.format(result.lucroLiquido)}
            </p>
            <p className="mt-0.5 text-[11px] text-gray-500">
              {formatPercent(result.lucroLiquidoPercent, hasVS)} do Valor do Serviço
            </p>
          </div>
        </div>

        {lucroBrutoNegativo && hasVS && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            Os custos do serviço ultrapassam o valor cobrado. O lucro está negativo.
          </div>
        )}
      </div>

      {/* Bloco 3 — Total ao Cliente */}
      <div className="rounded-xl border border-[#64ABDE]/30 bg-[#64ABDE]/5 p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-[#1D3140]">Total ao Cliente</h2>

        <div className="mt-3 space-y-2 text-sm">
          <div className="flex items-center justify-between gap-2 rounded-md bg-white/80 px-2 py-1.5">
            <span className="text-gray-600">Materiais</span>
            <span className="font-medium text-[#1D3140]">{currencyFormatter.format(result.valorMateriais)}</span>
          </div>
          <div className="flex items-center justify-between gap-2 rounded-md bg-white/80 px-2 py-1.5">
            <span className="text-gray-600">Serviço</span>
            <span className="font-medium text-[#1D3140]">{currencyFormatter.format(result.valorServico)}</span>
          </div>
          <div className="flex items-center justify-between gap-2 rounded-md border border-[#64ABDE]/40 bg-white px-3 py-2">
            <span className="font-semibold text-[#1D3140]">TOTAL</span>
            <span className="text-xl font-bold text-[#64ABDE]">
              {currencyFormatter.format(result.precoTotalCliente)}
            </span>
          </div>
        </div>
      </div>

      {/* Detalhamento dos Custos */}
      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <h3 className="text-sm font-semibold text-[#1D3140]">Detalhamento dos Custos</h3>
        <p className="mt-1 text-xs text-gray-500">Cada custo com seu peso sobre o Valor do Serviço.</p>

        <div className="mt-3 space-y-2 text-sm">
          {result.custosDetalhados.length === 0 ? (
            <p className="rounded-md bg-gray-50 px-2 py-3 text-center text-xs text-gray-500">
              Nenhum custo cadastrado.
            </p>
          ) : (
            result.custosDetalhados.map((custo) => (
              <div key={custo.id} className="flex items-center justify-between gap-2 rounded-md bg-gray-50 px-2 py-1.5">
                <span className="truncate text-gray-600" title={custo.descricao || 'Custo sem descrição'}>
                  {custo.descricao || 'Custo sem descrição'}
                  {custo.unidade > 0 && custo.valorUnitario > 0 ? (
                    <span className="ml-1 text-[11px] text-gray-400">
                      ({custo.unidade} × {currencyFormatter.format(custo.valorUnitario)})
                    </span>
                  ) : null}
                </span>
                <span className="flex items-baseline gap-2 whitespace-nowrap">
                  <span className="font-medium text-[#1D3140]">{currencyFormatter.format(custo.valor)}</span>
                  <span className="text-[11px] text-gray-500">
                    {hasVS ? `${percentFormatter.format(custo.percentualDoVS)}%` : '--'}
                  </span>
                </span>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Exportação */}
      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <h3 className="text-sm font-semibold text-[#1D3140]">Ações</h3>
        <div className="mt-3 grid gap-2">
          <button
            type="button"
            disabled={!canSave || isSaving}
            onClick={() => setShowSaveChoices((prev) => !prev)}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-[#64ABDE]/40 bg-[#64ABDE] text-sm font-medium text-white transition hover:brightness-95 disabled:cursor-not-allowed disabled:border-gray-200 disabled:bg-gray-100 disabled:text-gray-400"
          >
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {isSaving ? 'Salvando...' : 'Salvar precificação'}
          </button>

          {showSaveChoices && (
            <div className="rounded-lg border border-[#64ABDE]/20 bg-[#64ABDE]/5 p-3">
              <p className="text-xs font-medium text-[#1D3140]">Como deseja salvar?</p>
              <div className="mt-2 grid gap-2">
                <button
                  type="button"
                  disabled={!canSave || isSaving}
                  onClick={onSaveSnapshot}
                  className="rounded-md border border-gray-200 bg-white px-3 py-2 text-left text-xs text-gray-700 transition hover:border-[#64ABDE]/50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <span className="block font-semibold text-[#1D3140]">
                    {savingMode === 'snapshot' ? 'Salvando snapshot...' : 'Snapshot'}
                  </span>
                  Preserva os valores atuais mesmo se o orçamento mudar.
                </button>
                <button
                  type="button"
                  disabled={!canSave || isSaving}
                  onClick={onSaveLive}
                  className="rounded-md border border-gray-200 bg-white px-3 py-2 text-left text-xs text-gray-700 transition hover:border-[#64ABDE]/50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <span className="block font-semibold text-[#1D3140]">
                    {savingMode === 'live' ? 'Salvando vínculo...' : 'Vinculado ao orçamento atual'}
                  </span>
                  Recalcula materiais e totais usando o orçamento atual.
                </button>
              </div>
            </div>
          )}

          <button
            type="button"
            disabled={!canExport || isExportingExcel}
            onClick={onExportExcel}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 text-sm font-medium text-emerald-700 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:border-gray-200 disabled:bg-gray-50 disabled:text-gray-400"
          >
            {isExportingExcel ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
            {isExportingExcel ? 'Gerando Excel...' : 'Exportar Excel'}
          </button>
        </div>
        {!canSave && (
          <p className="mt-2 text-[11px] text-gray-500">Selecione um orçamento para salvar ou exportar.</p>
        )}
      </div>
    </aside>
  );
}
