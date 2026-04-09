"use client";

interface LaborInputProps {
  estimatedHours: number;
  hourlyRate: number;
  onEstimatedHoursChange: (value: string) => void;
  onHourlyRateChange: (value: string) => void;
}

const currencyFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

export function LaborInput({
  estimatedHours,
  hourlyRate,
  onEstimatedHoursChange,
  onHourlyRateChange,
}: LaborInputProps) {
  const subtotal = estimatedHours * hourlyRate;

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <h2 className="text-sm font-semibold text-[#1D3140]">Mão de Obra</h2>
      <p className="mt-1 text-xs text-gray-500">Preencha as horas e o custo-hora para compor o custo direto.</p>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="space-y-1">
          <span className="text-xs font-medium text-gray-600">Horas estimadas</span>
          <input
            type="number"
            min="0"
            step="0.01"
            value={estimatedHours}
            onChange={(event) => onEstimatedHoursChange(event.target.value)}
            className="h-10 w-full rounded-lg border border-gray-200 px-3 text-sm text-gray-800 outline-none transition focus:border-[#64ABDE]/80 focus:ring-2 focus:ring-[#64ABDE]/20"
          />
        </label>

        <label className="space-y-1">
          <span className="text-xs font-medium text-gray-600">Valor por hora (R$)</span>
          <input
            type="number"
            min="0"
            step="0.01"
            value={hourlyRate}
            onChange={(event) => onHourlyRateChange(event.target.value)}
            className="h-10 w-full rounded-lg border border-gray-200 px-3 text-sm text-gray-800 outline-none transition focus:border-[#64ABDE]/80 focus:ring-2 focus:ring-[#64ABDE]/20"
          />
        </label>
      </div>

      <div className="mt-4 rounded-lg bg-[#1D3140]/5 px-3 py-2 text-sm text-[#1D3140]">
        Subtotal de mão de obra: <span className="font-semibold">{currencyFormatter.format(subtotal)}</span>
      </div>
    </div>
  );
}
