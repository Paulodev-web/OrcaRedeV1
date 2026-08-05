"use client";

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { saveScheduleAction, updateProposalTextAction } from '@/actions/proposals';
import { DEFAULT_SCHEDULE_COLUMNS, DEFAULT_SCHEDULE_STAGES } from '@/services/proposals/defaults';

import { EditorCard, FieldLabel, Notice, buttonClass, inputClass, primaryButtonClass, textareaClass } from '../shared';
import type { PanelProps } from './types';

interface ColumnDraft {
  key: string;
  label: string;
}

interface RowDraft {
  key: string;
  stage: string;
  marks: Record<string, boolean | string>;
}

/**
 * Cronograma executivo — matriz de etapa × prazo.
 *
 * Preenchimento manual por decisão de escopo: prazo de obra não sai de banco
 * nem de IA. A marca de uma célula é `true` (X) ou um texto curto.
 */
export function CronogramaPanel({ context, origin }: PanelProps) {
  const { record, locked } = context;
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [columns, setColumns] = useState<ColumnDraft[]>(() =>
    record.proposal.scheduleColumns.map((column) => ({ ...column })),
  );
  const [rows, setRows] = useState<RowDraft[]>(() =>
    record.scheduleRows
      .slice()
      .sort((a, b) => a.orderIndex - b.orderIndex)
      .map((row) => ({ key: row.id, stage: row.stage, marks: { ...row.marks } })),
  );
  const [footnote, setFootnote] = useState(record.proposal.scheduleFootnote ?? '');

  const applyTemplate = () => {
    setColumns(DEFAULT_SCHEDULE_COLUMNS.map((column) => ({ ...column })));
    setRows(
      DEFAULT_SCHEDULE_STAGES.map((stage, index) => ({
        key: `modelo-${index}`,
        stage,
        marks: {},
      })),
    );
  };

  const toggleMark = (rowIndex: number, columnKey: string) =>
    setRows((current) =>
      current.map((row, index) => {
        if (index !== rowIndex) return row;
        const marks = { ...row.marks };
        if (marks[columnKey]) delete marks[columnKey];
        else marks[columnKey] = true;
        return { ...row, marks };
      }),
    );

  const save = () =>
    startTransition(async () => {
      const scheduleResult = await saveScheduleAction(
        record.proposal.id,
        columns.map((column) => ({ key: column.key, label: column.label })),
        rows.map((row, index) => ({ order: index + 1, stage: row.stage, marks: row.marks })),
      );

      if (!scheduleResult.success) {
        toast.error(scheduleResult.error);
        return;
      }

      const footnoteResult = await updateProposalTextAction(record.proposal.id, {
        scheduleFootnote: footnote || null,
      });

      if (!footnoteResult.success) {
        toast.error(footnoteResult.error);
        return;
      }

      toast.success('Cronograma salvo.');
      router.refresh();
    });

  return (
    <EditorCard
      title="Cronograma executivo"
      origin={origin}
      actions={
        <>
          <button type="button" onClick={applyTemplate} disabled={locked} className={buttonClass}>
            Usar modelo
          </button>
          <button type="button" onClick={save} disabled={locked || pending} className={primaryButtonClass}>
            {pending ? 'Salvando…' : 'Salvar'}
          </button>
        </>
      }
    >
      <div className="mb-4">
        <div className="mb-2 flex items-center justify-between">
          <FieldLabel hint="prazos exibidos como colunas">Colunas</FieldLabel>
          <button
            type="button"
            onClick={() =>
              setColumns((current) => [
                ...current,
                { key: `c${current.length + 1}${Date.now().toString(36).slice(-3)}`, label: '' },
              ])
            }
            disabled={locked}
            className={`${buttonClass} px-2.5 py-1.5 text-xs`}
          >
            <Plus className="h-3.5 w-3.5" />
            Coluna
          </button>
        </div>

        {columns.length === 0 ? (
          <Notice>Sem colunas o cronograma não aparece no PDF. Use &ldquo;Usar modelo&rdquo;.</Notice>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {columns.map((column, index) => (
              <li key={column.key} className="flex items-center gap-1">
                <input
                  value={column.label}
                  onChange={(event) =>
                    setColumns((current) =>
                      current.map((item, i) =>
                        i === index ? { ...item, label: event.target.value } : item,
                      ),
                    )
                  }
                  placeholder="30 dias"
                  disabled={locked}
                  className={`${inputClass} w-32`}
                />
                <button
                  type="button"
                  onClick={() => setColumns((current) => current.filter((_, i) => i !== index))}
                  disabled={locked}
                  className="rounded-lg border border-slate-200 p-2 text-slate-400 transition-colors hover:border-red-300 hover:text-red-500"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mb-4">
        <div className="mb-2 flex items-center justify-between">
          <FieldLabel hint="clique nas células para marcar">Etapas</FieldLabel>
          <button
            type="button"
            onClick={() =>
              setRows((current) => [
                ...current,
                { key: `linha-${current.length}-${Date.now()}`, stage: '', marks: {} },
              ])
            }
            disabled={locked}
            className={`${buttonClass} px-2.5 py-1.5 text-xs`}
          >
            <Plus className="h-3.5 w-3.5" />
            Etapa
          </button>
        </div>

        {rows.length === 0 ? (
          <Notice>Nenhuma etapa cadastrada.</Notice>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-400">
                  <th className="pb-2 pr-3 text-left font-semibold">Etapa</th>
                  {columns.map((column) => (
                    <th key={column.key} className="pb-2 px-2 text-center font-semibold">
                      {column.label || '—'}
                    </th>
                  ))}
                  <th className="pb-2" />
                </tr>
              </thead>
              <tbody>
                {rows.map((row, rowIndex) => (
                  <tr key={row.key} className="border-b border-slate-100">
                    <td className="py-1.5 pr-3">
                      <input
                        value={row.stage}
                        onChange={(event) =>
                          setRows((current) =>
                            current.map((item, i) =>
                              i === rowIndex ? { ...item, stage: event.target.value } : item,
                            ),
                          )
                        }
                        disabled={locked}
                        className={inputClass}
                      />
                    </td>
                    {columns.map((column) => (
                      <td key={column.key} className="px-2 py-1.5 text-center">
                        <button
                          type="button"
                          onClick={() => toggleMark(rowIndex, column.key)}
                          disabled={locked}
                          className={`h-8 w-8 rounded-lg border text-sm font-semibold transition-colors ${
                            row.marks[column.key]
                              ? 'border-accent-600 bg-accent-600 text-white'
                              : 'border-slate-200 text-slate-300 hover:border-brand-blue'
                          }`}
                        >
                          {typeof row.marks[column.key] === 'string'
                            ? String(row.marks[column.key]).slice(0, 2)
                            : row.marks[column.key]
                              ? 'X'
                              : '·'}
                        </button>
                      </td>
                    ))}
                    <td className="py-1.5">
                      <button
                        type="button"
                        onClick={() => setRows((current) => current.filter((_, i) => i !== rowIndex))}
                        disabled={locked}
                        className="rounded-lg border border-slate-200 p-2 text-slate-400 transition-colors hover:border-red-300 hover:text-red-500"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <label className="block">
        <FieldLabel hint="condicionantes do prazo">Nota de rodapé</FieldLabel>
        <textarea
          value={footnote}
          onChange={(event) => setFootnote(event.target.value)}
          disabled={locked}
          className={textareaClass}
        />
      </label>
    </EditorCard>
  );
}
