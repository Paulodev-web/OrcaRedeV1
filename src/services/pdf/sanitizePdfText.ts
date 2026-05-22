import type { PDFFont } from 'pdf-lib';

/**
 * Helvetica (WinAnsi) não aceita tab, quebras de linha nem vários controles Unicode.
 * Dados de cotação/fornecedor podem vir do PDF extraído com \t no texto.
 */
export function sanitizePdfText(text: string, font?: PDFFont): string {
  let value = (text ?? '')
    .replace(/\t/g, ' ')
    .replace(/\r\n?|\n/g, ' ')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!font || value.length === 0) return value;

  const safe: string[] = [];
  for (const char of value) {
    try {
      font.encodeText(char);
      safe.push(char);
    } catch {
      safe.push(' ');
    }
  }

  return safe.join('').replace(/\s+/g, ' ').trim();
}
