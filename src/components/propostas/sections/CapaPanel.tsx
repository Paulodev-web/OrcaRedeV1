"use client";

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';

import { updateProposalHeaderAction } from '@/actions/proposals';

import {
  EditorCard,
  FieldLabel,
  Notice,
  inputClass,
  primaryButtonClass,
  toDateInput,
} from '../shared';
import type { PanelProps } from './types';

/** Capa: identificação da proposta. Números e valores não moram aqui. */
export function CapaPanel({ context, origin }: PanelProps) {
  const { record, responsibles, locked } = context;
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [form, setForm] = useState({
    scopeLabel: record.proposal.scopeLabel,
    projectTitle: record.proposal.projectTitle,
    projectSubtitle: record.proposal.projectSubtitle ?? '',
    clientName: record.proposal.clientName,
    city: record.proposal.city,
    issuedAt: toDateInput(record.proposal.issuedAt),
    validityDate: toDateInput(record.proposal.validityDate),
    technicalResponsibleId: record.proposal.technicalResponsibleId ?? '',
    unitsCount: record.proposal.unitsCount ? String(record.proposal.unitsCount) : '',
    unitsLabel: record.proposal.unitsLabel ?? '',
  });

  const set = (key: keyof typeof form, value: string) =>
    setForm((current) => ({ ...current, [key]: value }));

  const save = () => {
    startTransition(async () => {
      const result = await updateProposalHeaderAction(record.proposal.id, {
        scopeLabel: form.scopeLabel,
        projectTitle: form.projectTitle,
        projectSubtitle: form.projectSubtitle || null,
        clientName: form.clientName,
        city: form.city,
        issuedAt: form.issuedAt ? `${form.issuedAt}T12:00:00.000Z` : undefined,
        validityDate: form.validityDate || null,
        technicalResponsibleId: form.technicalResponsibleId || null,
        unitsCount: form.unitsCount ? Number(form.unitsCount) : null,
        unitsLabel: form.unitsLabel || null,
      });

      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success('Identificação salva.');
      router.refresh();
    });
  };

  return (
    <EditorCard
      title="Capa e identificação"
      origin={origin}
      actions={
        <button type="button" onClick={save} disabled={locked || pending} className={primaryButtonClass}>
          {pending ? 'Salvando…' : 'Salvar'}
        </button>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block sm:col-span-2">
          <FieldLabel hint="aparece grande na capa">Título do empreendimento</FieldLabel>
          <input
            value={form.projectTitle}
            onChange={(event) => set('projectTitle', event.target.value)}
            disabled={locked}
            className={inputClass}
          />
        </label>

        <label className="block sm:col-span-2">
          <FieldLabel>Subtítulo</FieldLabel>
          <input
            value={form.projectSubtitle}
            onChange={(event) => set('projectSubtitle', event.target.value)}
            placeholder="ex.: COND. RESIDENCIAL — Cyano Private Resort"
            disabled={locked}
            className={inputClass}
          />
        </label>

        <label className="block">
          <FieldLabel hint="rótulo do topo">Tipo de escopo</FieldLabel>
          <input
            value={form.scopeLabel}
            onChange={(event) => set('scopeLabel', event.target.value)}
            disabled={locked}
            className={inputClass}
          />
        </label>

        <label className="block">
          <FieldLabel>Cliente</FieldLabel>
          <input
            value={form.clientName}
            onChange={(event) => set('clientName', event.target.value)}
            disabled={locked}
            className={inputClass}
          />
        </label>

        <label className="block">
          <FieldLabel>Cidade</FieldLabel>
          <input
            value={form.city}
            onChange={(event) => set('city', event.target.value)}
            placeholder="ex.: Osório / RS"
            disabled={locked}
            className={inputClass}
          />
        </label>

        <label className="block">
          <FieldLabel>Data de emissão</FieldLabel>
          <input
            type="date"
            value={form.issuedAt}
            onChange={(event) => set('issuedAt', event.target.value)}
            disabled={locked}
            className={inputClass}
          />
        </label>

        <label className="block">
          <FieldLabel hint="não expira o link público">Validade</FieldLabel>
          <input
            type="date"
            value={form.validityDate}
            onChange={(event) => set('validityDate', event.target.value)}
            disabled={locked}
            className={inputClass}
          />
        </label>

        <label className="block">
          <FieldLabel hint="assina o termo de aceite">Responsável técnico</FieldLabel>
          <select
            value={form.technicalResponsibleId}
            onChange={(event) => set('technicalResponsibleId', event.target.value)}
            disabled={locked}
            className={inputClass}
          >
            <option value="">Nenhum</option>
            {responsibles.map((responsible) => (
              <option key={responsible.id} value={responsible.id}>
                {responsible.fullName} — {responsible.crea}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <FieldLabel hint="divide o total do investimento">Quantidade de unidades</FieldLabel>
          <input
            type="number"
            min={1}
            value={form.unitsCount}
            onChange={(event) => set('unitsCount', event.target.value)}
            disabled={locked}
            className={inputClass}
          />
        </label>

        <label className="block">
          <FieldLabel>Rótulo da unidade</FieldLabel>
          <input
            value={form.unitsLabel}
            onChange={(event) => set('unitsLabel', event.target.value)}
            placeholder="lotes, unidades, apartamentos"
            disabled={locked}
            className={inputClass}
          />
        </label>
      </div>

      <div className="mt-4 space-y-2">
        <Notice>
          Proposta <strong>{record.proposal.proposalNumber}.{record.proposal.version}</strong> — gerada a
          partir do orçamento {record.budgetName ? <strong>{record.budgetName}</strong> : 'de origem'}.
          Dados da empresa e logo vêm de Configurações › Empresa.
        </Notice>

        {responsibles.length === 0 ? (
          <Notice tone="warning">
            Nenhum responsável técnico cadastrado. O termo de aceite precisa de nome e CREA —
            cadastre em Configurações › Responsáveis técnicos.
          </Notice>
        ) : null}
      </div>
    </EditorCard>
  );
}
