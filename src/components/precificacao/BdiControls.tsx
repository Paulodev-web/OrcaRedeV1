"use client";

import type { BdiRates } from '@/lib/pricingMath';

interface BdiControlsProps {
  rates: BdiRates;
  onRateChange: (field: keyof BdiRates, value: string) => void;
}

interface BdiFieldConfig {
  key: keyof BdiRates;
  label: string;
  min: number;
  max: number;
  step: number;
}

const bdiFields: BdiFieldConfig[] = [
  { key: 'df', label: 'Despesas Fixas (DF)', min: 0, max: 30, step: 0.01 },
  { key: 'fi', label: 'Despesas Financeiras (FI)', min: 0, max: 20, step: 0.01 },
  { key: 'lucro', label: 'Margem de Lucro (L)', min: 0, max: 40, step: 0.01 },
  { key: 'impostos', label: 'Impostos (I)', min: 0, max: 40, step: 0.01 },
];

export function BdiControls({ rates, onRateChange }: BdiControlsProps) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <h2 className="text-sm font-semibold text-[#1D3140]">Parâmetros BDI</h2>
      <p className="mt-1 text-xs text-gray-500">
        Ajuste os percentuais para calcular o preço final com despesas, impostos e lucro.
      </p>

      <div className="mt-4 space-y-4">
        {bdiFields.map((field) => (
          <div key={field.key} className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <label className="text-xs font-medium text-gray-700">{field.label}</label>
              <div className="w-24">
                <input
                  type="number"
                  min={field.min}
                  max={field.max}
                  step={field.step}
                  value={rates[field.key]}
                  onChange={(event) => onRateChange(field.key, event.target.value)}
                  className="h-9 w-full rounded-lg border border-gray-200 px-2 text-right text-sm text-gray-800 outline-none transition focus:border-[#64ABDE]/80 focus:ring-2 focus:ring-[#64ABDE]/20"
                />
              </div>
            </div>

            <input
              type="range"
              min={field.min}
              max={field.max}
              step={field.step}
              value={rates[field.key]}
              onChange={(event) => onRateChange(field.key, event.target.value)}
              className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-gray-200 accent-[#64ABDE]"
            />
          </div>
        ))}
      </div>
    </div>
  );
}
