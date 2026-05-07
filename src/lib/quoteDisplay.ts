/**
 * Utilitários para exibição de nomes de orçamentos/cotações.
 * Prioridade: display_name > nome do arquivo PDF > supplier_name
 */

/**
 * Extrai o nome padrão a partir do caminho do arquivo PDF.
 * Remove a extensão .pdf e retorna o basename.
 */
export function pdfPathToDefaultDisplayName(pdfPath: string | null | undefined): string {
  if (!pdfPath) return '';

  // Pega o último segmento do path (basename)
  const segments = pdfPath.split('/');
  const basename = segments[segments.length - 1] || '';

  // Remove extensão .pdf (case-insensitive)
  return basename.replace(/\.pdf$/i, '').trim();
}

/**
 * Retorna o label preferido para exibição de um orçamento.
 * Prioridade: display_name > nome do arquivo > supplier_name
 */
export function getQuoteLabel(quote: {
  display_name?: string | null;
  pdf_path?: string | null;
  supplier_name?: string;
}): string {
  const trimmedDisplayName = quote.display_name?.trim();
  if (trimmedDisplayName) {
    return trimmedDisplayName;
  }

  const fromPath = pdfPathToDefaultDisplayName(quote.pdf_path);
  if (fromPath) {
    return fromPath;
  }

  return quote.supplier_name || 'Orçamento';
}
