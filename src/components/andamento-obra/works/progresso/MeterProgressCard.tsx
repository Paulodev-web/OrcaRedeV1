import { Cable } from 'lucide-react';
import type { MetersByCategory } from '@/types/works';

interface MeterProgressCardProps {
  meters: MetersByCategory;
}

const CATEGORIES: { key: keyof MetersByCategory['planned']; label: string }[] = [
  { key: 'BT', label: 'Baixa tensão (BT)' },
  { key: 'MT', label: 'Média tensão (MT)' },
  { key: 'rede', label: 'Rede' },
];

export function MeterProgressCard({ meters }: MeterProgressCardProps) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <header className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
        <Cable className="h-3.5 w-3.5" />
        Metragem instalada vs planejada
      </header>
      <div className="mt-3 space-y-3">
        {CATEGORIES.map((c) => {
          const planned = meters.planned[c.key];
          const realized = meters.realized[c.key];
          const pct = planned > 0 ? Math.min(100, (realized / planned) * 100) : 0;
          const overage = planned > 0 && realized > planned;
          return (
            <div key={c.key}>
              <div className="mb-1 flex items-center justify-between text-xs">
                <span className="font-medium text-[#1D3140]">{c.label}</span>
                <span className="text-gray-500">
                  {realized.toFixed(1)} / {planned.toFixed(1)} m
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-gray-100">
                <div
                  className={
                    overage
                      ? 'h-full bg-amber-500 transition-all'
                      : 'h-full bg-emerald-500 transition-all'
                  }
                  style={{ width: `${pct.toFixed(1)}%` }}
                />
              </div>
              {overage && (
                <p className="mt-1 text-[10px] text-amber-700">
                  Excedeu o planejado em {(realized - planned).toFixed(1)} m.
                </p>
              )}
            </div>
          );
        })}
      </div>
      <p className="mt-3 text-[11px] text-gray-400">
        Soma somente diários aprovados. Categorias fora de BT/MT/Rede ficam preservadas
        no banco mas não entram nestes totais.
      </p>
    </div>
  );
}
