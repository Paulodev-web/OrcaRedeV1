/**
 * Parse defensivo da resposta de cada etapa.
 *
 * O `responseSchema` já garante a forma, mas o mesmo raciocínio de
 * `validateSuggestions` em `semanticMatch.ts` vale aqui: a resposta é entrada
 * não confiável até ser conferida. Campo faltando, tipo trocado e array com
 * elemento vazio são tratados como ausência, não como conteúdo.
 */

import type { ProposalRichBlock } from '@/types/proposal';

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter((item) => item.length > 0);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Converte a resposta em `ProposalRichBlock`, ou `null` quando o bloco veio
 * vazio. `heading` string vazia vira `null`, como manda o contrato canônico.
 */
export function parseRichBlock(value: unknown): ProposalRichBlock | null {
  if (!isRecord(value)) return null;

  const heading = asString(value.heading);
  const paragraphs = asStringArray(value.paragraphs);
  const bullets = asStringArray(value.bullets);

  if (paragraphs.length === 0 && bullets.length === 0) return null;

  return { heading: heading || null, paragraphs, bullets };
}

export interface CoverPayload {
  projectTitle: string;
  projectSubtitle: string | null;
}

export function parseCoverPayload(data: unknown): CoverPayload | null {
  if (!isRecord(data)) return null;
  const projectTitle = asString(data.projectTitle);
  if (!projectTitle) return null;
  const subtitle = asString(data.projectSubtitle);
  return { projectTitle, projectSubtitle: subtitle || null };
}

export interface InstitutionalPayload {
  quemSomos: ProposalRichBlock | null;
  identidade: ProposalRichBlock | null;
  compromisso: ProposalRichBlock | null;
  diferencialOrcaRede: ProposalRichBlock | null;
}

export function parseInstitutionalPayload(data: unknown): InstitutionalPayload | null {
  if (!isRecord(data)) return null;
  return {
    quemSomos: parseRichBlock(data.quemSomos),
    identidade: parseRichBlock(data.identidade),
    compromisso: parseRichBlock(data.compromisso),
    diferencialOrcaRede: parseRichBlock(data.diferencialOrcaRede),
  };
}

export interface ActivityGroupPayload {
  title: string;
  intro: string;
  items: string[];
  note: ProposalRichBlock | null;
}

export function parseActivityGroupPayload(data: unknown): ActivityGroupPayload | null {
  if (!isRecord(data)) return null;

  const title = asString(data.title);
  const intro = asString(data.intro);
  const items = asStringArray(data.items);

  if (!title || !intro || items.length === 0) return null;

  // `hasNote` existe porque objeto nullable aninhado é frágil na API: o modelo
  // devolve `{}` em vez de `null`. O booleano decide; o bloco só é lido se ele
  // for verdadeiro.
  const hasNote = data.hasNote === true;
  const note = hasNote ? parseRichBlock(data.note) : null;

  return { title, intro, items, note };
}

export interface CommercialPayload {
  billingConditions: ProposalRichBlock | null;
  scheduleFootnote: string | null;
  acceptanceClosingText: string;
}

export function parseCommercialPayload(data: unknown): CommercialPayload | null {
  if (!isRecord(data)) return null;

  const acceptanceClosingText = asString(data.acceptanceClosingText);
  if (!acceptanceClosingText) return null;

  const footnote = asString(data.scheduleFootnote);

  return {
    billingConditions: parseRichBlock(data.billingConditions),
    scheduleFootnote: footnote || null,
    acceptanceClosingText,
  };
}

export function parseConsiderationsPayload(data: unknown): ProposalRichBlock[] | null {
  if (!isRecord(data)) return null;
  if (!Array.isArray(data.finalConsiderations)) return null;

  const blocks = data.finalConsiderations
    .map(parseRichBlock)
    .filter((block): block is ProposalRichBlock => block !== null);

  return blocks.length > 0 ? blocks : null;
}

export interface MediaTagPayload {
  tag: string;
  confidence: number;
  rationale: string;
}

/** Só devolve tags do vocabulário, sem repetição, com confidence válido. */
export function parseMediaTagsPayload(
  data: unknown,
  availableTags: string[]
): MediaTagPayload[] {
  if (!isRecord(data) || !Array.isArray(data.suggestions)) return [];

  const allowed = new Set(availableTags);
  const seen = new Set<string>();
  const out: MediaTagPayload[] = [];

  for (const entry of data.suggestions) {
    if (!isRecord(entry)) continue;

    const tag = asString(entry.tag);
    if (!tag || !allowed.has(tag) || seen.has(tag)) continue;

    const confidence = Math.round(Number(entry.confidence));
    if (!Number.isFinite(confidence) || confidence < 0 || confidence > 100) continue;

    seen.add(tag);
    out.push({ tag, confidence, rationale: asString(entry.rationale) });
  }

  return out;
}

/** Todo texto de um bloco, achatado — usado pelo guardrail e por diffs. */
export function flattenRichBlock(block: ProposalRichBlock | null): string {
  if (!block) return '';
  return [block.heading ?? '', ...block.paragraphs, ...block.bullets]
    .filter(Boolean)
    .join('\n');
}
