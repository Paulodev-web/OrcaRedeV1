/**
 * Utilitários para exibição de nomes de orçamentos/cotações.
 * Prioridade: display_name > nome do arquivo PDF > supplier_name
 */

/**
 * Extrai o nome legível do arquivo a partir do caminho no Storage.
 * Remove o prefixo numérico de upload (Date.now()) e a extensão .pdf.
 */
export function storageFileNameFromPath(path: string | null | undefined): string {
  if (!path) return '';

  const basename = path.split('/').pop() ?? '';
  const withoutExt = basename.replace(/\.pdf$/i, '').trim();
  const withoutUploadPrefix = withoutExt.replace(/^\d+_/, '').trim();

  return withoutUploadPrefix || withoutExt || basename;
}

/**
 * Extrai o nome padrão a partir do caminho do arquivo PDF.
 * Remove a extensão .pdf e retorna o basename.
 */
export function pdfPathToDefaultDisplayName(pdfPath: string | null | undefined): string {
  return storageFileNameFromPath(pdfPath);
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
