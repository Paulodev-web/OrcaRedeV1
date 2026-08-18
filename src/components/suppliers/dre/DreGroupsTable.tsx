"use client";

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Lock, Unlock } from 'lucide-react';
import { toast } from 'sonner';
import { setDreGroupClosedAction } from '@/actions/dre';
import { dreGroupLabel } from '@/services/dre/types';
import type { DreGroup, DreResult } from '@/services/dre/types';

const currencyFormatter = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const percentFormatter = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

function formatPercent(value: number | null): string {
  if (value === null) return '—';
  return `${percentFormatter.format(value)}%`;
}

interface DreGroupsTableProps {
  dreId: string;
  sessionId: string;
  result: DreResult;
  dreClosed: boolean;
}

export function DreGroupsTable({ dreId, sessionId, result, dreClosed }: DreGroupsTableProps) {
  const router = useRouter();
  const [busyGroup, setBusyGroup] = useState<DreGroup | null>(null);

  const toggleGroup = async (grupo: DreGroup, fechado: boolean) => {
    setBusyGroup(grupo);
    const res = await setDreGroupClosedAction(dreId, sessionId, grupo, fechado);
    setBusyGroup(null);
    if (!res.success) {
      toast.error(res.error);
      return;
    }
    router.refresh();
  };

  return (
    <div className="rounded-2xl border border-gray-200 bg-surface p-4 shadow-sm">
      <h3 className="text-sm font-semibold text-neutral-900">Orçado × Realizado por grupo</h3>

      <div className="mt-3 overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-left text-xs uppercase tracking-wide text-gray-500">
              <th className="py-2 pr-3">Grupo</th>
              <th className="py-2 pr-3 text-right">Orçado</th>
              <th className="py-2 pr-3 text-right">% do total</th>
              <th className="py-2 pr-3 text-right">Realizado</th>
              <th className="py-2 pr-3 text-right">Variação</th>
              <th className="py-2 pr-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {result.groups.map((row) => (
              <tr key={row.grupo} className="border-b border-gray-100">
                <td className="py-2 pr-3 font-medium text-neutral-900">
                  {dreGroupLabel(row.grupo)}
                  {row.grupo === 'material' && <span className="ml-1 text-[11px] text-gray-400">(via OC)</span>}
                </td>
                <td className="py-2 pr-3 text-right text-gray-700">{currencyFormatter.format(row.planejado)}</td>
                <td className="py-2 pr-3 text-right text-gray-500">
                  {result.totalPlanejado > 0 ? formatPercent((row.planejado / result.totalPlanejado) * 100) : '—'}
                </td>
                <td className="py-2 pr-3 text-right text-gray-700">{currencyFormatter.format(row.realizado)}</td>
                <td
                  className={`py-2 pr-3 text-right ${
                    row.variacao > 0 ? 'text-red-600' : row.variacao < 0 ? 'text-emerald-600' : 'text-gray-500'
                  }`}
                >
                  {currencyFormatter.format(row.variacao)}
                  {row.variacaoPercent !== null && (
                    <span className="ml-1 text-[11px]">({formatPercent(row.variacaoPercent)})</span>
                  )}
                </td>
                <td className="py-2 pr-3">
                  <button
                    type="button"
                    disabled={busyGroup === row.grupo || dreClosed}
                    onClick={() => toggleGroup(row.grupo, !row.fechado)}
                    className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium transition disabled:cursor-not-allowed disabled:opacity-60 ${
                      row.fechado
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                        : 'border-gray-200 bg-gray-50 text-gray-600 hover:border-accent-500/40'
                    }`}
                  >
                    {row.fechado ? <Lock className="h-3 w-3" /> : <Unlock className="h-3 w-3" />}
                    {row.fechado ? 'Fechado' : 'Aberto'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-gray-50 text-sm font-semibold text-neutral-900">
              <td className="py-2 pr-3">Total</td>
              <td className="py-2 pr-3 text-right">{currencyFormatter.format(result.totalPlanejado)}</td>
              <td className="py-2 pr-3 text-right text-gray-500">100,0%</td>
              <td className="py-2 pr-3 text-right">
                {currencyFormatter.format(result.groups.reduce((acc, g) => acc + g.realizado, 0))}
              </td>
              <td colSpan={2} />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
