"use client";

interface TaxInputProps {
  impostoPercent: number;
  onChange: (value: string) => void;
}

export function TaxInput({ impostoPercent, onChange }: TaxInputProps) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <h2 className="text-sm font-semibold text-[#1D3140]">Imposto sobre o Serviço</h2>
      <p className="mt-1 text-xs text-gray-500">
        Percentual aplicado sobre o Valor do Serviço (não sobre os materiais).
      </p>

      <div className="mt-3 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <label htmlFor="imposto-percent" className="text-xs font-medium text-gray-700">
            Imposto sobre VS (%)
          </label>
          <div className="w-28">
            <input
              id="imposto-percent"
              type="number"
              min={0}
              max={100}
              step={0.01}
              value={impostoPercent}
              onChange={(event) => onChange(event.target.value)}
              className="h-9 w-full rounded-lg border border-gray-200 px-2 text-right text-sm text-gray-800 outline-none transition focus:border-[#64ABDE]/80 focus:ring-2 focus:ring-[#64ABDE]/20"
            />
          </div>
        </div>

        <input
          type="range"
          min={0}
          max={100}
          step={0.01}
          value={impostoPercent}
          onChange={(event) => onChange(event.target.value)}
          className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-gray-200 accent-[#64ABDE]"
          aria-label="Imposto sobre o Serviço (%)"
        />
      </div>
    </div>
  );
}
