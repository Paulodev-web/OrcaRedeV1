"use client";

import { useRouter } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';
import { Trash2, Wand2 } from 'lucide-react';
import { toast } from 'sonner';

import { regenerateAbcAction, saveAbcRowsAction } from '@/actions/proposals';
import { DEFAULT_ABC_CUT_A, DEFAULT_ABC_CUT_B } from '@/services/proposals/derive';

import {
  EditorCard,
  FieldLabel,
  Notice,
  brl,
  buttonClass,
  inputClass,
  pct,
  primaryButtonClass,
} from '../shared';
import type { PanelProps } from './types';

interface AbcDraft {
  key: string;
  curve: 'A' | 'B' | 'C';
  label: string;
  amount: string;
}

/**
 * Curva ABC (§8.4).
 *
 * O percentual NÃO é editável: ele é sempre recalculado do valor sobre o total.
 * Foi um percentual digitado à mão, incoerente com o próprio valor, que passou
 * na proposta da Maxif4 — aqui o número não tem como divergir de si mesmo.
 */
export function CurvaAbcPanel({ context, origin }: PanelProps) {
  const { record, locked } = context;
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [cutA, setCutA] = useState(String(DEFAULT_ABC_CUT_A));
  const [cutB, setCutB] = useState(String(DEFAULT_ABC_CUT_B));
  const [rows, setRows] = useState<AbcDraft[]>(() =>
    record.abcRows
      .slice()
      .sort((a, b) => a.orderIndex - b.orderIndex)
      .map((row) => ({
        key: row.id,
        curve: row.curve,
        label: row.label,
        amount: String(row.amount),
      })),
  );

  const grandTotal = useMemo(
    () => rows.reduce((sum, row) => sum + (Number(row.amount) || 0), 0),
    [rows],
  );

  const totals = useMemo(
    () =>
      (['A', 'B', 'C'] as const)
        .map((curve) => {
          const amount = rows
            .filter((row) => row.curve === curve)
            .reduce((sum, row) => sum + (Number(row.amount) || 0), 0);
          return { curve, amount, percent: grandTotal > 0 ? (amount / grandTotal) * 100 : 0 };
        })
        .filter((total) => rows.some((row) => row.curve === total.curve)),
    [rows, grandTotal],
  );

  const materialTotal = record.proposal.materialsSnapshot.reduce((sum, row) => sum + row.subtotal, 0);
  const drift = Math.abs(grandTotal - materialTotal);

  const save = () =>
    startTransition(async () => {
      const result = await saveAbcRowsAction(
        record.proposal.id,
        rows.map((row, index) => ({
          curve: row.curve,
          label: row.label,
          amount: Number(row.amount) || 0,
          order: index + 1,
        })),
      );

      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success('Curva ABC salva.');
      router.refresh();
    });

  const regenerate = () =>
    startTransition(async () => {
      const result = await regenerateAbcAction(record.proposal.id, {
        cutA: Number(cutA) || DEFAULT_ABC_CUT_A,
        cutB: Number(cutB) || DEFAULT_ABC_CUT_B,
      });

      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success('Curva refeita a partir do consolidado.');
      router.refresh();
    });

  return (
    <EditorCard
      title="Curva de preços (ABC)"
      origin={origin}
      actions={
        <button type="button" onClick={save} disabled={locked || pending} className={primaryButtonClass}>
          {pending ? 'Salvando…' : 'Salvar'}
        </button>
      }
    >
      <div className="mb-4 flex flex-wrap items-end gap-3 rounded-lg bg-slate-50 p-3">
        <label className="block w-28">
          <FieldLabel hint="% acumulado">Corte A</FieldLabel>
          <input
            type="number"
            min={1}
            max={99}
            value={cutA}
            onChange={(event) => setCutA(event.target.value)}
            disabled={locked}
            className={inputClass}
          />
        </label>
        <label className="block w-28">
          <FieldLabel hint="% acumulado">Corte B</FieldLabel>
          <input
            type="number"
            min={2}
            max={100}
            value={cutB}
            onChange={(event) => setCutB(event.target.value)}
            disabled={locked}
            className={inputClass}
          />
        </label>
        <button type="button" onClick={regenerate} disabled={locked || pending} className={buttonClass}>
          <Wand2 className="h-4 w-4" />
          Refazer por Pareto
        </button>
        <p className="text-xs text-slate-400">
          Refazer descarta rótulos comerciais editados e volta aos nomes dos subgrupos.
        </p>
      </div>

      {rows.length === 0 ? (
        <Notice>Nenhuma linha na curva. Use &ldquo;Refazer por Pareto&rdquo;.</Notice>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-400">
                  <th className="pb-2 pr-3 font-semibold">Curva</th>
                  <th className="pb-2 pr-3 font-semibold">Rótulo comercial</th>
                  <th className="pb-2 pr-3 text-right font-semibold">Valor</th>
                  <th className="pb-2 pr-3 text-right font-semibold">%</th>
                  <th className="pb-2" />
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => {
                  const amount = Number(row.amount) || 0;
                  const percent = grandTotal > 0 ? (amount / grandTotal) * 100 : 0;

                  return (
                    <tr key={row.key} className="border-b border-slate-100">
                      <td className="py-1.5 pr-3">
                        <select
                          value={row.curve}
                          onChange={(event) =>
                            setRows((current) =>
                              current.map((item, i) =>
                                i === index
                                  ? { ...item, curve: event.target.value as 'A' | 'B' | 'C' }
                                  : item,
                              ),
                            )
                          }
                          disabled={locked}
                          className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm outline-none focus:border-brand-blue"
                        >
                          <option value="A">A</option>
                          <option value="B">B</option>
                          <option value="C">C</option>
                        </select>
                      </td>
                      <td className="py-1.5 pr-3">
                        <input
                          value={row.label}
                          onChange={(event) =>
                            setRows((current) =>
                              current.map((item, i) =>
                                i === index ? { ...item, label: event.target.value } : item,
                              ),
                            )
                          }
                          disabled={locked}
                          className={inputClass}
                        />
                      </td>
                      <td className="py-1.5 pr-3">
                        <input
                          type="number"
                          step="0.01"
                          min={0}
                          value={row.amount}
                          onChange={(event) =>
                            setRows((current) =>
                              current.map((item, i) =>
                                i === index ? { ...item, amount: event.target.value } : item,
                              ),
                            )
                          }
                          disabled={locked}
                          className={`${inputClass} text-right tabular-nums`}
                        />
                      </td>
                      <td className="py-1.5 pr-3 text-right tabular-nums text-slate-500">
                        {pct(percent)}
                      </td>
                      <td className="py-1.5">
                        <button
                          type="button"
                          onClick={() => setRows((current) => current.filter((_, i) => i !== index))}
                          disabled={locked}
                          className="rounded-lg border border-slate-200 p-2 text-slate-400 transition-colors hover:border-red-300 hover:text-red-500"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg bg-slate-50 p-3 text-sm">
            {totals.map((total) => (
              <span key={total.curve} className="tabular-nums text-slate-600">
                Curva {total.curve}: <strong>{brl(total.amount)}</strong> ({pct(total.percent)})
              </span>
            ))}
            <span className="ml-auto tabular-nums font-semibold text-brand-navy">
              Total {brl(grandTotal)}
            </span>
          </div>

          {drift > 0.05 ? (
            <div className="mt-3">
              <Notice tone="warning">
                A curva soma {brl(grandTotal)}, mas o consolidado de material é {brl(materialTotal)} —
                diferença de {brl(drift)}. Ajuste os valores ou refaça por Pareto.
              </Notice>
            </div>
          ) : null}
        </>
      )}
    </EditorCard>
  );
}
