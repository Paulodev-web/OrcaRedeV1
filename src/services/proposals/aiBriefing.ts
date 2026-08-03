import type { ProposalTechnicalReference } from '@/services/ai/proposal';

import type { ProposalRecord } from './repository';

/**
 * BRIEFING DA IA — o que o orçamento não sabe e o modelo precisa.
 *
 * Tipo de obra, UF, condicionantes de ambiente, anotações do orçamentista e as
 * normas citáveis não existem em nenhuma tabela do orçamento, e sem eles o
 * rascunho vira texto genérico. São persistidos em
 * `proposal_sections.content.aiBriefing` da seção `descricao_atividades` — a
 * coluna existe para "sobrescritas e extras específicos desta seção", e é a
 * seção que mais consome o briefing.
 *
 * A lista de normas é fechada de propósito: o guardrail de número rejeita
 * qualquer código normativo fora dela, e é isso que impede o modelo de inventar
 * "NT.00012" ou trocar GED-4101 por GED-4110 numa proposta de engenharia.
 */

export interface ProposalAiBriefing {
  /** Ex.: "Condomínio residencial de alto padrão com rede subterrânea". */
  workType: string;
  /** Nome comercial do empreendimento, quando diferente do nome do orçamento. */
  developmentName: string;
  /** Sigla da UF. Ex.: "RS". */
  state: string;
  /** Concessionária local. Vem do orçamento quando houver. */
  utility: string;
  /** Ex.: "orla marítima — risco de corrosão classe C5". */
  environmentConstraints: string;
  /** Anotações do orçamentista que devem entrar na prosa. */
  authorNotes: string;
  technicalReferences: ProposalTechnicalReference[];
  /**
   * Observação obrigatória por grupo de atividade, chaveada pelo `segment_id`
   * (string vazia = não segmentado). Ex.: a ressalva de eletrodutos não
   * previstos em projeto da proposta da Andora.
   */
  activityNotes: Record<string, string>;
}

export const EMPTY_AI_BRIEFING: ProposalAiBriefing = {
  workType: '',
  developmentName: '',
  state: '',
  utility: '',
  environmentConstraints: '',
  authorNotes: '',
  technicalReferences: [],
  activityNotes: {},
};

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

export function parseAiBriefing(value: unknown): ProposalAiBriefing {
  const row = value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
  if (!row) return { ...EMPTY_AI_BRIEFING };

  const references = Array.isArray(row.technicalReferences) ? row.technicalReferences : [];
  const notes =
    row.activityNotes && typeof row.activityNotes === 'object' && !Array.isArray(row.activityNotes)
      ? (row.activityNotes as Record<string, unknown>)
      : {};

  return {
    workType: str(row.workType),
    developmentName: str(row.developmentName),
    state: str(row.state),
    utility: str(row.utility),
    environmentConstraints: str(row.environmentConstraints),
    authorNotes: str(row.authorNotes),
    technicalReferences: references
      .map((item) => (item && typeof item === 'object' ? (item as Record<string, unknown>) : null))
      .filter((item): item is Record<string, unknown> => item !== null)
      .map((item) => ({
        code: str(item.code),
        issuer: str(item.issuer),
        subject: str(item.subject),
        revision: str(item.revision) || null,
      }))
      .filter((reference) => reference.code.trim().length > 0),
    activityNotes: Object.fromEntries(
      Object.entries(notes).map(([key, note]) => [key, str(note)]),
    ),
  };
}

/** Lê o briefing salvo no registro da proposta. */
export function getAiBriefing(record: ProposalRecord): ProposalAiBriefing {
  const section = record.sections.find((item) => item.sectionKey === 'descricao_atividades');
  return parseAiBriefing(section?.content?.aiBriefing);
}
