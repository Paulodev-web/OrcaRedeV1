"use client";

import { useRouter } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';
import {
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  Download,
  FileText,
  Globe,
  Link2,
  Lock,
  ShieldAlert,
} from 'lucide-react';
import { toast } from 'sonner';

import {
  checkProposalReadinessAction,
  publishProposalAction,
  reorderSectionsAction,
  revokeProposalLinkAction,
  unpublishProposalAction,
  updateSectionAction,
} from '@/actions/proposals';
import { SECTION_ORIGIN } from '@/services/proposals/defaults';
import type { ProposalSectionKey } from '@/types/proposal';

import { PropostasShell } from './PropostasShell';
import {
  Notice,
  StatusBadge,
  brl,
  buttonClass,
  primaryButtonClass,
  publicProposalUrl,
} from './shared';
import { CapaPanel } from './sections/CapaPanel';
import { AtividadesPanel } from './sections/AtividadesPanel';
import { BlocosPanel } from './sections/BlocosPanel';
import { ContatoPanel } from './sections/ContatoPanel';
import { CronogramaPanel } from './sections/CronogramaPanel';
import { CurvaAbcPanel } from './sections/CurvaAbcPanel';
import { MateriaisPanel } from './sections/MateriaisPanel';
import { MatrizPanel } from './sections/MatrizPanel';
import { MidiaPanel } from './sections/MidiaPanel';
import { PrecosPanel } from './sections/PrecosPanel';
import type { EditorContext } from './sections/types';

export type ProposalEditorProps = Omit<EditorContext, 'locked'>;

export function ProposalEditor(props: ProposalEditorProps) {
  const { record } = props;
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [activeKey, setActiveKey] = useState<ProposalSectionKey>('capa');
  const [readiness, setReadiness] = useState<{ issues: string[]; blockers: string[] } | null>(null);

  const locked = record.proposal.status === 'published';

  const sections = useMemo(
    () => record.sections.slice().sort((a, b) => a.orderIndex - b.orderIndex),
    [record.sections],
  );

  const active = sections.find((section) => section.sectionKey === activeKey) ?? sections[0];

  const recommended =
    record.pricingOptions.find((option) => option.isRecommended) ?? record.pricingOptions[0];

  const context: EditorContext = { ...props, locked };

  const toggleSection = (sectionId: string, enabled: boolean) => {
    startTransition(async () => {
      const result = await updateSectionAction(record.proposal.id, sectionId, { enabled });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      router.refresh();
    });
  };

  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= sections.length) return;

    const ordered = sections.map((section) => section.id);
    [ordered[index], ordered[target]] = [ordered[target], ordered[index]];

    startTransition(async () => {
      const result = await reorderSectionsAction(record.proposal.id, ordered);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      router.refresh();
    });
  };

  const runReadiness = () => {
    startTransition(async () => {
      const result = await checkProposalReadinessAction(record.proposal.id);
      if (!result.success) {
        toast.error(result.error);
        return;
      }

      const issues = result.data.issues.map((issue) => `${issue.path}: ${issue.message}`);
      setReadiness({ issues, blockers: result.data.blockers });

      if (issues.length === 0 && result.data.blockers.length === 0) {
        toast.success('Proposta coerente: números fecham e o cadastro está completo.');
      } else {
        toast.warning(`${issues.length + result.data.blockers.length} pendência(s) antes de publicar.`);
      }
    });
  };

  const publish = () => {
    startTransition(async () => {
      const result = await publishProposalAction(record.proposal.id);
      if (!result.success) {
        toast.error(result.error, { duration: 12000 });
        return;
      }
      void navigator.clipboard.writeText(publicProposalUrl(result.data.shareToken));
      toast.success('Proposta publicada. Link copiado para a área de transferência.');
      router.refresh();
    });
  };

  const unpublish = () => {
    startTransition(async () => {
      const result = await unpublishProposalAction(record.proposal.id);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success('Proposta voltou a rascunho. O link público parou de responder.');
      router.refresh();
    });
  };

  const revoke = () => {
    if (
      !window.confirm(
        'Revogar o link público? Quem tiver a URL perde o acesso, e republicar gera um link novo.',
      )
    ) {
      return;
    }

    startTransition(async () => {
      const result = await revokeProposalLinkAction(record.proposal.id);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success('Link revogado.');
      router.refresh();
    });
  };

  const identifier = `${record.proposal.proposalNumber}.${record.proposal.version}`;

  return (
    <PropostasShell
      title={
        <span className="flex items-center gap-2">
          <span className="rounded-md bg-brand-navy/5 px-2 py-0.5 text-sm font-semibold tabular-nums text-brand-navy">
            {identifier}
          </span>
          <span className="truncate">{record.proposal.projectTitle || 'Proposta sem título'}</span>
        </span>
      }
      description={
        <span className="flex flex-wrap items-center gap-2">
          <StatusBadge status={record.proposal.status} revokedAt={record.proposal.revokedAt} />
          <span>{record.proposal.clientName || 'Cliente não informado'}</span>
          {recommended ? <span>· {brl(recommended.grandTotal)}</span> : null}
        </span>
      }
      icon={FileText}
      breadcrumb={[{ label: 'Propostas', href: '/propostas' }, { label: identifier }]}
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <a
            href={`/propostas/${record.proposal.id}/pdf`}
            target="_blank"
            rel="noreferrer"
            className={buttonClass}
          >
            <Download className="h-4 w-4" />
            PDF
          </a>

          <button type="button" onClick={runReadiness} disabled={pending} className={buttonClass}>
            <CheckCircle2 className="h-4 w-4" />
            Validar
          </button>

          {record.proposal.status === 'published' ? (
            <>
              {record.proposal.revokedAt ? null : (
                <button
                  type="button"
                  onClick={() => {
                    void navigator.clipboard.writeText(publicProposalUrl(record.proposal.shareToken));
                    toast.success('Link público copiado.');
                  }}
                  className={buttonClass}
                >
                  <Link2 className="h-4 w-4" />
                  Copiar link
                </button>
              )}
              <button type="button" onClick={revoke} disabled={pending} className={buttonClass}>
                <ShieldAlert className="h-4 w-4" />
                Revogar
              </button>
              <button type="button" onClick={unpublish} disabled={pending} className={buttonClass}>
                Despublicar
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={publish}
              disabled={pending}
              className={primaryButtonClass}
            >
              <Globe className="h-4 w-4" />
              Publicar
            </button>
          )}
        </div>
      }
    >
      <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        {locked ? (
          <div className="mb-4">
            <Notice tone="warning">
              <span className="flex items-center gap-2">
                <Lock className="h-4 w-4 shrink-0" />
                Proposta publicada: a edição está travada porque o link já está com o cliente.
                Despublique para voltar a editar.
              </span>
            </Notice>
          </div>
        ) : null}

        {readiness && (readiness.issues.length > 0 || readiness.blockers.length > 0) ? (
          <div className="mb-4">
            <Notice tone="danger">
              <p className="font-medium">Pendências antes de publicar</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-5">
                {readiness.blockers.map((blocker) => (
                  <li key={blocker}>{blocker}</li>
                ))}
                {readiness.issues.map((issue) => (
                  <li key={issue}>{issue}</li>
                ))}
              </ul>
            </Notice>
          </div>
        ) : null}

        <div className="grid gap-5 lg:grid-cols-[minmax(0,300px)_minmax(0,1fr)]">
          <aside className="rounded-xl border border-slate-200 bg-surface p-2 shadow-sm lg:sticky lg:top-4 lg:h-fit">
            <p className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Seções da proposta
            </p>
            <ul>
              {sections.map((section, index) => {
                const isActive = active?.id === section.id;

                return (
                  <li key={section.id} className="flex items-center gap-1">
                    <input
                      type="checkbox"
                      checked={section.enabled}
                      disabled={locked || pending}
                      onChange={(event) => toggleSection(section.id, event.target.checked)}
                      title={section.enabled ? 'Seção ligada' : 'Seção desligada'}
                      className="ml-2 h-3.5 w-3.5 shrink-0 accent-accent-600"
                    />
                    <button
                      type="button"
                      onClick={() => setActiveKey(section.sectionKey)}
                      className={`min-w-0 flex-1 rounded-lg px-2 py-2 text-left text-sm transition-colors ${
                        isActive
                          ? 'bg-brand-blue/15 font-semibold text-brand-navy'
                          : section.enabled
                            ? 'text-slate-600 hover:bg-slate-50'
                            : 'text-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      <span className="mr-1.5 tabular-nums opacity-50">{index + 1}.</span>
                      <span className="truncate">{section.title}</span>
                    </button>

                    <span className="flex shrink-0 flex-col">
                      <button
                        type="button"
                        onClick={() => move(index, -1)}
                        disabled={locked || pending || index === 0}
                        title="Subir"
                        className="px-1 text-slate-300 transition-colors hover:text-brand-navy disabled:opacity-30"
                      >
                        <ArrowUp className="h-3 w-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => move(index, 1)}
                        disabled={locked || pending || index === sections.length - 1}
                        title="Descer"
                        className="px-1 text-slate-300 transition-colors hover:text-brand-navy disabled:opacity-30"
                      >
                        <ArrowDown className="h-3 w-3" />
                      </button>
                    </span>
                  </li>
                );
              })}
            </ul>
          </aside>

          <div className="min-w-0 space-y-5">
            {active ? (
              <SectionPanel sectionKey={active.sectionKey} context={context} />
            ) : (
              <Notice>Esta proposta não tem seções — recrie-a a partir do orçamento.</Notice>
            )}
          </div>
        </div>
      </div>
    </PropostasShell>
  );
}

function SectionPanel({
  sectionKey,
  context,
}: {
  sectionKey: ProposalSectionKey;
  context: EditorContext;
}) {
  const origin = SECTION_ORIGIN[sectionKey];

  switch (sectionKey) {
    case 'capa':
      return <CapaPanel context={context} origin={origin} />;

    case 'quem_somos':
    case 'condicoes_faturamento':
    case 'consideracoes_finais':
    case 'diferencial_orcarede':
    case 'termo_aceite':
      return <BlocosPanel sectionKey={sectionKey} context={context} origin={origin} />;

    case 'seu_projeto':
    case 'localizacao':
    case 'fotos_obra':
      return <MidiaPanel sectionKey={sectionKey} context={context} origin={origin} />;

    case 'descricao_atividades':
      return <AtividadesPanel context={context} origin={origin} />;

    case 'escopo_materiais':
      return <MateriaisPanel context={context} origin={origin} />;

    case 'curva_abc':
      return <CurvaAbcPanel context={context} origin={origin} />;

    case 'valores_por_segmento':
    case 'valores_globais':
    case 'investimento_por_unidade':
    case 'condicoes_pagamento':
      return <PrecosPanel sectionKey={sectionKey} context={context} origin={origin} />;

    case 'cronograma':
      return <CronogramaPanel context={context} origin={origin} />;

    case 'matriz_responsabilidade':
      return <MatrizPanel context={context} origin={origin} />;

    case 'contato':
      return <ContatoPanel context={context} origin={origin} />;

    default:
      return null;
  }
}
