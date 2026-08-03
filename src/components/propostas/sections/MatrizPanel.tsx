"use client";

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { saveResponsibilityItemsAction } from '@/actions/proposals';

import { EditorCard, Notice, buttonClass, inputClass, primaryButtonClass } from '../shared';
import type { PanelProps } from './types';

interface ItemDraft {
  key: string;
  description: string;
  responsible: 'contratada' | 'contratante' | 'ambos';
}

const RESPONSIBLE_LABELS = {
  contratada: 'Contratada',
  contratante: 'Contratante',
  ambos: 'Ambos',
} as const;

/**
 * Matriz de responsabilidade item a item — um dos pontos fortes das propostas
 * atuais, e o que evita discussão de escopo depois de fechado.
 * Copiada do template na criação, editável por proposta.
 */
export function MatrizPanel({ context, origin }: PanelProps) {
  const { record, locked } = context;
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [items, setItems] = useState<ItemDraft[]>(() =>
    record.responsibilityItems
      .slice()
      .sort((a, b) => a.orderIndex - b.orderIndex)
      .map((item) => ({
        key: item.id,
        description: item.description,
        responsible: item.responsible,
      })),
  );

  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= items.length) return;
    setItems((current) => {
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const save = () =>
    startTransition(async () => {
      const result = await saveResponsibilityItemsAction(
        record.proposal.id,
        items.map((item, index) => ({
          order: index + 1,
          description: item.description,
          responsible: item.responsible,
        })),
      );

      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success('Matriz salva.');
      router.refresh();
    });

  return (
    <EditorCard
      title="Matriz de responsabilidade"
      origin={origin}
      actions={
        <>
          <button
            type="button"
            onClick={() =>
              setItems((current) => [
                ...current,
                { key: `novo-${current.length}-${Date.now()}`, description: '', responsible: 'contratada' },
              ])
            }
            disabled={locked}
            className={buttonClass}
          >
            <Plus className="h-4 w-4" />
            Item
          </button>
          <button type="button" onClick={save} disabled={locked || pending} className={primaryButtonClass}>
            {pending ? 'Salvando…' : 'Salvar'}
          </button>
        </>
      }
    >
      {items.length === 0 ? (
        <Notice>
          Matriz vazia. Cadastre a matriz padrão no template de proposta para que ela venha pronta nas
          próximas.
        </Notice>
      ) : (
        <ul className="space-y-2">
          {items.map((item, index) => (
            <li key={item.key} className="flex flex-wrap items-center gap-2">
              <span className="w-6 shrink-0 text-right text-xs tabular-nums text-slate-400">
                {index + 1}
              </span>
              <input
                value={item.description}
                onChange={(event) =>
                  setItems((current) =>
                    current.map((row, i) =>
                      i === index ? { ...row, description: event.target.value } : row,
                    ),
                  )
                }
                placeholder="Descrição do item"
                disabled={locked}
                className={`${inputClass} min-w-0 flex-1`}
              />
              <select
                value={item.responsible}
                onChange={(event) =>
                  setItems((current) =>
                    current.map((row, i) =>
                      i === index
                        ? { ...row, responsible: event.target.value as ItemDraft['responsible'] }
                        : row,
                    ),
                  )
                }
                disabled={locked}
                className={`${inputClass} w-36 shrink-0`}
              >
                {Object.entries(RESPONSIBLE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
              <span className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  onClick={() => move(index, -1)}
                  disabled={locked || index === 0}
                  className="rounded-lg border border-slate-200 p-2 text-slate-400 hover:text-brand-navy disabled:opacity-30"
                >
                  <ArrowUp className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => move(index, 1)}
                  disabled={locked || index === items.length - 1}
                  className="rounded-lg border border-slate-200 p-2 text-slate-400 hover:text-brand-navy disabled:opacity-30"
                >
                  <ArrowDown className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setItems((current) => current.filter((_, i) => i !== index))}
                  disabled={locked}
                  className="rounded-lg border border-slate-200 p-2 text-slate-400 transition-colors hover:border-red-300 hover:text-red-500"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </EditorCard>
  );
}
