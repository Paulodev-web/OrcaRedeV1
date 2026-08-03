"use client";

import { useRouter } from 'next/navigation';
import { useMemo, useTransition } from 'react';
import { RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

import { refreshMaterialsAction } from '@/actions/proposals';

import { EditorCard, Notice, brl, buttonClass } from '../shared';
import type { PanelProps } from './types';

/**
 * Escopo dos materiais subdivididos — leitura.
 *
 * O consolidado é congelado na criação da proposta de propósito: a peça enviada
 * ao cliente não pode mudar porque alguém editou um preço no catálogo depois.
 * Recongelar é uma ação explícita, e ela refaz a curva ABC junto.
 */
export function MateriaisPanel({ context, origin }: PanelProps) {
  const { record, locked } = context;
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const bySubgroup = useMemo(() => {
    const groups = new Map<string, { total: number; count: number }>();
    for (const row of record.proposal.materialsSnapshot) {
      const key = row.subgroup ?? 'Não classificado';
      const current = groups.get(key) ?? { total: 0, count: 0 };
      groups.set(key, { total: current.total + row.subtotal, count: current.count + 1 });
    }
    return [...groups.entries()]
      .map(([subgroup, value]) => ({ subgroup, ...value }))
      .sort((a, b) => b.total - a.total);
  }, [record.proposal.materialsSnapshot]);

  const total = record.proposal.materialsSnapshot.reduce((sum, row) => sum + row.subtotal, 0);

  const refresh = () => {
    if (
      !window.confirm(
        'Recongelar os materiais a partir do orçamento? Isso também refaz a curva ABC, e os rótulos comerciais que você tiver editado nela se perdem.',
      )
    ) {
      return;
    }

    startTransition(async () => {
      const result = await refreshMaterialsAction(record.proposal.id);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(`Materiais atualizados: ${brl(result.data.materialTotal)}.`);
      router.refresh();
    });
  };

  return (
    <EditorCard
      title="Escopo dos materiais subdivididos"
      origin={origin}
      actions={
        <button type="button" onClick={refresh} disabled={locked || pending} className={buttonClass}>
          <RefreshCw className="h-4 w-4" />
          {pending ? 'Atualizando…' : 'Recongelar do orçamento'}
        </button>
      }
    >
      {record.proposal.materialsSnapshot.length === 0 ? (
        <Notice tone="warning">
          Nenhum material congelado. O orçamento de origem estava sem material quando a proposta foi
          criada — lance os materiais e use &ldquo;Recongelar do orçamento&rdquo;.
        </Notice>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
            <span className="text-slate-500">
              {record.proposal.materialsSnapshot.length} itens em {bySubgroup.length} subgrupos
            </span>
            <span className="font-semibold tabular-nums text-brand-navy">{brl(total)}</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-400">
                  <th className="pb-2 pr-3 font-semibold">Subgrupo</th>
                  <th className="pb-2 pr-3 text-right font-semibold">Itens</th>
                  <th className="pb-2 text-right font-semibold">Valor</th>
                </tr>
              </thead>
              <tbody>
                {bySubgroup.map((group) => (
                  <tr key={group.subgroup} className="border-b border-slate-100">
                    <td className="py-2 pr-3 text-slate-700">{group.subgroup}</td>
                    <td className="py-2 pr-3 text-right tabular-nums text-slate-500">{group.count}</td>
                    <td className="py-2 text-right tabular-nums text-slate-700">{brl(group.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <details className="mt-4">
            <summary className="cursor-pointer text-sm font-medium text-brand-blue-deep">
              Ver os {record.proposal.materialsSnapshot.length} itens
            </summary>
            <div className="mt-3 max-h-96 overflow-auto rounded-lg border border-slate-100">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="sticky top-0 bg-white">
                  <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-400">
                    <th className="px-3 py-2 font-semibold">Código</th>
                    <th className="px-3 py-2 font-semibold">Material</th>
                    <th className="px-3 py-2 text-right font-semibold">Qtd.</th>
                    <th className="px-3 py-2 text-right font-semibold">Unitário</th>
                    <th className="px-3 py-2 text-right font-semibold">Subtotal</th>
                  </tr>
                </thead>
                <tbody>
                  {record.proposal.materialsSnapshot.map((row, index) => (
                    <tr key={`${row.code ?? row.name}-${index}`} className="border-b border-slate-50">
                      <td className="px-3 py-1.5 text-xs text-slate-400">{row.code ?? '—'}</td>
                      <td className="px-3 py-1.5 text-slate-700">{row.name}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-slate-500">
                        {row.quantity} {row.unit}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-slate-500">
                        {brl(row.unitPrice)}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-slate-700">
                        {brl(row.subtotal)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </>
      )}
    </EditorCard>
  );
}
