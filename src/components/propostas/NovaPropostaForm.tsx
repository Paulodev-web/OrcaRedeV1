"use client";

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';
import { AlertTriangle, FilePlus2 } from 'lucide-react';
import { toast } from 'sonner';

import { createProposalAction } from '@/actions/proposals';
import type { ProposalTemplateSummary } from '@/services/proposals/templates';

import { PropostasShell } from './PropostasShell';
import {
  FieldLabel,
  Notice,
  brl,
  buttonClass,
  inputClass,
  primaryButtonClass,
} from './shared';

export interface BudgetChoice {
  id: string;
  name: string;
  clientName: string | null;
  city: string | null;
  status: string | null;
}

export interface ScenarioChoice {
  id: string;
  budgetId: string;
  scenarioName: string;
  isPrimary: boolean;
  materialTotal: number;
  laborTotal: number;
  grandTotal: number;
}

export interface ResponsibleChoice {
  id: string;
  fullName: string;
  crea: string;
}

export function NovaPropostaForm({
  budgets,
  scenarios,
  responsibles,
  templates,
  initialBudgetId,
}: {
  budgets: BudgetChoice[];
  scenarios: ScenarioChoice[];
  responsibles: ResponsibleChoice[];
  templates: ProposalTemplateSummary[];
  initialBudgetId: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [budgetId, setBudgetId] = useState(
    initialBudgetId && budgets.some((budget) => budget.id === initialBudgetId)
      ? initialBudgetId
      : (budgets[0]?.id ?? ''),
  );
  const [selectedScenarios, setSelectedScenarios] = useState<string[]>([]);
  const [templateId, setTemplateId] = useState(
    templates.find((template) => template.isDefault)?.id ?? templates[0]?.id ?? '',
  );
  const [responsibleId, setResponsibleId] = useState(responsibles[0]?.id ?? '');
  const [unitsCount, setUnitsCount] = useState('');
  const [unitsLabel, setUnitsLabel] = useState('lotes');
  const [validityDate, setValidityDate] = useState('');
  const [proposalNumber, setProposalNumber] = useState('');

  const budgetScenarios = useMemo(
    () => scenarios.filter((scenario) => scenario.budgetId === budgetId),
    [scenarios, budgetId],
  );

  const activeSelection = useMemo(
    () => selectedScenarios.filter((id) => budgetScenarios.some((scenario) => scenario.id === id)),
    [selectedScenarios, budgetScenarios],
  );

  const budget = budgets.find((item) => item.id === budgetId) ?? null;

  const toggleScenario = (id: string) => {
    setSelectedScenarios((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  };

  const handleSubmit = () => {
    if (!budgetId) {
      toast.error('Escolha o orçamento de origem.');
      return;
    }

    startTransition(async () => {
      const result = await createProposalAction({
        budgetId,
        templateId: templateId || null,
        technicalResponsibleId: responsibleId || null,
        // Sem cenário escolhido, a primária do orçamento entra sozinha — é o
        // caminho de menor atrito, e a opção pode ser trocada no editor.
        scenarioIds:
          activeSelection.length > 0
            ? activeSelection
            : budgetScenarios.filter((scenario) => scenario.isPrimary).map((scenario) => scenario.id),
        proposalNumber: proposalNumber ? Number(proposalNumber) : null,
        unitsCount: unitsCount ? Number(unitsCount) : null,
        unitsLabel: unitsLabel || null,
        validityDate: validityDate || null,
      });

      if (!result.success) {
        toast.error(result.error);
        return;
      }

      for (const warning of result.data.warnings) toast.warning(warning);
      toast.success('Proposta criada.');
      router.push(`/propostas/${result.data.proposalId}`);
    });
  };

  return (
    <PropostasShell
      title="Nova proposta"
      description="A proposta congela o material do orçamento e os totais da precificação escolhida."
      icon={FilePlus2}
      breadcrumb={[{ label: 'Propostas', href: '/propostas' }, { label: 'Nova' }]}
    >
      <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 lg:px-8">
        {budgets.length === 0 ? (
          <Notice tone="warning">
            Nenhum orçamento encontrado. Crie um orçamento antes de montar a proposta.
          </Notice>
        ) : (
          <div className="space-y-5">
            <section className="rounded-xl border border-slate-200 bg-surface p-5 shadow-sm">
              <label className="block">
                <FieldLabel hint="a proposta herda cliente, cidade e materiais dele">
                  Orçamento de origem
                </FieldLabel>
                <select
                  value={budgetId}
                  onChange={(event) => {
                    setBudgetId(event.target.value);
                    setSelectedScenarios([]);
                  }}
                  className={inputClass}
                >
                  {budgets.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                      {item.clientName ? ` — ${item.clientName}` : ''}
                    </option>
                  ))}
                </select>
              </label>

              {budget ? (
                <p className="mt-2 text-xs text-slate-400">
                  {[budget.clientName, budget.city, budget.status].filter(Boolean).join(' · ')}
                </p>
              ) : null}
            </section>

            <section className="rounded-xl border border-slate-200 bg-surface p-5 shadow-sm">
              <FieldLabel hint="uma proposta pode apresentar mais de uma opção ao cliente">
                Cenários de precificação
              </FieldLabel>

              {budgetScenarios.length === 0 ? (
                <Notice tone="warning">
                  <span className="flex items-start gap-2">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>
                      Este orçamento ainda não tem precificação salva. A proposta pode ser criada sem
                      opção de preço, mas só é publicável depois que houver uma.{' '}
                      <Link
                        href="/tools/precificacao"
                        className="font-medium text-brand-blue-deep underline underline-offset-2"
                      >
                        Abrir Precificação
                      </Link>
                    </span>
                  </span>
                </Notice>
              ) : (
                <ul className="mt-1 space-y-2">
                  {budgetScenarios.map((scenario) => {
                    const checked =
                      activeSelection.includes(scenario.id) ||
                      (activeSelection.length === 0 && scenario.isPrimary);

                    return (
                      <li key={scenario.id}>
                        <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-slate-200 px-3 py-2.5 transition-colors hover:border-brand-blue/50">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleScenario(scenario.id)}
                            className="h-4 w-4 accent-accent-600"
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium text-slate-700">
                              {scenario.scenarioName}
                              {scenario.isPrimary ? (
                                <span className="ml-2 rounded bg-brand-blue/15 px-1.5 py-0.5 text-xs text-brand-navy">
                                  principal
                                </span>
                              ) : null}
                            </span>
                            <span className="block text-xs text-slate-400">
                              Material {brl(scenario.materialTotal)} · Serviço {brl(scenario.laborTotal)}
                            </span>
                          </span>
                          <span className="shrink-0 text-sm font-semibold tabular-nums text-brand-navy">
                            {brl(scenario.grandTotal)}
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            <section className="grid gap-4 rounded-xl border border-slate-200 bg-surface p-5 shadow-sm sm:grid-cols-2">
              <label className="block">
                <FieldLabel hint="copia texto institucional e matriz">Template</FieldLabel>
                <select
                  value={templateId}
                  onChange={(event) => setTemplateId(event.target.value)}
                  className={inputClass}
                >
                  <option value="">Sem template</option>
                  {templates.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.name}
                      {template.isDefault ? ' (padrão)' : ''}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <FieldLabel hint="assina o termo de aceite">Responsável técnico</FieldLabel>
                <select
                  value={responsibleId}
                  onChange={(event) => setResponsibleId(event.target.value)}
                  className={inputClass}
                >
                  <option value="">Definir depois</option>
                  {responsibles.map((responsible) => (
                    <option key={responsible.id} value={responsible.id}>
                      {responsible.fullName} — {responsible.crea}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <FieldLabel hint="divide o total do investimento">Unidades</FieldLabel>
                <input
                  type="number"
                  min={1}
                  value={unitsCount}
                  onChange={(event) => setUnitsCount(event.target.value)}
                  placeholder="ex.: 173"
                  className={inputClass}
                />
              </label>

              <label className="block">
                <FieldLabel>Rótulo da unidade</FieldLabel>
                <input
                  value={unitsLabel}
                  onChange={(event) => setUnitsLabel(event.target.value)}
                  placeholder="lotes, unidades, apartamentos"
                  className={inputClass}
                />
              </label>

              <label className="block">
                <FieldLabel hint="informativa; não expira o link">Validade</FieldLabel>
                <input
                  type="date"
                  value={validityDate}
                  onChange={(event) => setValidityDate(event.target.value)}
                  className={inputClass}
                />
              </label>

              <label className="block">
                <FieldLabel hint="em branco segue a numeração">Número da proposta</FieldLabel>
                <input
                  type="number"
                  min={1}
                  value={proposalNumber}
                  onChange={(event) => setProposalNumber(event.target.value)}
                  placeholder="automático"
                  className={inputClass}
                />
              </label>
            </section>

            <div className="flex items-center justify-end gap-3">
              <Link href="/propostas" className={buttonClass}>
                Cancelar
              </Link>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={pending || !budgetId}
                className={primaryButtonClass}
              >
                {pending ? 'Criando…' : 'Criar proposta'}
              </button>
            </div>
          </div>
        )}
      </div>
    </PropostasShell>
  );
}
