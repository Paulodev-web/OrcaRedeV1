import type { ReactNode } from 'react';

import type {
  ProposalActivityGroup,
  ProposalData,
  ProposalPricingOption,
  ProposalRichBlock,
  ProposalSectionKey,
} from '@/types/proposal';
import { ProposalTracker } from './ProposalTracker';
import { PublicProposalActions } from './PublicProposalActions';

const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const decimal = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dateOnly = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long' });

function brl(value: number): string {
  return currency.format(Number.isFinite(value) ? value : 0);
}

function pct(value: number): string {
  return `${decimal.format(Number.isFinite(value) ? value : 0)}%`;
}

function longDate(value: string | null): string | null {
  if (!value) return null;
  const parsed = new Date(value.length <= 10 ? `${value}T12:00:00` : value);
  return Number.isNaN(parsed.getTime()) ? null : dateOnly.format(parsed);
}

function hasBlock(block: ProposalRichBlock | null | undefined): block is ProposalRichBlock {
  if (!block) return false;
  return Boolean(block.heading) || block.paragraphs.length > 0 || block.bullets.length > 0;
}

// ---------------------------------------------------------------------------
// Blocos de apresentação
// ---------------------------------------------------------------------------

/** Título de seção no estilo das peças atuais: caixa alta com tracking largo. */
function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h2 className="text-xs font-semibold uppercase tracking-[0.22em] text-brand-blue">{children}</h2>
  );
}

function Section({
  sectionKey,
  title,
  children,
}: {
  sectionKey: ProposalSectionKey;
  title: string;
  children: ReactNode;
}) {
  return (
    <section
      data-proposal-section={sectionKey}
      className="scroll-mt-20 border-t border-slate-200 py-10 first:border-t-0"
    >
      <SectionTitle>{title}</SectionTitle>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function RichBlock({ block }: { block: ProposalRichBlock }) {
  return (
    <div className="space-y-3">
      {block.heading && (
        <h3 className="text-base font-semibold text-brand-navy">{block.heading}</h3>
      )}
      {block.paragraphs.map((paragraph, index) => (
        <p key={index} className="text-[15px] leading-relaxed text-slate-700">
          {paragraph}
        </p>
      ))}
      {block.bullets.length > 0 && (
        <ul className="space-y-1.5">
          {block.bullets.map((bullet, index) => (
            <li key={index} className="flex gap-2 text-[15px] leading-relaxed text-slate-700">
              <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-blue" />
              <span>{bullet}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function MediaGrid({
  items,
}: {
  items: { url: string; caption: string | null; group: string | null }[];
}) {
  if (items.length === 0) return null;

  const groups = new Map<string, typeof items>();
  for (const item of items) {
    const key = item.group ?? '';
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }

  return (
    <div className="space-y-6">
      {[...groups.entries()].map(([group, groupItems]) => (
        <div key={group || 'sem-grupo'} className="space-y-3">
          {group && (
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
              {group}
            </p>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            {groupItems.map((item, index) => (
              <figure key={`${item.url}-${index}`} className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                {/* eslint-disable-next-line @next/next/no-img-element -- URL externa do Storage, sem loader configurado */}
                <img
                  src={item.url}
                  alt={item.caption ?? 'Imagem da proposta'}
                  className="h-56 w-full object-cover"
                  loading="lazy"
                />
                {item.caption && (
                  <figcaption className="px-3 py-2 text-xs text-slate-500">{item.caption}</figcaption>
                )}
              </figure>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function ActivityGroup({ group }: { group: ProposalActivityGroup }) {
  return (
    <div className="space-y-3">
      <h3 className="text-base font-semibold text-brand-navy">{group.title}</h3>
      {group.intro && <p className="text-[15px] leading-relaxed text-slate-700">{group.intro}</p>}
      {group.items.length > 0 && (
        <ul className="space-y-1.5">
          {group.items.map((item, index) => (
            <li key={index} className="flex gap-2 text-[15px] leading-relaxed text-slate-700">
              <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-blue" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      )}
      {hasBlock(group.note) && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
          <RichBlock block={group.note} />
        </div>
      )}
    </div>
  );
}

function CurveBadge({ curve }: { curve: 'A' | 'B' | 'C' }) {
  const tone =
    curve === 'A'
      ? 'bg-brand-navy text-white'
      : curve === 'B'
        ? 'bg-brand-blue text-white'
        : 'bg-slate-200 text-slate-700';
  return (
    <span className={`inline-flex h-6 w-6 items-center justify-center rounded text-xs font-bold ${tone}`}>
      {curve}
    </span>
  );
}

function PricingOptionCard({ option, multiple }: { option: ProposalPricingOption; multiple: boolean }) {
  return (
    <div
      className={`rounded-2xl border p-5 ${
        option.isRecommended && multiple
          ? 'border-brand-blue bg-brand-blue/5 shadow-sm'
          : 'border-slate-200 bg-white'
      }`}
    >
      {multiple && (
        <div className="mb-4 flex items-center gap-2">
          <p className="text-sm font-semibold text-brand-navy">{option.label}</p>
          {option.isRecommended && (
            <span className="rounded-full bg-brand-blue px-2 py-0.5 text-[11px] font-medium text-white">
              Recomendada
            </span>
          )}
        </div>
      )}

      {option.segments.length > 0 && (
        <div className="mb-5 overflow-x-auto">
          <table className="w-full min-w-[520px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-[11px] uppercase tracking-wide text-slate-400">
                <th className="pb-2 pr-3 font-semibold">Segmento</th>
                <th className="pb-2 pr-3 text-right font-semibold">Material</th>
                <th className="pb-2 pr-3 text-right font-semibold">Mão de obra</th>
                <th className="pb-2 pr-3 text-right font-semibold">Total</th>
                <th className="pb-2 text-right font-semibold">%</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {option.segments.map((segment, index) => (
                <tr key={`${segment.label}-${index}`}>
                  <td className="py-2 pr-3 text-slate-700">{segment.label}</td>
                  <td className="py-2 pr-3 text-right tabular-nums text-slate-600">
                    {brl(segment.materialAmount)}
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums text-slate-600">
                    {brl(segment.laborAmount)}
                  </td>
                  <td className="py-2 pr-3 text-right font-medium tabular-nums text-brand-navy">
                    {brl(segment.totalAmount)}
                  </td>
                  <td className="py-2 text-right tabular-nums text-slate-500">{pct(segment.percent)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <dl className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl bg-slate-50 p-4">
          <dt className="text-[11px] uppercase tracking-wide text-slate-400">Materiais</dt>
          <dd className="mt-1 text-lg font-semibold tabular-nums text-brand-navy">
            {brl(option.globals.materialTotal)}
          </dd>
        </div>
        <div className="rounded-xl bg-slate-50 p-4">
          <dt className="text-[11px] uppercase tracking-wide text-slate-400">Mão de obra</dt>
          <dd className="mt-1 text-lg font-semibold tabular-nums text-brand-navy">
            {brl(option.globals.laborTotal)}
          </dd>
        </div>
        <div className="rounded-xl bg-brand-navy p-4 text-white">
          <dt className="text-[11px] uppercase tracking-wide text-white/70">Total geral</dt>
          <dd className="mt-1 text-lg font-semibold tabular-nums">{brl(option.globals.grandTotal)}</dd>
        </div>
      </dl>

      {option.unitInvestment && (
        <p className="mt-4 rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-600">
          <span className="font-medium text-brand-navy">
            {option.unitInvestment.unitsCount} {option.unitInvestment.unitsLabel}
          </span>{' '}
          — investimento de{' '}
          <span className="font-semibold tabular-nums text-brand-navy">
            {brl(option.unitInvestment.amountPerUnit)}
          </span>{' '}
          por unidade.
        </p>
      )}

      {option.paymentTerms.length > 0 && (
        <div className="mt-5">
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
            Condições de pagamento
          </p>
          <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200">
            {option.paymentTerms.map((term, index) => (
              <li
                key={`${term.dueLabel}-${index}`}
                className="flex items-center justify-between gap-3 px-4 py-2 text-sm"
              >
                <span className="text-slate-600">{term.dueLabel}</span>
                <span className="flex items-center gap-3">
                  <span className="tabular-nums text-slate-400">{pct(term.percent)}</span>
                  <span className="font-medium tabular-nums text-brand-navy">{brl(term.amount)}</span>
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-slate-500">
            O parcelamento incide sobre a mão de obra. Os materiais são faturados diretamente pelo
            fornecedor.
          </p>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Página
// ---------------------------------------------------------------------------

interface PublicProposalViewProps {
  data: ProposalData;
  token: string;
}

/**
 * Peça pública da proposta — somente leitura, com PDF e WhatsApp (§9.2).
 *
 * Renderiza as seções na ordem e com o liga/desliga definidos no editor, de
 * modo que a página e o PDF contem a mesma história a partir do mesmo
 * `ProposalData`.
 */
export function PublicProposalView({ data, token }: PublicProposalViewProps) {
  const enabled = new Map(
    data.sections.filter((section) => section.enabled).map((section) => [section.key, section]),
  );
  const ordered = [...enabled.values()].sort((a, b) => a.order - b.order);
  const titleFor = (key: ProposalSectionKey, fallback: string) => enabled.get(key)?.title ?? fallback;

  const validity = longDate(data.header.validityDate);
  const issued = longDate(data.header.issuedAt);
  const multipleOptions = data.pricingOptions.length > 1;

  const whatsappMessage = `Olá! Recebi a proposta ${data.header.proposalNumber}.${data.header.version}${
    data.header.projectTitle ? ` — ${data.header.projectTitle}` : ''
  } e gostaria de conversar.`;

  const renderers: Partial<Record<ProposalSectionKey, () => ReactNode>> = {
    quem_somos: () => {
      const blocks = [
        data.institutional.quemSomos,
        data.institutional.identidade,
        data.institutional.compromisso,
      ].filter(hasBlock);
      if (blocks.length === 0) return null;
      return (
        <Section sectionKey="quem_somos" title={titleFor('quem_somos', 'Quem somos')}>
          <div className="space-y-8">
            {blocks.map((block, index) => (
              <RichBlock key={index} block={block} />
            ))}
          </div>
        </Section>
      );
    },

    seu_projeto: () =>
      data.media.seuProjeto.length === 0 ? null : (
        <Section sectionKey="seu_projeto" title={titleFor('seu_projeto', 'Seu projeto')}>
          <MediaGrid items={data.media.seuProjeto} />
        </Section>
      ),

    localizacao: () =>
      data.media.localizacao.length === 0 ? null : (
        <Section sectionKey="localizacao" title={titleFor('localizacao', 'Localização da obra')}>
          <MediaGrid items={data.media.localizacao} />
        </Section>
      ),

    fotos_obra: () =>
      data.media.fotosObra.length === 0 ? null : (
        <Section sectionKey="fotos_obra" title={titleFor('fotos_obra', 'Fotos executivas')}>
          <MediaGrid items={data.media.fotosObra} />
        </Section>
      ),

    descricao_atividades: () =>
      data.activities.length === 0 ? null : (
        <Section
          sectionKey="descricao_atividades"
          title={titleFor('descricao_atividades', 'Descrição das atividades')}
        >
          <div className="space-y-8">
            {data.activities.map((group) => (
              <ActivityGroup key={group.order} group={group} />
            ))}
          </div>
        </Section>
      ),

    escopo_materiais: () =>
      data.materials.length === 0 ? null : (
        <Section
          sectionKey="escopo_materiais"
          title={titleFor('escopo_materiais', 'Escopo dos materiais')}
        >
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="bg-slate-50">
                <tr className="text-left text-[11px] uppercase tracking-wide text-slate-400">
                  <th className="px-3 py-2 font-semibold">Material</th>
                  <th className="px-3 py-2 font-semibold">Subgrupo</th>
                  <th className="px-3 py-2 text-right font-semibold">Qtd.</th>
                  <th className="px-3 py-2 text-right font-semibold">Subtotal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.materials.map((material, index) => (
                  <tr key={`${material.code ?? material.name}-${index}`}>
                    <td className="px-3 py-2 text-slate-700">{material.name}</td>
                    <td className="px-3 py-2 text-slate-500">{material.subgroup ?? '—'}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-600">
                      {decimal.format(material.quantity)} {material.unit}
                    </td>
                    <td className="px-3 py-2 text-right font-medium tabular-nums text-brand-navy">
                      {brl(material.subtotal)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      ),

    curva_abc: () =>
      data.abc.rows.length === 0 ? null : (
        <Section sectionKey="curva_abc" title={titleFor('curva_abc', 'Curva de preços dos materiais')}>
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full min-w-[520px] text-sm">
              <thead className="bg-slate-50">
                <tr className="text-left text-[11px] uppercase tracking-wide text-slate-400">
                  <th className="px-3 py-2 font-semibold">Curva</th>
                  <th className="px-3 py-2 font-semibold">Grupo</th>
                  <th className="px-3 py-2 text-right font-semibold">Valor</th>
                  <th className="px-3 py-2 text-right font-semibold">%</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.abc.rows.map((row, index) => (
                  <tr key={`${row.label}-${index}`}>
                    <td className="px-3 py-2">
                      <CurveBadge curve={row.curve} />
                    </td>
                    <td className="px-3 py-2 text-slate-700">{row.label}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-600">
                      {brl(row.amount)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-500">
                      {pct(row.percent)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t-2 border-slate-200 bg-slate-50">
                {data.abc.totals.map((total) => (
                  <tr key={total.curve}>
                    <td className="px-3 py-2">
                      <CurveBadge curve={total.curve} />
                    </td>
                    <td className="px-3 py-2 text-xs uppercase tracking-wide text-slate-500">
                      Total curva {total.curve}
                    </td>
                    <td className="px-3 py-2 text-right font-semibold tabular-nums text-brand-navy">
                      {brl(total.amount)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-500">
                      {pct(total.percent)}
                    </td>
                  </tr>
                ))}
                <tr className="bg-brand-navy text-white">
                  <td className="px-3 py-2" />
                  <td className="px-3 py-2 text-xs uppercase tracking-wide">Total geral</td>
                  <td className="px-3 py-2 text-right font-semibold tabular-nums">
                    {brl(data.abc.grandTotal)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">100,00%</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </Section>
      ),

    condicoes_faturamento: () =>
      !hasBlock(data.billingConditions) ? null : (
        <Section
          sectionKey="condicoes_faturamento"
          title={titleFor('condicoes_faturamento', 'Condições de faturamento')}
        >
          <RichBlock block={data.billingConditions} />
        </Section>
      ),

    valores_globais: () =>
      data.pricingOptions.length === 0 ? null : (
        <Section sectionKey="valores_globais" title={titleFor('valores_globais', 'Valores')}>
          <div className="space-y-4">
            {data.pricingOptions.map((option) => (
              <PricingOptionCard
                key={option.savedPricingBudgetId || option.label}
                option={option}
                multiple={multipleOptions}
              />
            ))}
          </div>
        </Section>
      ),

    cronograma: () =>
      data.schedule.rows.length === 0 ? null : (
        <Section sectionKey="cronograma" title={titleFor('cronograma', 'Cronograma executivo')}>
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="bg-slate-50">
                <tr className="text-left text-[11px] uppercase tracking-wide text-slate-400">
                  <th className="px-3 py-2 font-semibold">Etapa</th>
                  {data.schedule.columns.map((column) => (
                    <th key={column.key} className="px-3 py-2 text-center font-semibold">
                      {column.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.schedule.rows.map((row) => (
                  <tr key={row.order}>
                    <td className="px-3 py-2 text-slate-700">{row.stage}</td>
                    {data.schedule.columns.map((column) => {
                      const mark = row.marks[column.key];
                      return (
                        <td key={column.key} className="px-3 py-2 text-center text-slate-600">
                          {mark === true ? '✕' : typeof mark === 'string' ? mark : ''}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data.schedule.footnote && (
            <p className="mt-3 text-xs text-slate-500">{data.schedule.footnote}</p>
          )}
        </Section>
      ),

    matriz_responsabilidade: () =>
      data.responsibilityMatrix.length === 0 ? null : (
        <Section
          sectionKey="matriz_responsabilidade"
          title={titleFor('matriz_responsabilidade', 'Matriz de responsabilidade')}
        >
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full min-w-[520px] text-sm">
              <thead className="bg-slate-50">
                <tr className="text-left text-[11px] uppercase tracking-wide text-slate-400">
                  <th className="px-3 py-2 font-semibold">Item</th>
                  <th className="px-3 py-2 text-center font-semibold">Contratada</th>
                  <th className="px-3 py-2 text-center font-semibold">Contratante</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.responsibilityMatrix.map((item) => (
                  <tr key={item.order}>
                    <td className="px-3 py-2 text-slate-700">{item.description}</td>
                    <td className="px-3 py-2 text-center font-semibold text-brand-navy">
                      {item.responsible === 'contratada' || item.responsible === 'ambos' ? '✕' : ''}
                    </td>
                    <td className="px-3 py-2 text-center font-semibold text-brand-navy">
                      {item.responsible === 'contratante' || item.responsible === 'ambos' ? '✕' : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      ),

    consideracoes_finais: () =>
      data.finalConsiderations.length === 0 ? null : (
        <Section
          sectionKey="consideracoes_finais"
          title={titleFor('consideracoes_finais', 'Considerações finais')}
        >
          <div className="space-y-8">
            {data.finalConsiderations.map((block, index) => (
              <RichBlock key={index} block={block} />
            ))}
          </div>
        </Section>
      ),

    diferencial_orcarede: () =>
      !hasBlock(data.institutional.diferencialOrcaRede) ? null : (
        <Section
          sectionKey="diferencial_orcarede"
          title={titleFor('diferencial_orcarede', 'Diferencial tecnológico')}
        >
          <div className="rounded-2xl bg-brand-navy p-6 text-white">
            <div className="[&_h3]:text-white [&_li]:text-white/85 [&_p]:text-white/85">
              <RichBlock block={data.institutional.diferencialOrcaRede} />
            </div>
          </div>
        </Section>
      ),

    termo_aceite: () => (
      <Section sectionKey="termo_aceite" title={titleFor('termo_aceite', 'Termo de aceite')}>
        <div className="space-y-5">
          {data.acceptance.closingText && (
            <p className="text-[15px] leading-relaxed text-slate-700">{data.acceptance.closingText}</p>
          )}
          {data.responsible && (
            <div className="rounded-xl border border-slate-200 p-5">
              {data.responsible.signatureUrl && (
                /* eslint-disable-next-line @next/next/no-img-element -- URL externa do Storage */
                <img
                  src={data.responsible.signatureUrl}
                  alt=""
                  className="mb-2 h-16 w-auto object-contain"
                />
              )}
              <p className="text-sm font-semibold text-brand-navy">{data.responsible.fullName}</p>
              <p className="text-xs text-slate-500">CREA {data.responsible.crea}</p>
            </div>
          )}
          <p className="text-xs text-slate-500">
            O aceite formal é feito na via em PDF, assinada e devolvida ao responsável comercial.
          </p>
        </div>
      </Section>
    ),

    contato: () => (
      <Section sectionKey="contato" title={titleFor('contato', 'Contato')}>
        <div className="rounded-2xl border border-slate-200 bg-white p-6">
          <p className="text-base font-semibold text-brand-navy">
            {data.company.tradeName || data.company.legalName}
          </p>
          {data.company.cnpj && <p className="text-sm text-slate-500">CNPJ {data.company.cnpj}</p>}
          {data.company.address && <p className="text-sm text-slate-500">{data.company.address}</p>}
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm text-slate-600">
            {data.company.phonePrimary && <span>{data.company.phonePrimary}</span>}
            {data.company.phoneSecondary && <span>{data.company.phoneSecondary}</span>}
            {data.company.email && <span>{data.company.email}</span>}
            {data.company.website && <span>{data.company.website}</span>}
            {data.company.instagram && <span>{data.company.instagram}</span>}
          </div>
        </div>
      </Section>
    ),
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <ProposalTracker token={token} />

      {/* Capa */}
      <header
        data-proposal-section="capa"
        className="bg-gradient-to-br from-brand-navy via-brand-navy to-neutral-800 px-6 py-14 text-white sm:px-10"
      >
        <div className="mx-auto max-w-4xl">
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div className="min-w-0">
              <p className="text-[11px] uppercase tracking-[0.28em] text-white/60">
                {data.header.scopeLabel}
              </p>
              <h1 className="mt-3 text-3xl font-bold leading-tight sm:text-4xl">
                {data.header.projectTitle || 'Proposta comercial'}
              </h1>
              {data.header.projectSubtitle && (
                <p className="mt-2 text-lg text-white/80">{data.header.projectSubtitle}</p>
              )}
            </div>
            {data.company.logoUrl && (
              /* eslint-disable-next-line @next/next/no-img-element -- URL externa do Storage */
              <img
                src={data.company.logoUrl}
                alt={data.company.tradeName || data.company.legalName}
                className="h-12 w-auto shrink-0 object-contain"
              />
            )}
          </div>

          <dl className="mt-9 grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <dt className="text-[11px] uppercase tracking-wide text-white/50">Cliente</dt>
              <dd className="mt-0.5 font-medium">{data.header.clientName || '—'}</dd>
            </div>
            <div>
              <dt className="text-[11px] uppercase tracking-wide text-white/50">Cidade</dt>
              <dd className="mt-0.5 font-medium">{data.header.city || '—'}</dd>
            </div>
            <div>
              <dt className="text-[11px] uppercase tracking-wide text-white/50">Proposta</dt>
              <dd className="mt-0.5 font-medium tabular-nums">
                {data.header.proposalNumber}.{data.header.version}
              </dd>
            </div>
            <div>
              <dt className="text-[11px] uppercase tracking-wide text-white/50">Emissão</dt>
              <dd className="mt-0.5 font-medium">{issued ?? '—'}</dd>
            </div>
          </dl>

          <div className="mt-9 flex flex-wrap items-center gap-4">
            <PublicProposalActions
              token={token}
              whatsappNumber={data.company.whatsappNumber}
              whatsappMessage={whatsappMessage}
            />
            {validity && (
              <p className="text-xs text-white/60">Proposta válida até {validity}.</p>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 pb-16 sm:px-10">
        {ordered.map((section) => {
          const render = renderers[section.key];
          return render ? <div key={section.key}>{render()}</div> : null;
        })}
      </main>

      <footer className="border-t border-slate-200 bg-white px-6 py-8 sm:px-10">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-4">
          <p className="text-xs text-slate-400">
            {data.company.legalName}
            {data.company.cnpj ? ` — CNPJ ${data.company.cnpj}` : ''}
          </p>
          <PublicProposalActions
            token={token}
            whatsappNumber={data.company.whatsappNumber}
            whatsappMessage={whatsappMessage}
            compact
          />
        </div>
      </footer>
    </div>
  );
}
