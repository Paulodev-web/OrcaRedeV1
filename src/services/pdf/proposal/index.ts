import React from 'react';
import { renderToBuffer, renderToStream, type DocumentProps } from '@react-pdf/renderer';

import type { ProposalData } from '@/types/proposal';

import { ProposalDocument } from './ProposalDocument';
import { registerProposalFonts } from './fonts';
import { assertValidProposalData } from './validation';

/**
 * MOTOR DE PDF DA PROPOSTA COMERCIAL.
 *
 * Entrada única: `ProposalData` (`src/types/proposal.ts`). Este módulo não fala
 * com o Supabase, não conhece server action e não expõe rota — quem carrega os
 * dados é a camada de dados; aqui só se desenha.
 *
 * Runtime: Node. Sem navegador, sem Puppeteer — cabe nos 60s do plano Hobby.
 *
 * ```ts
 * import { renderProposalPdf } from '@/services/pdf/proposal';
 *
 * const pdf = await renderProposalPdf(data);           // Buffer
 * const pdf = await renderProposalPdf(data, {          // rascunho com placeholder
 *   allowPlaceholders: true,
 * });
 * ```
 */

export interface RenderProposalPdfOptions {
  /**
   * Pula a validação de coerência numérica. Use com muita parcimônia: é
   * exatamente essa checagem que impede uma proposta como a da Maxif4 — com a
   * Curva C repetindo o valor da Curva B — de chegar ao cliente.
   */
  skipValidation?: boolean;
  /**
   * Permite placeholder de template no texto ("TEXTO DO SEU PARÁGRAFO", `{{…}}`).
   * Só faz sentido para pré-visualização de rascunho.
   */
  allowPlaceholders?: boolean;
}

/**
 * Monta o elemento React do documento, sem renderizar.
 * Útil para pré-visualização e para testes de estrutura.
 */
export function buildProposalDocument(data: ProposalData): React.ReactElement<DocumentProps> {
  registerProposalFonts();
  // `ProposalDocument` tem `<Document>` na raiz; o cast só informa isso ao TS,
  // que não consegue inferir o elemento raiz de um componente.
  return React.createElement(ProposalDocument, { data }) as React.ReactElement<DocumentProps>;
}

function prepare(
  data: ProposalData,
  options: RenderProposalPdfOptions,
): React.ReactElement<DocumentProps> {
  if (!options.skipValidation) {
    assertValidProposalData(data, { allowPlaceholders: options.allowPlaceholders });
  }
  return buildProposalDocument(data);
}

/**
 * Renderiza a proposta em um `Buffer` de PDF.
 * Lança `ProposalValidationError` antes de desenhar qualquer coisa se os
 * números não fecharem.
 */
export async function renderProposalPdf(
  data: ProposalData,
  options: RenderProposalPdfOptions = {},
): Promise<Buffer> {
  return renderToBuffer(prepare(data, options));
}

/**
 * Mesma coisa, em stream — preferível quando a resposta HTTP pode ser
 * transmitida progressivamente, para não segurar o PDF inteiro em memória.
 */
export async function renderProposalPdfToStream(
  data: ProposalData,
  options: RenderProposalPdfOptions = {},
): Promise<NodeJS.ReadableStream> {
  return renderToStream(prepare(data, options));
}

export { ProposalDocument } from './ProposalDocument';
export { registerProposalFonts, isUsingFallbackFonts } from './fonts';
export {
  ProposalValidationError,
  assertValidProposalData,
  validateProposalData,
  type ProposalValidationCode,
  type ProposalValidationIssue,
} from './validation';
export { SECTION_REGISTRY } from './sections';
