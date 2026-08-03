"use client";

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { updateProposalTextAction } from '@/actions/proposals';
import type { ProposalRichBlock, ProposalSectionKey } from '@/types/proposal';

import { RichBlockEditor } from '../RichBlockEditor';
import {
  EditorCard,
  FieldLabel,
  Notice,
  buttonClass,
  primaryButtonClass,
  textareaClass,
} from '../shared';
import type { PanelProps } from './types';

/**
 * Seções puramente textuais: institucional, faturamento, considerações finais,
 * diferencial OrçaRede e o fechamento do termo de aceite.
 *
 * Todas nascem do template e são reescritas pela IA no rascunho — e todas
 * continuam editáveis à mão a qualquer momento, que é a regra do §12.2.
 */
export function BlocosPanel({
  sectionKey,
  context,
  origin,
}: PanelProps & { sectionKey: ProposalSectionKey }) {
  const { record, locked } = context;
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [institutional, setInstitutional] = useState(record.proposal.institutional);
  const [billing, setBilling] = useState(record.proposal.billingConditions);
  const [considerations, setConsiderations] = useState(record.proposal.finalConsiderations);
  const [closing, setClosing] = useState(record.proposal.acceptanceClosingText ?? '');

  const save = () => {
    startTransition(async () => {
      const result = await updateProposalTextAction(record.proposal.id, {
        institutional,
        billingConditions: billing,
        finalConsiderations: considerations,
        acceptanceClosingText: closing || null,
      });

      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success('Texto salvo.');
      router.refresh();
    });
  };

  const saveButton = (
    <button type="button" onClick={save} disabled={locked || pending} className={primaryButtonClass}>
      {pending ? 'Salvando…' : 'Salvar'}
    </button>
  );

  const patchInstitutional = (
    key: keyof typeof institutional,
    block: ProposalRichBlock | null,
  ) => setInstitutional((current) => ({ ...current, [key]: block }));

  if (sectionKey === 'quem_somos') {
    return (
      <EditorCard title="Quem Somos" origin={origin} actions={saveButton}>
        <div className="space-y-4">
          <RichBlockEditor
            label="Quem somos"
            value={institutional.quemSomos}
            onChange={(block) => patchInstitutional('quemSomos', block)}
            proposalId={record.proposal.id}
            sectionKey="quem_somos"
            disabled={locked}
          />
          <RichBlockEditor
            label="Nossa identidade"
            hint="visão, missão e valores"
            value={institutional.identidade}
            onChange={(block) => patchInstitutional('identidade', block)}
            proposalId={record.proposal.id}
            sectionKey="quem_somos"
            disabled={locked}
          />
          <RichBlockEditor
            label="Compromisso com a qualidade"
            value={institutional.compromisso}
            onChange={(block) => patchInstitutional('compromisso', block)}
            proposalId={record.proposal.id}
            sectionKey="quem_somos"
            disabled={locked}
          />
        </div>
      </EditorCard>
    );
  }

  if (sectionKey === 'diferencial_orcarede') {
    return (
      <EditorCard title="Diferencial tecnológico OrçaRede" origin={origin} actions={saveButton}>
        <RichBlockEditor
          label="Diferencial OrçaRede"
          hint="boilerplate do template"
          value={institutional.diferencialOrcaRede}
          onChange={(block) => patchInstitutional('diferencialOrcaRede', block)}
          proposalId={record.proposal.id}
          sectionKey="diferencial_orcarede"
          disabled={locked}
        />
      </EditorCard>
    );
  }

  if (sectionKey === 'condicoes_faturamento') {
    return (
      <EditorCard title="Condições de faturamento de materiais" origin={origin} actions={saveButton}>
        <RichBlockEditor
          label="Condições de faturamento"
          hint="material é faturado direto do fornecedor para o cliente"
          value={billing}
          onChange={setBilling}
          proposalId={record.proposal.id}
          sectionKey="condicoes_faturamento"
          disabled={locked}
        />
      </EditorCard>
    );
  }

  if (sectionKey === 'termo_aceite') {
    return (
      <EditorCard title="Termo de aceite" origin={origin} actions={saveButton}>
        <label className="block">
          <FieldLabel hint="parágrafo de fechamento antes da assinatura">Texto de encerramento</FieldLabel>
          <textarea
            value={closing}
            onChange={(event) => setClosing(event.target.value)}
            disabled={locked}
            className={textareaClass}
          />
        </label>

        <div className="mt-4">
          {record.responsible ? (
            <Notice>
              Assina: <strong>{record.responsible.fullName}</strong> — {record.responsible.crea}
              {record.responsible.signatureUrl ? ' (com imagem de assinatura)' : ' (sem imagem de assinatura)'}
            </Notice>
          ) : (
            <Notice tone="warning">
              Nenhum responsável técnico selecionado. Escolha um na seção Capa antes de publicar.
            </Notice>
          )}
        </div>
      </EditorCard>
    );
  }

  // consideracoes_finais — lista de blocos: escopo, itens inclusos e escopo negativo.
  return (
    <EditorCard
      title="Considerações finais"
      origin={origin}
      actions={
        <>
          <button
            type="button"
            onClick={() =>
              setConsiderations((current) => [...current, { heading: null, paragraphs: [], bullets: [] }])
            }
            disabled={locked}
            className={buttonClass}
          >
            <Plus className="h-4 w-4" />
            Bloco
          </button>
          {saveButton}
        </>
      }
    >
      {considerations.length === 0 ? (
        <Notice>
          Nenhum bloco. O escopo negativo (&ldquo;não estão inclusos&rdquo;) costuma ser o mais
          importante — é o que evita discussão depois.
        </Notice>
      ) : (
        <div className="space-y-4">
          {considerations.map((block, index) => (
            <div key={index} className="relative">
              <button
                type="button"
                onClick={() => setConsiderations((current) => current.filter((_, i) => i !== index))}
                disabled={locked}
                title="Remover bloco"
                className="absolute right-3 top-3 z-10 rounded-lg border border-slate-200 bg-white p-1.5 text-slate-400 transition-colors hover:border-red-300 hover:text-red-500"
              >
                <Trash2 className="h-4 w-4" />
              </button>
              <RichBlockEditor
                label={`Bloco ${index + 1}`}
                value={block}
                onChange={(next) =>
                  setConsiderations((current) =>
                    current.map((item, i) =>
                      i === index ? (next ?? { heading: null, paragraphs: [], bullets: [] }) : item,
                    ),
                  )
                }
                proposalId={record.proposal.id}
                sectionKey="consideracoes_finais"
                disabled={locked}
              />
            </div>
          ))}
        </div>
      )}
    </EditorCard>
  );
}
