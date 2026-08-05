"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { FileText, Plus, Star } from "lucide-react";
import { toast } from "sonner";

import type { ProposalTemplateSummary } from "@/services/proposals/templates";
import { setDefaultProposalTemplateAction } from "../_actions/proposalTemplates";

export function TemplatesListClient({ templates }: { templates: ProposalTemplateSummary[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const makeDefault = (id: string) => {
    startTransition(async () => {
      const result = await setDefaultProposalTemplateAction(id);
      if (result.success) {
        toast.success("Template padrão atualizado.");
        router.refresh();
      } else {
        toast.error(result.error ?? "Falha ao definir o padrão.");
      }
    });
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-sm text-slate-600">
          O template é o boilerplate que a proposta copia ao ser criada — texto institucional,
          estrutura de seções e matriz de responsabilidade. É também a referência de estilo que a
          IA usa para escrever no seu tom.
        </p>
        <Link
          href="/configuracoes/templates-proposta/novo"
          className="inline-flex items-center gap-1.5 rounded-lg bg-accent-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent-700"
        >
          <Plus className="h-4 w-4" />
          Novo template
        </Link>
      </div>

      {templates.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-slate-300 bg-surface px-6 py-14 text-center">
          <FileText className="h-8 w-8 text-slate-300" />
          <p className="max-w-md text-sm text-slate-600">
            Nenhum template ainda. Sem ele, a proposta nasce com as 19 seções vazias e a IA escreve
            genérico.
          </p>
          <Link
            href="/configuracoes/templates-proposta/novo"
            className="text-sm font-medium text-brand-blue hover:brightness-90"
          >
            Criar o primeiro template
          </Link>
        </div>
      ) : (
        <ul className="divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 bg-surface">
          {templates.map((template) => (
            <li key={template.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <Link href={`/configuracoes/templates-proposta/${template.id}`} className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-brand-navy">{template.name}</span>
                  {template.isDefault && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">
                      <Star className="h-3 w-3" />
                      Padrão
                    </span>
                  )}
                </div>
                {template.description && (
                  <p className="truncate text-xs text-slate-500">{template.description}</p>
                )}
              </Link>

              {!template.isDefault && (
                <button
                  type="button"
                  onClick={() => makeDefault(template.id)}
                  disabled={pending}
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-60"
                >
                  Tornar padrão
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
