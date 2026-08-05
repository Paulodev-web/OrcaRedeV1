"use client";

import { useState, useTransition } from 'react';
import { Plus, Sparkles, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { refineProposalBlockAction } from '@/actions/proposals';
import type { ProposalRefineAction } from '@/services/ai/proposal';
import type { ProposalRichBlock, ProposalSectionKey } from '@/types/proposal';

import { FieldLabel, buttonClass, inputClass, textareaClass } from './shared';

export const EMPTY_BLOCK: ProposalRichBlock = { heading: null, paragraphs: [], bullets: [] };

/**
 * Espelho de `PROPOSAL_REFINE_ACTION_LABELS`. Duplicado de propósito: importar
 * o valor de `@/services/ai/proposal` arrastaria o SDK do Gemini para o bundle
 * do navegador. O tipo, que é apagado na compilação, continua vindo de lá.
 */
const REFINE_ACTION_LABELS: Record<ProposalRefineAction, string> = {
  formal: 'Reescrever mais formal',
  direto: 'Reescrever mais direto',
  encurtar: 'Encurtar',
  expandir: 'Expandir',
  corrigir_portugues: 'Corrigir português',
};

/**
 * Editor de um `ProposalRichBlock`.
 *
 * Parágrafos e bullets são listas separadas, nunca um textão com markdown: o
 * motor de PDF pagina por parágrafo, e é o contrato canônico que manda.
 *
 * O refinamento por IA devolve o texto para revisão na tela — não grava sozinho.
 * Refinar é a operação mais arriscada da camada de IA (um "mais formal" troca
 * "61 postes" por "mais de 60 postes"), então quem confirma é o usuário.
 */
export function RichBlockEditor({
  label,
  hint,
  value,
  onChange,
  proposalId,
  sectionKey,
  disabled = false,
}: {
  label: string;
  hint?: string;
  value: ProposalRichBlock | null;
  onChange: (block: ProposalRichBlock | null) => void;
  /** Sem estes dois, o botão de refinar não aparece. */
  proposalId?: string;
  sectionKey?: ProposalSectionKey;
  disabled?: boolean;
}) {
  const [refining, startRefine] = useTransition();
  const [refineAction, setRefineAction] = useState<ProposalRefineAction>('formal');

  const block = value ?? EMPTY_BLOCK;
  const isEmpty =
    !block.heading && block.paragraphs.length === 0 && block.bullets.length === 0;

  const patch = (next: Partial<ProposalRichBlock>) => {
    const merged = { ...block, ...next };
    const empty = !merged.heading && merged.paragraphs.length === 0 && merged.bullets.length === 0;
    onChange(empty ? null : merged);
  };

  const handleRefine = () => {
    if (!proposalId || !sectionKey) return;
    if (isEmpty) {
      toast.error('Escreva alguma coisa antes de pedir refinamento.');
      return;
    }

    startRefine(async () => {
      const result = await refineProposalBlockAction(proposalId, {
        sectionKey,
        action: refineAction,
        block,
      });

      if (!result.success) {
        toast.error(result.error);
        return;
      }

      onChange(result.data.block);
      if (result.data.violations.length > 0) {
        toast.warning(
          `Texto refinado com ${result.data.violations.length} ressalva(s) do guardrail — confira os números.`,
        );
      } else {
        toast.success('Texto refinado. Revise antes de salvar.');
      }
    });
  };

  return (
    <div className="rounded-lg border border-slate-200 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <FieldLabel hint={hint}>{label}</FieldLabel>

        {proposalId && sectionKey ? (
          <div className="flex items-center gap-2">
            <select
              value={refineAction}
              onChange={(event) => setRefineAction(event.target.value as ProposalRefineAction)}
              disabled={disabled}
              className="rounded-lg border border-slate-200 bg-surface px-2 py-1.5 text-xs text-slate-600 outline-none focus:border-brand-blue"
            >
              {Object.entries(REFINE_ACTION_LABELS).map(([action, actionLabel]) => (
                <option key={action} value={action}>
                  {actionLabel}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={handleRefine}
              disabled={disabled || refining}
              className={`${buttonClass} px-2.5 py-1.5 text-xs`}
            >
              <Sparkles className="h-3.5 w-3.5" />
              {refining ? 'Refinando…' : 'Refinar'}
            </button>
          </div>
        ) : null}
      </div>

      <input
        value={block.heading ?? ''}
        onChange={(event) => patch({ heading: event.target.value || null })}
        placeholder="Título do bloco (opcional)"
        disabled={disabled}
        className={`${inputClass} mb-3`}
      />

      <div className="space-y-2">
        {block.paragraphs.map((paragraph, index) => (
          <div key={`p-${index}`} className="flex gap-2">
            <textarea
              value={paragraph}
              onChange={(event) => {
                const paragraphs = [...block.paragraphs];
                paragraphs[index] = event.target.value;
                patch({ paragraphs });
              }}
              disabled={disabled}
              className={textareaClass}
            />
            <button
              type="button"
              onClick={() => patch({ paragraphs: block.paragraphs.filter((_, i) => i !== index) })}
              disabled={disabled}
              title="Remover parágrafo"
              className="h-9 shrink-0 rounded-lg border border-slate-200 px-2 text-slate-400 transition-colors hover:border-red-300 hover:text-red-500"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => patch({ paragraphs: [...block.paragraphs, ''] })}
          disabled={disabled}
          className={`${buttonClass} px-2.5 py-1.5 text-xs`}
        >
          <Plus className="h-3.5 w-3.5" />
          Parágrafo
        </button>
      </div>

      <div className="mt-4 space-y-2">
        {block.bullets.map((bullet, index) => (
          <div key={`b-${index}`} className="flex gap-2">
            <span className="mt-2 text-slate-300">•</span>
            <input
              value={bullet}
              onChange={(event) => {
                const bullets = [...block.bullets];
                bullets[index] = event.target.value;
                patch({ bullets });
              }}
              disabled={disabled}
              className={inputClass}
            />
            <button
              type="button"
              onClick={() => patch({ bullets: block.bullets.filter((_, i) => i !== index) })}
              disabled={disabled}
              title="Remover item"
              className="shrink-0 rounded-lg border border-slate-200 px-2 text-slate-400 transition-colors hover:border-red-300 hover:text-red-500"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => patch({ bullets: [...block.bullets, ''] })}
          disabled={disabled}
          className={`${buttonClass} px-2.5 py-1.5 text-xs`}
        >
          <Plus className="h-3.5 w-3.5" />
          Item de lista
        </button>
      </div>
    </div>
  );
}
