"use client";

import { useRouter } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';
import { Plus, RefreshCw, Star, Trash2, Wand2 } from 'lucide-react';
import { toast } from 'sonner';

import {
  addPricingOptionAction,
  generatePaymentTermsAction,
  removePricingOptionAction,
  savePaymentTermsAction,
  saveSegmentTotalsAction,
  syncPricingOptionAction,
  updatePricingOptionAction,
} from '@/actions/proposals';
import type { ProposalPricingOptionRow } from '@/services/proposals/repository';
import type { ProposalSectionKey } from '@/types/proposal';

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

/**
 * As quatro seções de valor, num painel só: por segmento, globais, investimento
 * por unidade e condições de pagamento. Elas compartilham a mesma origem — a
 * opção de preço — e separá-las em quatro telas faria o usuário navegar entre
 * abas para conferir uma soma.
 *
 * Regra que atravessa tudo aqui: o parcelamento incide sobre a MÃO DE OBRA, e
 * nunca sobre material, que é faturado direto pelo fornecedor (§8.2).
 */
export function PrecosPanel({
  sectionKey,
  context,
  origin,
}: PanelProps & { sectionKey: ProposalSectionKey }) {
  const { record, scenarios, locked } = context;
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [activeOptionId, setActiveOptionId] = useState(
    record.pricingOptions.find((option) => option.isRecommended)?.id ??
      record.pricingOptions[0]?.id ??
      '',
  );

  const option = record.pricingOptions.find((item) => item.id === activeOptionId) ?? null;

  const availableScenarios = scenarios.filter(
    (scenario) => !record.pricingOptions.some((item) => item.savedPricingBudgetId === scenario.id),
  );

  const addOption = (scenarioId: string) =>
    startTransition(async () => {
      const result = await addPricingOptionAction(record.proposal.id, scenarioId);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success('Opção de preço adicionada.');
      router.refresh();
    });

  const removeOption = (optionId: string) => {
    if (!window.confirm('Remover esta opção de preço da proposta?')) return;
    startTransition(async () => {
      const result = await removePricingOptionAction(record.proposal.id, optionId);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success('Opção removida.');
      router.refresh();
    });
  };

  const recommend = (optionId: string) =>
    startTransition(async () => {
      const result = await updatePricingOptionAction(record.proposal.id, optionId, {
        isRecommended: true,
      });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      router.refresh();
    });

  const sync = (optionId: string) =>
    startTransition(async () => {
      const result = await syncPricingOptionAction(record.proposal.id, optionId);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success('Totais recarregados da precificação.');
      router.refresh();
    });

  return (
    <div className="space-y-5">
      <EditorCard
        title="Opções de preço"
        origin="Cada opção aponta para um cenário de precificação e congela os totais"
        actions={
          availableScenarios.length > 0 && !locked ? (
            <select
              defaultValue=""
              onChange={(event) => {
                if (event.target.value) addOption(event.target.value);
                event.target.value = '';
              }}
              disabled={pending}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 outline-none focus:border-brand-blue"
            >
              <option value="">+ Adicionar cenário…</option>
              {availableScenarios.map((scenario) => (
                <option key={scenario.id} value={scenario.id}>
                  {scenario.scenarioName} — {brl(scenario.grandTotal)}
                </option>
              ))}
            </select>
          ) : null
        }
      >
        {record.pricingOptions.length === 0 ? (
          <Notice tone="warning">
            Nenhuma opção de preço. A proposta não é publicável sem ao menos uma — salve uma
            precificação para este orçamento e adicione aqui.
          </Notice>
        ) : (
          <ul className="space-y-2">
            {record.pricingOptions.map((item) => (
              <li key={item.id}>
                <div
                  className={`flex flex-wrap items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors ${
                    item.id === activeOptionId
                      ? 'border-brand-blue bg-brand-blue/5'
                      : 'border-slate-200'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => setActiveOptionId(item.id)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <span className="block truncate text-sm font-medium text-slate-700">
                      {item.label}
                      {item.isRecommended ? (
                        <span className="ml-2 rounded bg-emerald-100 px-1.5 py-0.5 text-xs text-emerald-700">
                          recomendada
                        </span>
                      ) : null}
                    </span>
                    <span className="block text-xs text-slate-400">
                      Material {brl(item.materialTotal)} · Serviço {brl(item.laborTotal)} ·{' '}
                      {item.paymentTerms.length} parcela(s)
                    </span>
                  </button>

                  <span className="shrink-0 text-sm font-semibold tabular-nums text-brand-navy">
                    {brl(item.grandTotal)}
                  </span>

                  {!locked ? (
                    <span className="flex shrink-0 items-center gap-1">
                      {item.isRecommended ? null : (
                        <button
                          type="button"
                          onClick={() => recommend(item.id)}
                          disabled={pending}
                          title="Marcar como recomendada"
                          className="rounded-lg border border-slate-200 p-2 text-slate-400 hover:border-emerald-300 hover:text-emerald-600"
                        >
                          <Star className="h-4 w-4" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => sync(item.id)}
                        disabled={pending}
                        title="Recarregar totais da precificação"
                        className="rounded-lg border border-slate-200 p-2 text-slate-400 hover:border-brand-blue hover:text-brand-navy"
                      >
                        <RefreshCw className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => removeOption(item.id)}
                        disabled={pending}
                        title="Remover opção"
                        className="rounded-lg border border-slate-200 p-2 text-slate-400 hover:border-red-300 hover:text-red-500"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </span>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </EditorCard>

      {option ? (
        <>
          {sectionKey === 'valores_globais' || sectionKey === 'investimento_por_unidade' ? (
            <GlobaisCard option={option} origin={origin} unitsLabel={record.proposal.unitsLabel} />
          ) : null}

          {sectionKey === 'valores_por_segmento' ? (
            <SegmentosCard context={context} option={option} origin={origin} />
          ) : null}

          {sectionKey === 'condicoes_pagamento' ? (
            <PagamentoCard context={context} option={option} origin={origin} />
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function GlobaisCard({
  option,
  origin,
  unitsLabel,
}: {
  option: ProposalPricingOptionRow;
  origin?: string;
  unitsLabel: string | null;
}) {
  const units = option.unitsCount;

  return (
    <EditorCard title={`Valores globais — ${option.label}`} origin={origin}>
      <dl className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-lg bg-slate-50 p-4">
          <dt className="text-xs uppercase tracking-wide text-slate-400">Materiais</dt>
          <dd className="mt-1 text-lg font-semibold tabular-nums text-brand-navy">
            {brl(option.materialTotal)}
          </dd>
          <p className="mt-1 text-xs text-slate-400">Faturados direto do fornecedor</p>
        </div>
        <div className="rounded-lg bg-slate-50 p-4">
          <dt className="text-xs uppercase tracking-wide text-slate-400">Mão de obra / serviços</dt>
          <dd className="mt-1 text-lg font-semibold tabular-nums text-brand-navy">
            {brl(option.laborTotal)}
          </dd>
          <p className="mt-1 text-xs text-slate-400">Base do parcelamento</p>
        </div>
        <div className="rounded-lg bg-brand-navy p-4">
          <dt className="text-xs uppercase tracking-wide text-white/60">Total</dt>
          <dd className="mt-1 text-lg font-semibold tabular-nums text-white">
            {brl(option.grandTotal)}
          </dd>
        </div>
      </dl>

      <div className="mt-4">
        {units && units > 0 ? (
          <Notice>
            Investimento por {unitsLabel ?? option.unitsLabel ?? 'unidade'}:{' '}
            <strong>{brl(option.amountPerUnit ?? option.grandTotal / units)}</strong> ({units}{' '}
            {unitsLabel ?? option.unitsLabel ?? 'unidades'})
          </Notice>
        ) : (
          <Notice>
            Sem quantidade de unidades definida — a seção &ldquo;Investimento por Unidade&rdquo; sai
            vazia. Informe na seção Capa.
          </Notice>
        )}
      </div>

      <p className="mt-4 text-xs text-slate-400">
        Estes valores vêm congelados da precificação. Para alterá-los, edite a precificação e use
        &ldquo;Recarregar totais&rdquo; na opção.
      </p>
    </EditorCard>
  );
}

interface SegmentDraft {
  key: string;
  segmentId: string | null;
  label: string;
  material: string;
  labor: string;
}

function SegmentosCard({
  context,
  option,
  origin,
}: {
  context: PanelProps['context'];
  option: ProposalPricingOptionRow;
  origin?: string;
}) {
  const { record, segments: segmentChoices, locked } = context;
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [rows, setRows] = useState<SegmentDraft[]>(() =>
    option.segments
      .slice()
      .sort((a, b) => a.orderIndex - b.orderIndex)
      .map((row) => ({
        key: row.id,
        segmentId: row.segmentId,
        label: row.label,
        material: String(row.materialAmount),
        labor: String(row.laborAmount),
      })),
  );

  const sums = useMemo(() => {
    const material = rows.reduce((sum, row) => sum + (Number(row.material) || 0), 0);
    const labor = rows.reduce((sum, row) => sum + (Number(row.labor) || 0), 0);
    return { material, labor, total: material + labor };
  }, [rows]);

  const materialDrift = sums.material - option.materialTotal;
  const laborDrift = sums.labor - option.laborTotal;
  const balanced = Math.abs(materialDrift) < 0.05 && Math.abs(laborDrift) < 0.05;

  const save = () =>
    startTransition(async () => {
      const result = await saveSegmentTotalsAction(
        record.proposal.id,
        option.id,
        rows.map((row, index) => ({
          segmentId: row.segmentId,
          label: row.label,
          materialAmount: Number(row.material) || 0,
          laborAmount: Number(row.labor) || 0,
          order: index + 1,
        })),
      );

      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success('Valores por segmento salvos.');
      router.refresh();
    });

  return (
    <EditorCard
      title={`Valores por segmento — ${option.label}`}
      origin={origin}
      actions={
        <>
          <button
            type="button"
            onClick={() =>
              setRows((current) => [
                ...current,
                {
                  key: `novo-${current.length}-${Date.now()}`,
                  segmentId: null,
                  label: '',
                  material: '0',
                  labor: '0',
                },
              ])
            }
            disabled={locked}
            className={buttonClass}
          >
            <Plus className="h-4 w-4" />
            Linha
          </button>
          <button
            type="button"
            onClick={save}
            disabled={locked || pending}
            className={primaryButtonClass}
          >
            {pending ? 'Salvando…' : 'Salvar'}
          </button>
        </>
      }
    >
      {rows.length === 0 ? (
        <Notice>
          Nenhum segmento. A seção some do PDF — ou adicione linhas aqui, ou marque o segmento dos
          postes no orçamento e recrie a opção de preço.
        </Notice>
      ) : (
        <div className="space-y-3">
          <Notice tone="warning">
            A mão de obra nasce rateada pelo peso de material de cada segmento, porque o valor de
            serviço não é negociado por segmento na precificação. Nas propostas reais essa
            proporção varia muito entre segmentos — <strong>revise linha a linha antes de
            publicar</strong>.
          </Notice>
          <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-400">
                <th className="pb-2 pr-3 font-semibold">Segmento</th>
                <th className="pb-2 pr-3 text-right font-semibold">Material</th>
                <th className="pb-2 pr-3 text-right font-semibold">Mão de obra</th>
                <th className="pb-2 pr-3 text-right font-semibold">Total</th>
                <th className="pb-2 pr-3 text-right font-semibold">%</th>
                <th className="pb-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => {
                const material = Number(row.material) || 0;
                const labor = Number(row.labor) || 0;
                const total = material + labor;

                return (
                  <tr key={row.key} className="border-b border-slate-100">
                    <td className="py-1.5 pr-3">
                      <input
                        value={row.label}
                        list="proposta-segmentos"
                        onChange={(event) => {
                          const label = event.target.value;
                          const match = segmentChoices.find((choice) => choice.label === label);
                          setRows((current) =>
                            current.map((item, i) =>
                              i === index
                                ? { ...item, label, segmentId: match?.segmentId ?? item.segmentId }
                                : item,
                            ),
                          );
                        }}
                        disabled={locked}
                        className={inputClass}
                      />
                    </td>
                    <td className="py-1.5 pr-3">
                      <input
                        type="number"
                        step="0.01"
                        min={0}
                        value={row.material}
                        onChange={(event) =>
                          setRows((current) =>
                            current.map((item, i) =>
                              i === index ? { ...item, material: event.target.value } : item,
                            ),
                          )
                        }
                        disabled={locked}
                        className={`${inputClass} text-right tabular-nums`}
                      />
                    </td>
                    <td className="py-1.5 pr-3">
                      <input
                        type="number"
                        step="0.01"
                        min={0}
                        value={row.labor}
                        onChange={(event) =>
                          setRows((current) =>
                            current.map((item, i) =>
                              i === index ? { ...item, labor: event.target.value } : item,
                            ),
                          )
                        }
                        disabled={locked}
                        className={`${inputClass} text-right tabular-nums`}
                      />
                    </td>
                    <td className="py-1.5 pr-3 text-right tabular-nums text-slate-700">{brl(total)}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums text-slate-500">
                      {pct(option.grandTotal > 0 ? (total / option.grandTotal) * 100 : 0)}
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

            <datalist id="proposta-segmentos">
              {segmentChoices.map((choice) => (
                <option key={choice.label} value={choice.label} />
              ))}
            </datalist>
          </div>
        </div>
      )}

      <div className="mt-4">
        {balanced ? (
          <Notice>
            Os segmentos fecham com a opção: {brl(sums.material)} de material e {brl(sums.labor)} de
            mão de obra.
          </Notice>
        ) : (
          <Notice tone="warning">
            Os segmentos não fecham com os totais da opção. Material:{' '}
            {materialDrift > 0 ? 'sobra' : 'falta'} {brl(Math.abs(materialDrift))}. Mão de obra:{' '}
            {laborDrift > 0 ? 'sobra' : 'falta'} {brl(Math.abs(laborDrift))}. Publicar com essa
            diferença é bloqueado.
          </Notice>
        )}
      </div>
    </EditorCard>
  );
}

interface TermDraft {
  key: string;
  percent: string;
  dueLabel: string;
  dueDate: string;
}

function PagamentoCard({
  context,
  option,
  origin,
}: {
  context: PanelProps['context'];
  option: ProposalPricingOptionRow;
  origin?: string;
}) {
  const { record, locked } = context;
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [installments, setInstallments] = useState('10');
  const [hasDownPayment, setHasDownPayment] = useState(true);
  const [intervalDays, setIntervalDays] = useState('30');
  const [firstDueDate, setFirstDueDate] = useState('');

  const [rows, setRows] = useState<TermDraft[]>(() =>
    option.paymentTerms
      .slice()
      .sort((a, b) => a.orderIndex - b.orderIndex)
      .map((term) => ({
        key: term.id,
        percent: String(term.percent),
        dueLabel: term.dueLabel,
        dueDate: term.dueDate ?? '',
      })),
  );

  const percentSum = rows.reduce((sum, row) => sum + (Number(row.percent) || 0), 0);
  const amountSum = rows.reduce(
    (sum, row) => sum + ((Number(row.percent) || 0) / 100) * option.laborTotal,
    0,
  );

  const generate = () =>
    startTransition(async () => {
      const result = await generatePaymentTermsAction(record.proposal.id, option.id, {
        installments: Number(installments) || 1,
        hasDownPayment,
        intervalDays: Number(intervalDays) || 0,
        firstDueDate: firstDueDate || null,
      });

      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success('Parcelamento gerado.');
      router.refresh();
    });

  const save = () =>
    startTransition(async () => {
      const result = await savePaymentTermsAction(
        record.proposal.id,
        option.id,
        rows.map((row, index) => ({
          order: index + 1,
          percent: Number(row.percent) || 0,
          dueLabel: row.dueLabel,
          dueDate: row.dueDate || null,
        })),
      );

      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success('Condições de pagamento salvas.');
      router.refresh();
    });

  return (
    <EditorCard
      title={`Condições de pagamento — ${option.label}`}
      origin={origin}
      actions={
        <button type="button" onClick={save} disabled={locked || pending} className={primaryButtonClass}>
          {pending ? 'Salvando…' : 'Salvar'}
        </button>
      }
    >
      <div className="mb-4 flex flex-wrap items-end gap-3 rounded-lg bg-slate-50 p-3">
        <label className="block w-24">
          <FieldLabel>Parcelas</FieldLabel>
          <input
            type="number"
            min={1}
            max={60}
            value={installments}
            onChange={(event) => setInstallments(event.target.value)}
            disabled={locked}
            className={inputClass}
          />
        </label>
        <label className="block w-28">
          <FieldLabel hint="dias">Intervalo</FieldLabel>
          <input
            type="number"
            min={0}
            value={intervalDays}
            onChange={(event) => setIntervalDays(event.target.value)}
            disabled={locked}
            className={inputClass}
          />
        </label>
        <label className="block w-44">
          <FieldLabel hint="opcional">1º vencimento</FieldLabel>
          <input
            type="date"
            value={firstDueDate}
            onChange={(event) => setFirstDueDate(event.target.value)}
            disabled={locked}
            className={inputClass}
          />
        </label>
        <label className="mb-2 flex items-center gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={hasDownPayment}
            onChange={(event) => setHasDownPayment(event.target.checked)}
            disabled={locked}
            className="h-4 w-4 accent-[#1D3140]"
          />
          Com entrada
        </label>
        <button type="button" onClick={generate} disabled={locked || pending} className={buttonClass}>
          <Wand2 className="h-4 w-4" />
          Gerar
        </button>
      </div>

      <Notice>
        As parcelas incidem sobre a mão de obra desta opção — <strong>{brl(option.laborTotal)}</strong>.
        Material é faturado direto pelo fornecedor e nunca entra no parcelamento.
      </Notice>

      {rows.length > 0 ? (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[600px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-400">
                <th className="pb-2 pr-3 font-semibold">#</th>
                <th className="pb-2 pr-3 font-semibold">Vencimento (texto)</th>
                <th className="pb-2 pr-3 text-right font-semibold">%</th>
                <th className="pb-2 pr-3 text-right font-semibold">Valor</th>
                <th className="pb-2 pr-3 font-semibold">Data</th>
                <th className="pb-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={row.key} className="border-b border-slate-100">
                  <td className="py-1.5 pr-3 tabular-nums text-slate-400">{index + 1}</td>
                  <td className="py-1.5 pr-3">
                    <input
                      value={row.dueLabel}
                      onChange={(event) =>
                        setRows((current) =>
                          current.map((item, i) =>
                            i === index ? { ...item, dueLabel: event.target.value } : item,
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
                      max={100}
                      value={row.percent}
                      onChange={(event) =>
                        setRows((current) =>
                          current.map((item, i) =>
                            i === index ? { ...item, percent: event.target.value } : item,
                          ),
                        )
                      }
                      disabled={locked}
                      className={`${inputClass} text-right tabular-nums`}
                    />
                  </td>
                  <td className="py-1.5 pr-3 text-right tabular-nums text-slate-700">
                    {brl(((Number(row.percent) || 0) / 100) * option.laborTotal)}
                  </td>
                  <td className="py-1.5 pr-3">
                    <input
                      type="date"
                      value={row.dueDate}
                      onChange={(event) =>
                        setRows((current) =>
                          current.map((item, i) =>
                            i === index ? { ...item, dueDate: event.target.value } : item,
                          ),
                        )
                      }
                      disabled={locked}
                      className={inputClass}
                    />
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
              ))}
            </tbody>
          </table>

          <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
            <span
              className={`tabular-nums ${
                Math.abs(percentSum - 100) < 0.06 ? 'text-slate-500' : 'font-medium text-amber-600'
              }`}
            >
              Soma dos percentuais: {pct(percentSum)}
            </span>
            <span className="tabular-nums text-slate-500">Soma dos valores: {brl(amountSum)}</span>
          </div>
        </div>
      ) : (
        <div className="mt-4">
          <Notice tone="warning">
            Nenhuma parcela gerada. Com a seção &ldquo;Condições de Pagamento&rdquo; ligada, publicar
            fica bloqueado até existir parcelamento.
          </Notice>
        </div>
      )}
    </EditorCard>
  );
}
