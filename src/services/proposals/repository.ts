import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

import type {
  ProposalAbc,
  ProposalActivityFact,
  ProposalActivityGroup,
  ProposalCompany,
  ProposalData,
  ProposalMaterialRow,
  ProposalRichBlock,
  ProposalScheduleColumn,
  ProposalSectionConfig,
  ProposalSectionKey,
  ProposalTechnicalResponsible,
} from '@/types/proposal';

import { round2, toNumber, totalsFromAbcRows } from './derive';

/**
 * LEITURA DA PROPOSTA — do Supabase para o contrato canônico.
 *
 * `loadProposalRecord` devolve as linhas com id (é o que o editor precisa para
 * mandar update); `toProposalData` projeta o mesmo registro em `ProposalData`
 * (é o que o motor de PDF e a página pública consomem). Uma leitura, duas
 * formas — nada é buscado duas vezes.
 *
 * `src/types/proposal.ts` é LEITURA nesta frente (§16.4/3): se algo aqui não
 * couber no contrato, o caminho é registrar o pedido, não editar o contrato.
 */

export const PROPOSAL_SECTION_KEYS: ProposalSectionKey[] = [
  'capa',
  'quem_somos',
  'seu_projeto',
  'localizacao',
  'fotos_obra',
  'descricao_atividades',
  'escopo_materiais',
  'curva_abc',
  'condicoes_faturamento',
  'valores_por_segmento',
  'valores_globais',
  'investimento_por_unidade',
  'condicoes_pagamento',
  'cronograma',
  'matriz_responsabilidade',
  'consideracoes_finais',
  'diferencial_orcarede',
  'termo_aceite',
  'contato',
];

/** Seções cujo conteúdo é mídia, e a chave correspondente em `ProposalData.media`. */
export const MEDIA_SECTIONS = {
  seu_projeto: 'seuProjeto',
  localizacao: 'localizacao',
  fotos_obra: 'fotosObra',
} as const;

export type MediaSectionKey = keyof typeof MEDIA_SECTIONS;

// ---------------------------------------------------------------------------
// Linhas normalizadas (numéricos já convertidos — PostgREST devolve NUMERIC
// como string, e o editor não pode receber "1234.50" onde espera número)
// ---------------------------------------------------------------------------

export interface ProposalSectionRow {
  id: string;
  sectionKey: ProposalSectionKey;
  title: string;
  orderIndex: number;
  enabled: boolean;
  content: Record<string, unknown> | null;
}

export interface ProposalSegmentTotalRow {
  id: string;
  pricingOptionId: string;
  segmentId: string | null;
  label: string;
  materialAmount: number;
  laborAmount: number;
  totalAmount: number;
  percent: number;
  orderIndex: number;
}

export interface ProposalPaymentTermRow {
  id: string;
  pricingOptionId: string;
  orderIndex: number;
  percent: number;
  amount: number;
  dueLabel: string;
  dueDate: string | null;
}

export interface ProposalPricingOptionRow {
  id: string;
  savedPricingBudgetId: string | null;
  label: string;
  isRecommended: boolean;
  orderIndex: number;
  materialTotal: number;
  laborTotal: number;
  grandTotal: number;
  unitsCount: number | null;
  unitsLabel: string | null;
  amountPerUnit: number | null;
  segments: ProposalSegmentTotalRow[];
  paymentTerms: ProposalPaymentTermRow[];
}

export interface ProposalAbcRowRecord {
  id: string;
  curve: 'A' | 'B' | 'C';
  label: string;
  amount: number;
  percent: number;
  orderIndex: number;
}

export interface ProposalResponsibilityRow {
  id: string;
  orderIndex: number;
  description: string;
  responsible: 'contratada' | 'contratante' | 'ambos';
}

export interface ProposalMediaRow {
  id: string;
  sectionKey: ProposalSectionKey;
  mediaId: string | null;
  url: string;
  caption: string | null;
  groupLabel: string | null;
  orderIndex: number;
}

export interface ProposalScheduleRowRecord {
  id: string;
  orderIndex: number;
  stage: string;
  marks: Record<string, boolean | string>;
}

export interface ProposalMainRow {
  id: string;
  userId: string;
  budgetId: string;
  templateId: string | null;
  technicalResponsibleId: string | null;
  proposalNumber: number;
  version: number;
  scopeLabel: string;
  projectTitle: string;
  projectSubtitle: string | null;
  clientName: string;
  city: string;
  issuedAt: string;
  validityDate: string | null;
  status: 'draft' | 'published' | 'archived';
  unitsCount: number | null;
  unitsLabel: string | null;
  institutional: ProposalData['institutional'];
  activities: ProposalActivityGroup[];
  materialsSnapshot: ProposalMaterialRow[];
  billingConditions: ProposalRichBlock | null;
  finalConsiderations: ProposalRichBlock[];
  acceptanceClosingText: string | null;
  scheduleColumns: ProposalScheduleColumn[];
  scheduleFootnote: string | null;
  abcGrandTotal: number;
  shareToken: string;
  publishedAt: string | null;
  revokedAt: string | null;
  aiPromptVersion: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProposalRecord {
  proposal: ProposalMainRow;
  sections: ProposalSectionRow[];
  pricingOptions: ProposalPricingOptionRow[];
  abcRows: ProposalAbcRowRecord[];
  responsibilityItems: ProposalResponsibilityRow[];
  media: ProposalMediaRow[];
  scheduleRows: ProposalScheduleRowRecord[];
  company: ProposalCompany;
  responsible: ProposalTechnicalResponsible | null;
  /** Nome do orçamento de origem — só para a UI, não entra no PDF. */
  budgetName: string | null;
}

export interface ProposalListItem {
  id: string;
  budgetId: string;
  budgetName: string | null;
  proposalNumber: number;
  version: number;
  projectTitle: string;
  clientName: string;
  city: string;
  status: 'draft' | 'published' | 'archived';
  grandTotal: number;
  shareToken: string;
  publishedAt: string | null;
  revokedAt: string | null;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Parsers de JSONB — tolerantes por princípio: uma proposta salva antes de um
// campo existir não pode derrubar a tela do usuário.
// ---------------------------------------------------------------------------

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function str(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function strOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function stringList(value: unknown): string[] {
  return asArray(value).filter((item): item is string => typeof item === 'string');
}

export function parseRichBlock(value: unknown): ProposalRichBlock | null {
  const row = asRecord(value);
  if (!row) return null;

  return {
    heading: strOrNull(row.heading),
    paragraphs: stringList(row.paragraphs),
    bullets: stringList(row.bullets),
  };
}

export function parseRichBlockList(value: unknown): ProposalRichBlock[] {
  return asArray(value)
    .map((item) => parseRichBlock(item))
    .filter((block): block is ProposalRichBlock => block !== null);
}

function parseFacts(value: unknown): ProposalActivityFact[] {
  return asArray(value)
    .map((item) => asRecord(item))
    .filter((row): row is Record<string, unknown> => row !== null)
    .map((row) => ({
      label: str(row.label),
      quantity: toNumber(row.quantity),
      unit: str(row.unit, 'un'),
      isApproximate: row.isApproximate === true,
    }));
}

export function parseActivities(value: unknown): ProposalActivityGroup[] {
  return asArray(value)
    .map((item) => asRecord(item))
    .filter((row): row is Record<string, unknown> => row !== null)
    .map((row, index) => ({
      order: toNumber(row.order) || index + 1,
      title: str(row.title),
      intro: str(row.intro),
      items: stringList(row.items),
      note: parseRichBlock(row.note),
      facts: parseFacts(row.facts),
    }))
    .sort((a, b) => a.order - b.order);
}

export function parseMaterials(value: unknown): ProposalMaterialRow[] {
  return asArray(value)
    .map((item) => asRecord(item))
    .filter((row): row is Record<string, unknown> => row !== null)
    .map((row) => {
      const quantity = toNumber(row.quantity);
      const unitPrice = toNumber(row.unitPrice);
      return {
        code: strOrNull(row.code),
        name: str(row.name, 'Material sem nome'),
        subgroup: strOrNull(row.subgroup),
        unit: str(row.unit, 'un'),
        quantity,
        unitPrice,
        subtotal: row.subtotal === undefined ? round2(quantity * unitPrice) : toNumber(row.subtotal),
      };
    });
}

export function parseScheduleColumns(value: unknown): ProposalScheduleColumn[] {
  return asArray(value)
    .map((item) => asRecord(item))
    .filter((row): row is Record<string, unknown> => row !== null)
    .map((row, index) => ({
      key: str(row.key, `col${index + 1}`),
      label: str(row.label, `Etapa ${index + 1}`),
    }));
}

function parseMarks(value: unknown): Record<string, boolean | string> {
  const row = asRecord(value);
  if (!row) return {};

  const marks: Record<string, boolean | string> = {};
  for (const [key, mark] of Object.entries(row)) {
    if (typeof mark === 'boolean' || typeof mark === 'string') marks[key] = mark;
  }
  return marks;
}

function parseInstitutional(value: unknown): ProposalData['institutional'] {
  const row = asRecord(value) ?? {};
  return {
    quemSomos: parseRichBlock(row.quemSomos),
    identidade: parseRichBlock(row.identidade),
    compromisso: parseRichBlock(row.compromisso),
    diferencialOrcaRede: parseRichBlock(row.diferencialOrcaRede),
  };
}

function parseSectionKey(value: unknown): ProposalSectionKey | null {
  return typeof value === 'string' && (PROPOSAL_SECTION_KEYS as string[]).includes(value)
    ? (value as ProposalSectionKey)
    : null;
}

// ---------------------------------------------------------------------------
// Leitura
// ---------------------------------------------------------------------------

const PROPOSAL_COLUMNS = `
  id, user_id, budget_id, template_id, technical_responsible_id,
  proposal_number, version, scope_label, project_title, project_subtitle,
  client_name, city, issued_at, validity_date, status,
  units_count, units_label, institutional, activities, materials_snapshot,
  billing_conditions, final_considerations, acceptance_closing_text,
  schedule_columns, schedule_footnote, abc_grand_total,
  share_token, published_at, revoked_at, ai_prompt_version,
  created_at, updated_at
`;

function mapProposalRow(row: Record<string, unknown>): ProposalMainRow {
  const status = str(row.status, 'draft');

  return {
    id: str(row.id),
    userId: str(row.user_id),
    budgetId: str(row.budget_id),
    templateId: strOrNull(row.template_id),
    technicalResponsibleId: strOrNull(row.technical_responsible_id),
    proposalNumber: toNumber(row.proposal_number),
    version: toNumber(row.version),
    scopeLabel: str(row.scope_label, 'TIPO DE ESCOPO'),
    projectTitle: str(row.project_title),
    projectSubtitle: strOrNull(row.project_subtitle),
    clientName: str(row.client_name),
    city: str(row.city),
    issuedAt: str(row.issued_at),
    validityDate: strOrNull(row.validity_date),
    status: status === 'published' || status === 'archived' ? status : 'draft',
    unitsCount: row.units_count === null || row.units_count === undefined ? null : toNumber(row.units_count),
    unitsLabel: strOrNull(row.units_label),
    institutional: parseInstitutional(row.institutional),
    activities: parseActivities(row.activities),
    materialsSnapshot: parseMaterials(row.materials_snapshot),
    billingConditions: parseRichBlock(row.billing_conditions),
    finalConsiderations: parseRichBlockList(row.final_considerations),
    acceptanceClosingText: strOrNull(row.acceptance_closing_text),
    scheduleColumns: parseScheduleColumns(row.schedule_columns),
    scheduleFootnote: strOrNull(row.schedule_footnote),
    abcGrandTotal: toNumber(row.abc_grand_total),
    shareToken: str(row.share_token),
    publishedAt: strOrNull(row.published_at),
    revokedAt: strOrNull(row.revoked_at),
    aiPromptVersion: strOrNull(row.ai_prompt_version),
    createdAt: str(row.created_at),
    updatedAt: str(row.updated_at),
  };
}

/** Empresa do usuário. Campos vazios são legítimos: a tela de Configurações
 *  salva cadastro pela metade, e a proposta só é bloqueada ao publicar. */
export async function loadCompanySettings(
  supabase: SupabaseClient,
  userId: string,
): Promise<ProposalCompany> {
  const { data } = await supabase
    .from('company_settings')
    .select(
      'legal_name, trade_name, cnpj, address, phone_primary, phone_secondary, email, website, instagram, whatsapp_number, logo_url',
    )
    .eq('user_id', userId)
    .maybeSingle();

  const row = (data ?? {}) as Record<string, unknown>;

  return {
    legalName: str(row.legal_name),
    tradeName: strOrNull(row.trade_name),
    cnpj: str(row.cnpj),
    address: str(row.address),
    phonePrimary: str(row.phone_primary),
    phoneSecondary: strOrNull(row.phone_secondary),
    email: str(row.email),
    website: strOrNull(row.website),
    instagram: strOrNull(row.instagram),
    whatsappNumber: str(row.whatsapp_number),
    logoUrl: strOrNull(row.logo_url),
  };
}

async function loadResponsible(
  supabase: SupabaseClient,
  responsibleId: string | null,
): Promise<ProposalTechnicalResponsible | null> {
  if (!responsibleId) return null;

  const { data } = await supabase
    .from('technical_responsibles')
    .select('full_name, crea, signature_url')
    .eq('id', responsibleId)
    .maybeSingle();

  if (!data) return null;
  const row = data as Record<string, unknown>;

  return {
    fullName: str(row.full_name),
    crea: str(row.crea),
    signatureUrl: strOrNull(row.signature_url),
  };
}

/**
 * Carrega a proposta inteira. Devolve `null` quando ela não existe ou não é do
 * usuário — o RLS já garante isso, o `.eq('user_id')` é cinto e suspensório.
 */
export async function loadProposalRecord(
  supabase: SupabaseClient,
  userId: string,
  proposalId: string,
): Promise<ProposalRecord | null> {
  const { data, error } = await supabase
    .from('proposals')
    .select(PROPOSAL_COLUMNS)
    .eq('id', proposalId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error || !data) return null;

  return loadProposalChildren(supabase, mapProposalRow(data as Record<string, unknown>), {
    includeBudgetName: true,
  });
}

/**
 * Carrega a proposta pelo token do link público.
 *
 * Não recebe `userId` de propósito: quem autoriza é o RLS, comparando o token
 * apresentado na requisição (header `x-proposal-token`) com `share_token`. Sem
 * token válido a consulta simplesmente não devolve linha — falha fechada.
 *
 * Use com o cliente de `createSupabasePublicProposalClient`, que é anônimo e
 * carrega o header. Com um cliente autenticado, a policy do dono responderia no
 * lugar da anônima e o dono veria a própria proposta mesmo sem publicar.
 */
export async function loadPublicProposalByToken(
  supabase: SupabaseClient,
  shareToken: string,
): Promise<ProposalRecord | null> {
  const { data, error } = await supabase
    .from('proposals')
    .select(PROPOSAL_COLUMNS)
    .eq('share_token', shareToken)
    .maybeSingle();

  if (error || !data) return null;

  // `budgets` não tem leitura anônima, e o nome interno do orçamento não é
  // assunto do cliente — a peça pública usa o título do projeto.
  return loadProposalChildren(supabase, mapProposalRow(data as Record<string, unknown>), {
    includeBudgetName: false,
  });
}

/** Filhos, empresa e responsável de uma proposta já resolvida e autorizada. */
async function loadProposalChildren(
  supabase: SupabaseClient,
  proposal: ProposalMainRow,
  options: { includeBudgetName: boolean },
): Promise<ProposalRecord> {
  const proposalId = proposal.id;

  const budgetNamePromise: Promise<string | null> = (async () => {
    if (!options.includeBudgetName) return null;
    const { data } = await supabase
      .from('budgets')
      .select('project_name')
      .eq('id', proposal.budgetId)
      .maybeSingle();
    return data ? str((data as Record<string, unknown>).project_name) : null;
  })();

  const [
    sectionsResult,
    optionsResult,
    segmentsResult,
    termsResult,
    abcResult,
    responsibilityResult,
    mediaResult,
    scheduleResult,
    budgetName,
    company,
    responsible,
  ] = await Promise.all([
    supabase
      .from('proposal_sections')
      .select('id, section_key, title, order_index, enabled, content')
      .eq('proposal_id', proposalId)
      .order('order_index', { ascending: true }),
    supabase
      .from('proposal_pricing_options')
      .select(
        'id, saved_pricing_budget_id, label, is_recommended, order_index, material_total, labor_total, grand_total, units_count, units_label, amount_per_unit',
      )
      .eq('proposal_id', proposalId)
      .order('order_index', { ascending: true }),
    supabase
      .from('proposal_segment_totals')
      .select(
        'id, pricing_option_id, segment_id, label, material_amount, labor_amount, total_amount, percent, order_index',
      )
      .eq('proposal_id', proposalId)
      .order('order_index', { ascending: true }),
    supabase
      .from('proposal_payment_terms')
      .select('id, pricing_option_id, order_index, percent, amount, due_label, due_date')
      .eq('proposal_id', proposalId)
      .order('order_index', { ascending: true }),
    supabase
      .from('proposal_abc_rows')
      .select('id, curve, label, amount, percent, order_index')
      .eq('proposal_id', proposalId)
      .order('order_index', { ascending: true }),
    supabase
      .from('proposal_responsibility_items')
      .select('id, order_index, description, responsible')
      .eq('proposal_id', proposalId)
      .order('order_index', { ascending: true }),
    supabase
      .from('proposal_media')
      .select('id, section_key, media_id, url, caption, group_label, order_index')
      .eq('proposal_id', proposalId)
      .order('order_index', { ascending: true }),
    supabase
      .from('proposal_schedule_rows')
      .select('id, order_index, stage, marks')
      .eq('proposal_id', proposalId)
      .order('order_index', { ascending: true }),
    budgetNamePromise,
    loadCompanySettings(supabase, proposal.userId),
    loadResponsible(supabase, proposal.technicalResponsibleId),
  ]);

  const segmentsByOption = new Map<string, ProposalSegmentTotalRow[]>();
  for (const raw of (segmentsResult.data ?? []) as Record<string, unknown>[]) {
    const row: ProposalSegmentTotalRow = {
      id: str(raw.id),
      pricingOptionId: str(raw.pricing_option_id),
      segmentId: strOrNull(raw.segment_id),
      label: str(raw.label),
      materialAmount: toNumber(raw.material_amount),
      laborAmount: toNumber(raw.labor_amount),
      totalAmount: toNumber(raw.total_amount),
      percent: toNumber(raw.percent),
      orderIndex: toNumber(raw.order_index),
    };
    const list = segmentsByOption.get(row.pricingOptionId) ?? [];
    list.push(row);
    segmentsByOption.set(row.pricingOptionId, list);
  }

  const termsByOption = new Map<string, ProposalPaymentTermRow[]>();
  for (const raw of (termsResult.data ?? []) as Record<string, unknown>[]) {
    const row: ProposalPaymentTermRow = {
      id: str(raw.id),
      pricingOptionId: str(raw.pricing_option_id),
      orderIndex: toNumber(raw.order_index),
      percent: toNumber(raw.percent),
      amount: toNumber(raw.amount),
      dueLabel: str(raw.due_label),
      dueDate: strOrNull(raw.due_date),
    };
    const list = termsByOption.get(row.pricingOptionId) ?? [];
    list.push(row);
    termsByOption.set(row.pricingOptionId, list);
  }

  const pricingOptions: ProposalPricingOptionRow[] = (
    (optionsResult.data ?? []) as Record<string, unknown>[]
  ).map((raw) => {
    const id = str(raw.id);
    return {
      id,
      savedPricingBudgetId: strOrNull(raw.saved_pricing_budget_id),
      label: str(raw.label),
      isRecommended: raw.is_recommended === true,
      orderIndex: toNumber(raw.order_index),
      materialTotal: toNumber(raw.material_total),
      laborTotal: toNumber(raw.labor_total),
      grandTotal: toNumber(raw.grand_total),
      unitsCount: raw.units_count === null || raw.units_count === undefined ? null : toNumber(raw.units_count),
      unitsLabel: strOrNull(raw.units_label),
      amountPerUnit:
        raw.amount_per_unit === null || raw.amount_per_unit === undefined
          ? null
          : toNumber(raw.amount_per_unit),
      segments: segmentsByOption.get(id) ?? [],
      paymentTerms: termsByOption.get(id) ?? [],
    };
  });

  const sections: ProposalSectionRow[] = ((sectionsResult.data ?? []) as Record<string, unknown>[])
    .map((raw) => {
      const sectionKey = parseSectionKey(raw.section_key);
      if (!sectionKey) return null;
      return {
        id: str(raw.id),
        sectionKey,
        title: str(raw.title),
        orderIndex: toNumber(raw.order_index),
        enabled: raw.enabled !== false,
        content: asRecord(raw.content),
      };
    })
    .filter((row): row is ProposalSectionRow => row !== null);

  const media: ProposalMediaRow[] = ((mediaResult.data ?? []) as Record<string, unknown>[])
    .map((raw) => {
      const sectionKey = parseSectionKey(raw.section_key);
      if (!sectionKey) return null;
      return {
        id: str(raw.id),
        sectionKey,
        mediaId: strOrNull(raw.media_id),
        url: str(raw.url),
        caption: strOrNull(raw.caption),
        groupLabel: strOrNull(raw.group_label),
        orderIndex: toNumber(raw.order_index),
      };
    })
    .filter((row): row is ProposalMediaRow => row !== null);

  const record: ProposalRecord = {
    proposal,
    sections,
    pricingOptions,
    abcRows: ((abcResult.data ?? []) as Record<string, unknown>[]).map((raw) => ({
      id: str(raw.id),
      curve: raw.curve === 'A' || raw.curve === 'B' ? raw.curve : 'C',
      label: str(raw.label),
      amount: toNumber(raw.amount),
      percent: toNumber(raw.percent),
      orderIndex: toNumber(raw.order_index),
    })),
    responsibilityItems: ((responsibilityResult.data ?? []) as Record<string, unknown>[]).map(
      (raw) => ({
        id: str(raw.id),
        orderIndex: toNumber(raw.order_index),
        description: str(raw.description),
        responsible:
          raw.responsible === 'contratante' || raw.responsible === 'ambos'
            ? raw.responsible
            : 'contratada',
      }),
    ),
    media,
    scheduleRows: ((scheduleResult.data ?? []) as Record<string, unknown>[]).map((raw) => ({
      id: str(raw.id),
      orderIndex: toNumber(raw.order_index),
      stage: str(raw.stage),
      marks: parseMarks(raw.marks),
    })),
    company,
    responsible,
    budgetName,
  };

  return record;
}

/** Lista de propostas do usuário, do mais recente para o mais antigo. */
export async function listProposals(
  supabase: SupabaseClient,
  userId: string,
): Promise<ProposalListItem[]> {
  const { data, error } = await supabase
    .from('proposals')
    .select(
      `id, budget_id, proposal_number, version, project_title, client_name, city, status,
       share_token, published_at, revoked_at, updated_at,
       budgets ( project_name ),
       proposal_pricing_options ( grand_total, is_recommended, order_index )`,
    )
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(200);

  if (error) throw new Error(error.message);

  return ((data ?? []) as Record<string, unknown>[]).map((raw) => {
    const options = asArray(raw.proposal_pricing_options)
      .map((item) => asRecord(item))
      .filter((row): row is Record<string, unknown> => row !== null);

    const preferred =
      options.find((option) => option.is_recommended === true) ??
      options.sort((a, b) => toNumber(a.order_index) - toNumber(b.order_index))[0];

    const budget = asRecord(Array.isArray(raw.budgets) ? raw.budgets[0] : raw.budgets);
    const status = str(raw.status, 'draft');

    return {
      id: str(raw.id),
      budgetId: str(raw.budget_id),
      budgetName: budget ? str(budget.project_name) : null,
      proposalNumber: toNumber(raw.proposal_number),
      version: toNumber(raw.version),
      projectTitle: str(raw.project_title),
      clientName: str(raw.client_name),
      city: str(raw.city),
      status: status === 'published' || status === 'archived' ? status : 'draft',
      grandTotal: preferred ? toNumber(preferred.grand_total) : 0,
      shareToken: str(raw.share_token),
      publishedAt: strOrNull(raw.published_at),
      revokedAt: strOrNull(raw.revoked_at),
      updatedAt: str(raw.updated_at),
    };
  });
}

// ---------------------------------------------------------------------------
// Projeção no contrato canônico
// ---------------------------------------------------------------------------

export function abcFromRows(rows: ProposalAbcRowRecord[], grandTotal: number): ProposalAbc {
  const mapped = rows
    .slice()
    .sort((a, b) => a.orderIndex - b.orderIndex)
    .map((row) => ({
      curve: row.curve,
      label: row.label,
      amount: row.amount,
      percent: row.percent,
      order: row.orderIndex,
    }));

  return { rows: mapped, totals: totalsFromAbcRows(mapped, grandTotal), grandTotal };
}

/** Projeta o registro no `ProposalData` que o PDF e a página pública consomem. */
export function toProposalData(record: ProposalRecord): ProposalData {
  const { proposal } = record;

  const sections: ProposalSectionConfig[] = record.sections
    .slice()
    .sort((a, b) => a.orderIndex - b.orderIndex)
    .map((section, index) => ({
      key: section.sectionKey,
      title: section.title,
      // Reordenação por índice de posição: `order` duplicado é erro de validação,
      // e reordenar em lote no banco pode deixar buracos ou empates.
      order: index + 1,
      enabled: section.enabled,
    }));

  const mediaFor = (key: MediaSectionKey) =>
    record.media
      .filter((item) => item.sectionKey === key)
      .sort((a, b) => a.orderIndex - b.orderIndex)
      .map((item, index) => ({
        url: item.url,
        caption: item.caption,
        order: index + 1,
        group: item.groupLabel,
      }));

  return {
    id: proposal.id,
    budgetId: proposal.budgetId,
    status: proposal.status,

    header: {
      proposalNumber: proposal.proposalNumber,
      version: proposal.version,
      scopeLabel: proposal.scopeLabel,
      projectTitle: proposal.projectTitle,
      projectSubtitle: proposal.projectSubtitle,
      clientName: proposal.clientName,
      city: proposal.city,
      issuedAt: proposal.issuedAt,
      validityDate: proposal.validityDate,
    },

    company: record.company,
    responsible: record.responsible,
    sections,
    institutional: proposal.institutional,

    media: {
      seuProjeto: mediaFor('seu_projeto'),
      localizacao: mediaFor('localizacao'),
      fotosObra: mediaFor('fotos_obra'),
    },

    activities: proposal.activities,
    materials: proposal.materialsSnapshot,
    abc: abcFromRows(record.abcRows, proposal.abcGrandTotal),
    billingConditions: proposal.billingConditions,

    pricingOptions: record.pricingOptions
      .slice()
      .sort((a, b) => a.orderIndex - b.orderIndex)
      .map((option) => ({
        savedPricingBudgetId: option.savedPricingBudgetId ?? '',
        label: option.label,
        isRecommended: option.isRecommended,
        globals: {
          materialTotal: option.materialTotal,
          laborTotal: option.laborTotal,
          grandTotal: option.grandTotal,
        },
        segments: option.segments
          .slice()
          .sort((a, b) => a.orderIndex - b.orderIndex)
          .map((segment, index) => ({
            label: segment.label,
            materialAmount: segment.materialAmount,
            laborAmount: segment.laborAmount,
            totalAmount: segment.totalAmount,
            percent: segment.percent,
            order: index + 1,
          })),
        paymentTerms: option.paymentTerms
          .slice()
          .sort((a, b) => a.orderIndex - b.orderIndex)
          .map((term, index) => ({
            order: index + 1,
            percent: term.percent,
            amount: term.amount,
            dueLabel: term.dueLabel,
          })),
        unitInvestment:
          option.unitsCount && option.unitsCount > 0
            ? {
                unitsCount: option.unitsCount,
                unitsLabel: option.unitsLabel ?? proposal.unitsLabel ?? 'unidades',
                amountPerUnit: option.amountPerUnit ?? round2(option.grandTotal / option.unitsCount),
              }
            : proposal.unitsCount && proposal.unitsCount > 0
              ? {
                  unitsCount: proposal.unitsCount,
                  unitsLabel: proposal.unitsLabel ?? 'unidades',
                  amountPerUnit: round2(option.grandTotal / proposal.unitsCount),
                }
              : null,
      })),

    schedule: {
      columns: proposal.scheduleColumns,
      rows: record.scheduleRows
        .slice()
        .sort((a, b) => a.orderIndex - b.orderIndex)
        .map((row, index) => ({ order: index + 1, stage: row.stage, marks: row.marks })),
      footnote: proposal.scheduleFootnote,
    },

    responsibilityMatrix: record.responsibilityItems
      .slice()
      .sort((a, b) => a.orderIndex - b.orderIndex)
      .map((item, index) => ({
        order: index + 1,
        description: item.description,
        responsible: item.responsible,
      })),

    finalConsiderations: proposal.finalConsiderations,
    acceptance: { closingText: proposal.acceptanceClosingText ?? '' },
  };
}
