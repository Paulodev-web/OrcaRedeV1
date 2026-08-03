"use client";

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Plus, Sparkles, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import {
  planProposalDraftAction,
  runProposalDraftStepAction,
  saveAiBriefingAction,
  updateProposalTextAction,
} from '@/actions/proposals';
import { getAiBriefing } from '@/services/proposals/aiBriefing';
import type { ProposalRichBlock } from '@/types/proposal';

import { RichBlockEditor } from '../RichBlockEditor';
import {
  EditorCard,
  FieldLabel,
  Notice,
  buttonClass,
  inputClass,
  primaryButtonClass,
  textareaClass,
} from '../shared';
import type { PanelProps } from './types';

/**
 * Descrição das atividades — onde a regra de ouro fica visível.
 *
 * Os `facts` de cada grupo (quantitativos do orçamento) são exibidos como dado
 * fechado e NÃO são editáveis aqui: eles são a âncora que impede o texto de
 * dizer "05 (seis) transformadores". Editar quantitativo se faz no orçamento.
 */
export function AtividadesPanel({ context, origin }: PanelProps) {
  const { record, locked } = context;
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [progress, setProgress] = useState<string | null>(null);

  const [briefing, setBriefing] = useState(() => getAiBriefing(record));
  const [activities, setActivities] = useState(record.proposal.activities);

  const saveBriefing = () =>
    startTransition(async () => {
      const result = await saveAiBriefingAction(record.proposal.id, briefing);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success('Briefing salvo.');
      router.refresh();
    });

  const saveActivities = () =>
    startTransition(async () => {
      const result = await updateProposalTextAction(record.proposal.id, {
        activities: activities.map((group, index) => ({
          order: group.order || index + 1,
          title: group.title,
          intro: group.intro,
          items: group.items,
          note: group.note,
        })),
      });

      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success('Atividades salvas.');
      router.refresh();
    });

  /**
   * Rascunho por IA, etapa a etapa. Rodar em série no navegador (e não tudo num
   * request) é o que mantém cada invocação longe do teto de 60s do Hobby, e dá
   * ao usuário um progresso real em vez de uma barra fingida.
   */
  const generateDraft = () => {
    if (
      !window.confirm(
        'Gerar o rascunho por IA sobrescreve o texto das seções escritas por ela (capa, institucional, atividades, faturamento e considerações). Continuar?',
      )
    ) {
      return;
    }

    startTransition(async () => {
      const plan = await planProposalDraftAction(record.proposal.id);
      if (!plan.success) {
        toast.error(plan.error, { duration: 10000 });
        return;
      }

      for (const warning of plan.data.warnings) toast.warning(warning, { duration: 8000 });

      const total = plan.data.steps.length;
      let violations = 0;

      for (const [index, step] of plan.data.steps.entries()) {
        setProgress(`Etapa ${index + 1}/${total}: ${step.label}`);

        const result = await runProposalDraftStepAction(record.proposal.id, step.index);
        if (!result.success) {
          setProgress(null);
          toast.error(result.error, { duration: 12000 });
          router.refresh();
          return;
        }

        violations += result.data.violations.length;
      }

      setProgress(null);
      toast.success(
        violations === 0
          ? 'Rascunho gerado. Revise antes de publicar.'
          : `Rascunho gerado com ${violations} ressalva(s) do guardrail de números — confira os quantitativos.`,
        { duration: 10000 },
      );
      router.refresh();
    });
  };

  const patchActivity = (index: number, patch: Partial<(typeof activities)[number]>) =>
    setActivities((current) => current.map((group, i) => (i === index ? { ...group, ...patch } : group)));

  return (
    <div className="space-y-5">
      <EditorCard
        title="Briefing da IA"
        origin="O que o orçamento não sabe: tipo de obra, ambiente e normas citáveis"
        actions={
          <>
            <button
              type="button"
              onClick={saveBriefing}
              disabled={locked || pending}
              className={buttonClass}
            >
              Salvar briefing
            </button>
            <button
              type="button"
              onClick={generateDraft}
              disabled={locked || pending}
              className={primaryButtonClass}
            >
              <Sparkles className="h-4 w-4" />
              {pending && progress ? 'Gerando…' : 'Gerar rascunho'}
            </button>
          </>
        }
      >
        {progress ? (
          <div className="mb-4">
            <Notice>{progress}</Notice>
          </div>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block sm:col-span-2">
            <FieldLabel hint="ex.: condomínio residencial com rede subterrânea">Tipo de obra</FieldLabel>
            <input
              value={briefing.workType}
              onChange={(event) => setBriefing({ ...briefing, workType: event.target.value })}
              disabled={locked}
              className={inputClass}
            />
          </label>

          <label className="block">
            <FieldLabel>Nome do empreendimento</FieldLabel>
            <input
              value={briefing.developmentName}
              onChange={(event) => setBriefing({ ...briefing, developmentName: event.target.value })}
              disabled={locked}
              className={inputClass}
            />
          </label>

          <label className="block">
            <FieldLabel hint="sigla">UF</FieldLabel>
            <input
              value={briefing.state}
              onChange={(event) => setBriefing({ ...briefing, state: event.target.value })}
              maxLength={2}
              disabled={locked}
              className={inputClass}
            />
          </label>

          <label className="block">
            <FieldLabel hint="em branco usa a do orçamento">Concessionária</FieldLabel>
            <input
              value={briefing.utility}
              onChange={(event) => setBriefing({ ...briefing, utility: event.target.value })}
              disabled={locked}
              className={inputClass}
            />
          </label>

          <label className="block">
            <FieldLabel hint="muda a especificação técnica">Condicionantes de ambiente</FieldLabel>
            <input
              value={briefing.environmentConstraints}
              onChange={(event) =>
                setBriefing({ ...briefing, environmentConstraints: event.target.value })
              }
              placeholder="ex.: orla marítima — corrosão classe C5"
              disabled={locked}
              className={inputClass}
            />
          </label>

          <label className="block sm:col-span-2">
            <FieldLabel hint="entram na prosa">Anotações do orçamentista</FieldLabel>
            <textarea
              value={briefing.authorNotes}
              onChange={(event) => setBriefing({ ...briefing, authorNotes: event.target.value })}
              disabled={locked}
              className={textareaClass}
            />
          </label>
        </div>

        <div className="mt-5">
          <div className="mb-2 flex items-center justify-between">
            <FieldLabel hint="a IA só pode citar normas desta lista">Normas citáveis</FieldLabel>
            <button
              type="button"
              onClick={() =>
                setBriefing({
                  ...briefing,
                  technicalReferences: [
                    ...briefing.technicalReferences,
                    { code: '', issuer: '', subject: '', revision: null },
                  ],
                })
              }
              disabled={locked}
              className={`${buttonClass} px-2.5 py-1.5 text-xs`}
            >
              <Plus className="h-3.5 w-3.5" />
              Norma
            </button>
          </div>

          {briefing.technicalReferences.length === 0 ? (
            <Notice tone="warning">
              Sem norma cadastrada, o texto sai sem citação normativa — o guardrail rejeita qualquer
              código que não esteja aqui, e é isso que impede a IA de inventar &ldquo;NT.00012&rdquo;.
            </Notice>
          ) : (
            <ul className="space-y-2">
              {briefing.technicalReferences.map((reference, index) => (
                <li key={index} className="grid gap-2 sm:grid-cols-[1fr_1fr_2fr_1fr_auto]">
                  <input
                    value={reference.code}
                    onChange={(event) =>
                      setBriefing({
                        ...briefing,
                        technicalReferences: briefing.technicalReferences.map((item, i) =>
                          i === index ? { ...item, code: event.target.value } : item,
                        ),
                      })
                    }
                    placeholder="NT.00004"
                    disabled={locked}
                    className={inputClass}
                  />
                  <input
                    value={reference.issuer}
                    onChange={(event) =>
                      setBriefing({
                        ...briefing,
                        technicalReferences: briefing.technicalReferences.map((item, i) =>
                          i === index ? { ...item, issuer: event.target.value } : item,
                        ),
                      })
                    }
                    placeholder="Equatorial"
                    disabled={locked}
                    className={inputClass}
                  />
                  <input
                    value={reference.subject}
                    onChange={(event) =>
                      setBriefing({
                        ...briefing,
                        technicalReferences: briefing.technicalReferences.map((item, i) =>
                          i === index ? { ...item, subject: event.target.value } : item,
                        ),
                      })
                    }
                    placeholder="Do que trata"
                    disabled={locked}
                    className={inputClass}
                  />
                  <input
                    value={reference.revision ?? ''}
                    onChange={(event) =>
                      setBriefing({
                        ...briefing,
                        technicalReferences: briefing.technicalReferences.map((item, i) =>
                          i === index ? { ...item, revision: event.target.value || null } : item,
                        ),
                      })
                    }
                    placeholder="Rev. 03/2025"
                    disabled={locked}
                    className={inputClass}
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setBriefing({
                        ...briefing,
                        technicalReferences: briefing.technicalReferences.filter((_, i) => i !== index),
                      })
                    }
                    disabled={locked}
                    className="rounded-lg border border-slate-200 px-2 text-slate-400 transition-colors hover:border-red-300 hover:text-red-500"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </EditorCard>

      <EditorCard
        title="Grupos de atividade"
        origin={origin}
        actions={
          <button
            type="button"
            onClick={saveActivities}
            disabled={locked || pending}
            className={primaryButtonClass}
          >
            {pending ? 'Salvando…' : 'Salvar atividades'}
          </button>
        }
      >
        {activities.length === 0 ? (
          <Notice>
            Nenhum grupo de atividade ainda. Preencha o briefing e clique em &ldquo;Gerar
            rascunho&rdquo; — os grupos saem dos segmentos de obra do orçamento.
          </Notice>
        ) : (
          <div className="space-y-6">
            {activities.map((group, index) => (
              <div key={group.order} className="rounded-lg border border-slate-200 p-4">
                <label className="block">
                  <FieldLabel>Título do grupo {index + 1}</FieldLabel>
                  <input
                    value={group.title}
                    onChange={(event) => patchActivity(index, { title: event.target.value })}
                    disabled={locked}
                    className={inputClass}
                  />
                </label>

                <label className="mt-3 block">
                  <FieldLabel>Introdução</FieldLabel>
                  <textarea
                    value={group.intro}
                    onChange={(event) => patchActivity(index, { intro: event.target.value })}
                    disabled={locked}
                    className={textareaClass}
                  />
                </label>

                <div className="mt-3">
                  <FieldLabel hint="um serviço por linha">Serviços</FieldLabel>
                  <div className="space-y-2">
                    {group.items.map((item, itemIndex) => (
                      <div key={itemIndex} className="flex gap-2">
                        <textarea
                          value={item}
                          onChange={(event) =>
                            patchActivity(index, {
                              items: group.items.map((row, i) =>
                                i === itemIndex ? event.target.value : row,
                              ),
                            })
                          }
                          disabled={locked}
                          className={`${textareaClass} min-h-[64px]`}
                        />
                        <button
                          type="button"
                          onClick={() =>
                            patchActivity(index, {
                              items: group.items.filter((_, i) => i !== itemIndex),
                            })
                          }
                          disabled={locked}
                          className="h-9 shrink-0 rounded-lg border border-slate-200 px-2 text-slate-400 transition-colors hover:border-red-300 hover:text-red-500"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => patchActivity(index, { items: [...group.items, ''] })}
                      disabled={locked}
                      className={`${buttonClass} px-2.5 py-1.5 text-xs`}
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Serviço
                    </button>
                  </div>
                </div>

                <div className="mt-4">
                  <RichBlockEditor
                    label="Observação técnica"
                    hint="opcional"
                    value={group.note}
                    onChange={(note: ProposalRichBlock | null) => patchActivity(index, { note })}
                    proposalId={record.proposal.id}
                    sectionKey="descricao_atividades"
                    disabled={locked}
                  />
                </div>

                {group.facts.length > 0 ? (
                  <div className="mt-4 rounded-lg bg-slate-50 p-3">
                    <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Quantitativos do orçamento (não editáveis)
                    </p>
                    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
                      {group.facts.map((fact, factIndex) => (
                        <li key={factIndex} className="tabular-nums">
                          {fact.isApproximate ? '≈ ' : ''}
                          {fact.quantity} {fact.unit} — {fact.label}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </EditorCard>
    </div>
  );
}
