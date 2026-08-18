"use client";

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { addDreActualAction, deleteDreActualAction } from '@/actions/dre';
import { DecimalInput } from '@/components/precificacao/DecimalInput';
import { dreGroupLabel } from '@/services/dre/types';
import type { DreGroup } from '@/services/dre/types';
import type { DreActualRow } from '@/services/dre/loadDreContext';

const currencyFormatter = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

const LAUNCHABLE_GROUPS = ['mao_de_obra', 'imposto', 'frete', 'comissao', 'adicional'] as const;

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

interface DreManualEntriesProps {
  dreId: string;
  sessionId: string;
  actuals: DreActualRow[];
  dreClosed: boolean;
}

export function DreManualEntries({ dreId, sessionId, actuals, dreClosed }: DreManualEntriesProps) {
  const router = useRouter();
  const [formGroup, setFormGroup] = useState<Exclude<DreGroup, 'material'>>('mao_de_obra');
  const [descricao, setDescricao] = useState('');
  const [valor, setValor] = useState(0);
  const [competencia, setCompetencia] = useState(todayIso());
  const [submitting, setSubmitting] = useState(false);

  const handleAddActual = async () => {
    setSubmitting(true);
    const res = await addDreActualAction({ dreId, sessionId, grupo: formGroup, descricao, valor, competencia });
    setSubmitting(false);

    if (!res.success) {
      toast.error(res.error);
      return;
    }

    toast.success('Lançamento adicionado.');
    setDescricao('');
    setValor(0);
    router.refresh();
  };

  const handleDeleteActual = async (id: string) => {
    const res = await deleteDreActualAction(id, sessionId);
    if (!res.success) {
      toast.error(res.error);
      return;
    }
    router.refresh();
  };

  return (
    <div className="rounded-2xl border border-gray-200 bg-surface p-4 shadow-sm">
      <h3 className="text-sm font-semibold text-neutral-900">Lançamentos manuais</h3>
      <p className="mt-0.5 text-xs text-gray-500">
        Material não entra aqui — vem só de ordem de compra. Use para mão de obra, imposto, comissão, adicional ou
        frete avulso fora de OC.
      </p>

      {actuals.length > 0 && (
        <ul className="mt-3 space-y-1">
          {actuals.map((actual) => (
            <li
              key={actual.id}
              className="flex items-center justify-between gap-2 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-xs"
            >
              <span className="text-gray-600">
                <span className="font-medium text-neutral-900">{dreGroupLabel(actual.grupo)}</span> —{' '}
                {actual.descricao}{' '}
                <span className="text-gray-400">
                  ({new Date(actual.competencia).toLocaleDateString('pt-BR', { timeZone: 'UTC' })})
                </span>
              </span>
              <span className="flex items-center gap-2">
                <span className="font-medium text-neutral-900">{currencyFormatter.format(actual.valor)}</span>
                {!dreClosed && (
                  <button
                    type="button"
                    onClick={() => handleDeleteActual(actual.id)}
                    className="text-gray-400 transition hover:text-red-600"
                    aria-label="Remover lançamento"
                  >
                    ×
                  </button>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}

      {!dreClosed && (
        <div className="mt-3 flex flex-wrap items-end gap-2 rounded-lg border border-gray-100 bg-gray-50 p-3">
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-gray-500">Grupo</label>
            <select
              value={formGroup}
              onChange={(event) => setFormGroup(event.target.value as Exclude<DreGroup, 'material'>)}
              className="h-9 rounded-lg border border-gray-200 bg-surface px-2 text-sm text-gray-800 outline-none focus:border-accent-500/80 focus:ring-2 focus:ring-accent-500/20"
            >
              {LAUNCHABLE_GROUPS.map((g) => (
                <option key={g} value={g}>
                  {dreGroupLabel(g)}
                </option>
              ))}
            </select>
          </div>
          <div className="flex min-w-[180px] flex-1 flex-col gap-1">
            <label className="text-[11px] text-gray-500">Descrição</label>
            <input
              type="text"
              value={descricao}
              onChange={(event) => setDescricao(event.target.value)}
              placeholder="Ex.: Folha de julho"
              className="h-9 rounded-lg border border-gray-200 px-3 text-sm text-gray-800 outline-none focus:border-accent-500/80 focus:ring-2 focus:ring-accent-500/20"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-gray-500">Valor (R$)</label>
            <DecimalInput
              value={valor}
              onValueChange={setValor}
              className="h-9 w-28 rounded-lg border border-gray-200 px-2 text-right text-sm text-gray-800 outline-none focus:border-accent-500/80 focus:ring-2 focus:ring-accent-500/20"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-gray-500">Competência</label>
            <input
              type="date"
              value={competencia}
              onChange={(event) => setCompetencia(event.target.value)}
              className="h-9 rounded-lg border border-gray-200 px-2 text-sm text-gray-800 outline-none focus:border-accent-500/80 focus:ring-2 focus:ring-accent-500/20"
            />
          </div>
          <button
            type="button"
            onClick={handleAddActual}
            disabled={submitting || !descricao.trim() || valor <= 0}
            className="inline-flex h-9 items-center justify-center rounded-lg bg-accent-600 px-3 text-xs font-semibold text-white transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? 'Lançando…' : 'Lançar'}
          </button>
        </div>
      )}
    </div>
  );
}
