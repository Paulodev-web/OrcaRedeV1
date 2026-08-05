"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ArrowDown, ArrowUp, Loader2, Plus, Star, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { RichBlockEditor } from "@/components/propostas/RichBlockEditor";
import type { ProposalRichBlock } from "@/types/proposal";
import type { ProposalTemplateRecord } from "@/services/proposals/templates";

import {
  deleteProposalTemplateAction,
  saveProposalTemplateAction,
  type TemplateResponsibilityInput,
  type TemplateSectionInput,
} from "../_actions/proposalTemplates";

const inputClass =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/20";

interface TemplateEditorClientProps {
  /** `null` = criação. */
  template: ProposalTemplateRecord | null;
  defaultSections: TemplateSectionInput[];
  /** Descrição não vem em `ProposalTemplateRecord`; a lista a carrega à parte. */
  description: string | null;
}

function Card({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-surface p-5">
      <h2 className="text-sm font-semibold text-brand-navy">{title}</h2>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  );
}

/**
 * Editor do template de proposta — o "modelo da casa" (§12.2).
 *
 * É daqui que a IA tira o estilo: o texto institucional entra no prompt como
 * referência de voz. Template vazio faz a IA escrever genérico.
 */
export function TemplateEditorClient({
  template,
  defaultSections,
  description: initialDescription,
}: TemplateEditorClientProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [name, setName] = useState(template?.name ?? "");
  const [description, setDescription] = useState(initialDescription ?? "");
  const [scopeLabel, setScopeLabel] = useState(template?.scopeLabel ?? "TIPO DE ESCOPO");
  const [isDefault, setIsDefault] = useState(template?.isDefault ?? false);
  const [sections, setSections] = useState<TemplateSectionInput[]>(
    template?.sections ?? defaultSections,
  );
  const [quemSomos, setQuemSomos] = useState<ProposalRichBlock | null>(
    template?.institutional.quemSomos ?? null,
  );
  const [identidade, setIdentidade] = useState<ProposalRichBlock | null>(
    template?.institutional.identidade ?? null,
  );
  const [compromisso, setCompromisso] = useState<ProposalRichBlock | null>(
    template?.institutional.compromisso ?? null,
  );
  const [diferencial, setDiferencial] = useState<ProposalRichBlock | null>(
    template?.institutional.diferencialOrcaRede ?? null,
  );
  const [billing, setBilling] = useState<ProposalRichBlock | null>(
    template?.billingConditions ?? null,
  );
  const [considerations, setConsiderations] = useState<ProposalRichBlock[]>(
    template?.finalConsiderations ?? [],
  );
  const [closingText, setClosingText] = useState(template?.acceptanceClosingText ?? "");
  const [items, setItems] = useState<TemplateResponsibilityInput[]>(
    template?.responsibilityItems.map(({ description: d, responsible }) => ({
      description: d,
      responsible,
    })) ?? [],
  );

  const move = (index: number, delta: number) => {
    setSections((current) => {
      const next = [...current];
      const target = index + delta;
      if (target < 0 || target >= next.length) return current;
      [next[index], next[target]] = [next[target], next[index]];
      return next.map((section, position) => ({ ...section, order: position + 1 }));
    });
  };

  const save = () => {
    startTransition(async () => {
      const result = await saveProposalTemplateAction({
        id: template?.id,
        name,
        description,
        scopeLabel,
        isDefault,
        sections,
        institutional: {
          quemSomos,
          identidade,
          compromisso,
          diferencialOrcaRede: diferencial,
        },
        billingConditions: billing,
        finalConsiderations: considerations,
        acceptanceClosingText: closingText,
        responsibilityItems: items,
      });

      if (!result.success) {
        toast.error(result.error ?? "Falha ao salvar.");
        return;
      }

      toast.success("Template salvo.");
      if (!template && result.data) {
        router.replace(`/configuracoes/templates-proposta/${result.data.id}`);
      } else {
        router.refresh();
      }
    });
  };

  const remove = () => {
    if (!template) return;
    if (!window.confirm(`Excluir o template "${template.name}"?`)) return;

    startTransition(async () => {
      const result = await deleteProposalTemplateAction(template.id);
      if (result.success) {
        toast.success("Template excluído.");
        router.push("/configuracoes/templates-proposta");
      } else {
        toast.error(result.error ?? "Falha ao excluir.");
      }
    });
  };

  return (
    <div className="space-y-5 pb-24">
      <Card title="Identificação">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Nome do template</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={inputClass}
              placeholder="Ex.: Rede subterrânea — condomínio"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">
              Rótulo do topo da capa
            </label>
            <input
              value={scopeLabel}
              onChange={(e) => setScopeLabel(e.target.value)}
              className={inputClass}
              placeholder="TIPO DE ESCOPO"
            />
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">
            Descrição interna, não aparece na proposta
          </label>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className={inputClass}
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={isDefault}
            onChange={(e) => setIsDefault(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300"
          />
          <Star className="h-4 w-4 text-amber-500" />
          Usar como template padrão das propostas novas
        </label>
      </Card>

      <Card
        title="Texto institucional"
        hint="É a referência de estilo da IA. Quanto mais fiel à sua voz, melhor o rascunho."
      >
        <RichBlockEditor label="Quem somos" value={quemSomos} onChange={setQuemSomos} />
        <RichBlockEditor label="Nossa identidade" value={identidade} onChange={setIdentidade} />
        <RichBlockEditor
          label="Compromisso com a qualidade"
          value={compromisso}
          onChange={setCompromisso}
        />
        <RichBlockEditor
          label="Diferencial tecnológico"
          hint="A página que apresenta o próprio OrçaRede ao cliente."
          value={diferencial}
          onChange={setDiferencial}
        />
      </Card>

      <Card title="Condições de faturamento de materiais">
        <RichBlockEditor label="Bloco de condições" value={billing} onChange={setBilling} />
      </Card>

      <Card
        title="Considerações finais"
        hint="Normas aplicáveis, itens inclusos e o escopo negativo — o que não está contemplado."
      >
        {considerations.map((block, index) => (
          <div key={index} className="rounded-lg border border-slate-200 p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500">Bloco {index + 1}</span>
              <button
                type="button"
                onClick={() =>
                  setConsiderations((current) => current.filter((_, position) => position !== index))
                }
                className="text-slate-400 transition hover:text-red-600"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
            <RichBlockEditor
              label=""
              value={block}
              onChange={(next) =>
                setConsiderations((current) =>
                  current.map((item, position) =>
                    position === index ? (next ?? { heading: null, paragraphs: [], bullets: [] }) : item,
                  ),
                )
              }
            />
          </div>
        ))}
        <button
          type="button"
          onClick={() =>
            setConsiderations((current) => [
              ...current,
              { heading: null, paragraphs: [], bullets: [] },
            ])
          }
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 transition hover:bg-slate-50"
        >
          <Plus className="h-4 w-4" />
          Bloco
        </button>
      </Card>

      <Card title="Termo de aceite">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">
            Parágrafo de fechamento
          </label>
          <textarea
            value={closingText}
            onChange={(e) => setClosingText(e.target.value)}
            rows={4}
            className={`${inputClass} leading-relaxed`}
            placeholder="Agradecemos a oportunidade de apresentar nossa proposta técnica e comercial…"
          />
        </div>
      </Card>

      <Card
        title="Matriz de responsabilidade padrão"
        hint="Vem pronta em toda proposta criada com este template, e continua editável lá."
      >
        {items.length === 0 && (
          <p className="text-sm text-slate-500">Nenhum item ainda.</p>
        )}
        {items.map((item, index) => (
          <div key={index} className="flex flex-wrap items-center gap-2">
            <input
              value={item.description}
              onChange={(e) =>
                setItems((current) =>
                  current.map((row, position) =>
                    position === index ? { ...row, description: e.target.value } : row,
                  ),
                )
              }
              className={`${inputClass} min-w-[220px] flex-1`}
              placeholder="Ex.: Abertura de valas e envelopamento de dutos"
            />
            <select
              value={item.responsible}
              onChange={(e) =>
                setItems((current) =>
                  current.map((row, position) =>
                    position === index
                      ? { ...row, responsible: e.target.value as TemplateResponsibilityInput["responsible"] }
                      : row,
                  ),
                )
              }
              className={`${inputClass} w-40`}
            >
              <option value="contratada">Contratada</option>
              <option value="contratante">Contratante</option>
              <option value="ambos">Ambos</option>
            </select>
            <button
              type="button"
              onClick={() => setItems((current) => current.filter((_, p) => p !== index))}
              className="rounded-lg p-2 text-slate-400 transition hover:bg-red-50 hover:text-red-600"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => setItems((current) => [...current, { description: "", responsible: "contratada" }])}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 transition hover:bg-slate-50"
        >
          <Plus className="h-4 w-4" />
          Item
        </button>
      </Card>

      <Card
        title="Seções da proposta"
        hint="Ordem e quais entram por padrão. Cada proposta pode ajustar isso depois."
      >
        <ul className="divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200">
          {sections.map((section, index) => (
            <li key={section.key} className="flex items-center gap-3 px-3 py-2">
              <span className="w-6 text-xs tabular-nums text-slate-400">{index + 1}</span>
              <input
                type="checkbox"
                checked={section.enabled}
                onChange={(e) =>
                  setSections((current) =>
                    current.map((row, position) =>
                      position === index ? { ...row, enabled: e.target.checked } : row,
                    ),
                  )
                }
                className="h-4 w-4 rounded border-slate-300"
              />
              <input
                value={section.title}
                onChange={(e) =>
                  setSections((current) =>
                    current.map((row, position) =>
                      position === index ? { ...row, title: e.target.value } : row,
                    ),
                  )
                }
                className={`${inputClass} flex-1 ${section.enabled ? "" : "text-slate-400"}`}
              />
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() => move(index, -1)}
                  disabled={index === 0}
                  className="rounded p-1.5 text-slate-400 transition hover:bg-slate-100 disabled:opacity-30"
                >
                  <ArrowUp className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => move(index, 1)}
                  disabled={index === sections.length - 1}
                  className="rounded p-1.5 text-slate-400 transition hover:bg-slate-100 disabled:opacity-30"
                >
                  <ArrowDown className="h-4 w-4" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      </Card>

      <div className="fixed inset-x-0 bottom-0 border-t border-slate-200 bg-surface/95 px-4 py-3 backdrop-blur sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
          {template ? (
            <button
              type="button"
              onClick={remove}
              disabled={pending}
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-red-600 transition hover:bg-red-50 disabled:opacity-60"
            >
              <Trash2 className="h-4 w-4" />
              Excluir
            </button>
          ) : (
            <span />
          )}
          <button
            type="button"
            onClick={save}
            disabled={pending}
            className="inline-flex items-center gap-2 rounded-lg bg-accent-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent-700 disabled:opacity-60"
          >
            {pending && <Loader2 className="h-4 w-4 animate-spin" />}
            Salvar template
          </button>
        </div>
      </div>
    </div>
  );
}
