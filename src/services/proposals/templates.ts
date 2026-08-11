import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

import type { ProposalRichBlock, ProposalSectionKey } from '@/types/proposal';

import { DEFAULT_SECTIONS } from './defaults';
import { parseRichBlock, parseRichBlockList, PROPOSAL_SECTION_KEYS } from './repository';

/**
 * Templates de proposta — o boilerplate institucional que a proposta COPIA na
 * criação. Editar o template depois não mexe em proposta já criada, e é essa
 * cópia que impede a divergência de estrutura entre duas propostas (§8.1).
 */

export interface ProposalTemplateSection {
  key: ProposalSectionKey;
  title: string;
  order: number;
  enabled: boolean;
}

export interface ProposalTemplateRecord {
  id: string;
  name: string;
  isDefault: boolean;
  scopeLabel: string;
  sections: ProposalTemplateSection[];
  institutional: {
    quemSomos: ProposalRichBlock | null;
    identidade: ProposalRichBlock | null;
    compromisso: ProposalRichBlock | null;
    diferencialOrcaRede: ProposalRichBlock | null;
  };
  billingConditions: ProposalRichBlock | null;
  finalConsiderations: ProposalRichBlock[];
  acceptanceClosingText: string | null;
  responsibilityItems: Array<{
    orderIndex: number;
    description: string;
    responsible: 'contratada' | 'contratante' | 'ambos';
  }>;
}

export interface ProposalTemplateSummary {
  id: string;
  name: string;
  description: string | null;
  isDefault: boolean;
}

function parseSections(value: unknown): ProposalTemplateSection[] {
  if (!Array.isArray(value)) return DEFAULT_SECTIONS;

  const parsed = value
    .map((item, index) => {
      const row = item && typeof item === 'object' ? (item as Record<string, unknown>) : null;
      if (!row) return null;
      const key = typeof row.key === 'string' ? row.key : '';
      if (!(PROPOSAL_SECTION_KEYS as string[]).includes(key)) return null;

      return {
        key: key as ProposalSectionKey,
        title: typeof row.title === 'string' && row.title.trim() ? row.title : key,
        order: typeof row.order === 'number' ? row.order : index + 1,
        enabled: row.enabled !== false,
      };
    })
    .filter((row): row is ProposalTemplateSection => row !== null)
    .sort((a, b) => a.order - b.order);

  return parsed.length > 0 ? parsed : DEFAULT_SECTIONS;
}

export async function listProposalTemplates(
  supabase: SupabaseClient,
  _userId: string,
): Promise<ProposalTemplateSummary[]> {
  const { data, error } = await supabase
    .from('proposal_templates')
    .select('id, name, description, is_default')
    .order('is_default', { ascending: false })
    .order('name', { ascending: true });

  if (error) throw new Error(error.message);

  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    id: String(row.id ?? ''),
    name: typeof row.name === 'string' ? row.name : 'Template',
    description: typeof row.description === 'string' ? row.description : null,
    isDefault: row.is_default === true,
  }));
}

/**
 * Carrega o template pedido; sem id, o marcado como padrão. `null` quando o
 * usuário ainda não tem template nenhum — a proposta nasce com as 19 seções
 * vazias, o que é melhor do que nascer com placeholder.
 */
export async function loadProposalTemplate(
  supabase: SupabaseClient,
  _userId: string,
  templateId?: string | null,
): Promise<ProposalTemplateRecord | null> {
  let query = supabase
    .from('proposal_templates')
    .select(
      'id, name, is_default, scope_label, default_sections, institutional, billing_conditions, final_considerations, acceptance_closing_text',
    );

  query = templateId ? query.eq('id', templateId) : query.eq('is_default', true);

  const { data } = await query.limit(1).maybeSingle();
  if (!data) return null;

  const row = data as Record<string, unknown>;
  const id = String(row.id ?? '');

  const { data: itemsData } = await supabase
    .from('proposal_template_responsibility_items')
    .select('order_index, description, responsible')
    .eq('template_id', id)
    .order('order_index', { ascending: true });

  const institutional = (row.institutional ?? {}) as Record<string, unknown>;

  return {
    id,
    name: typeof row.name === 'string' ? row.name : 'Template',
    isDefault: row.is_default === true,
    scopeLabel: typeof row.scope_label === 'string' ? row.scope_label : 'TIPO DE ESCOPO',
    sections: parseSections(row.default_sections),
    institutional: {
      quemSomos: parseRichBlock(institutional.quemSomos),
      identidade: parseRichBlock(institutional.identidade),
      compromisso: parseRichBlock(institutional.compromisso),
      diferencialOrcaRede: parseRichBlock(institutional.diferencialOrcaRede),
    },
    billingConditions: parseRichBlock(row.billing_conditions),
    finalConsiderations: parseRichBlockList(row.final_considerations),
    acceptanceClosingText:
      typeof row.acceptance_closing_text === 'string' ? row.acceptance_closing_text : null,
    responsibilityItems: ((itemsData ?? []) as Record<string, unknown>[]).map((item, index) => ({
      orderIndex: typeof item.order_index === 'number' ? item.order_index : index + 1,
      description: typeof item.description === 'string' ? item.description : '',
      responsible:
        item.responsible === 'contratante' || item.responsible === 'ambos'
          ? item.responsible
          : 'contratada',
    })),
  };
}
