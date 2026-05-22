import type { PDFPage, PDFFont } from 'pdf-lib';
import type { PdfDocumentMeta, SupplierPdfInfo } from '@/types/pdfExport';
import { sanitizePdfText } from './sanitizePdfText';
import {
  COLOR_META,
  COLOR_TITLE,
  CONTENT_LEFT,
  META_LINE_GAP,
  META_LINE_SIZE,
  SUPPLIER_LINE_GAP,
  SUPPLIER_LINE_SIZE,
  TITLE_SIZE,
} from './constants';

function pushLine(lines: string[], label: string, value: string | null | undefined) {
  const v = value?.trim();
  if (v) lines.push(`${label}: ${v}`);
}

export function measureSupplierBlockHeight(
  supplier: SupplierPdfInfo | undefined,
  meta: PdfDocumentMeta | undefined
): number {
  let h = 0;
  if (supplier?.name) {
    h += TITLE_SIZE + SUPPLIER_LINE_GAP;
    const detailLines: string[] = [];
    pushLine(detailLines, 'CNPJ', supplier.cnpj);
    pushLine(detailLines, 'Telefone', supplier.phone);
    pushLine(detailLines, 'E-mail', supplier.email);
    pushLine(detailLines, 'Endereço', supplier.address);
    pushLine(detailLines, 'Contato comercial', supplier.salesContact);
    pushLine(detailLines, 'Condições de pagamento', supplier.paymentTerms);
    h += detailLines.length * (SUPPLIER_LINE_SIZE + SUPPLIER_LINE_GAP);
  }
  if (meta) {
    const metaLines: string[] = [];
    if (meta.sessionTitle) metaLines.push(`Sessão: ${meta.sessionTitle}`);
    if (meta.budgetLabel) metaLines.push(`Orçamento: ${meta.budgetLabel}`);
    if (meta.exportedAt) metaLines.push(`Exportado em: ${meta.exportedAt}`);
    if (metaLines.length > 0) {
      h += (h > 0 ? SUPPLIER_LINE_GAP * 2 : 0) + metaLines.length * (META_LINE_SIZE + META_LINE_GAP);
    }
  }
  return h;
}

export function drawSupplierBlock(
  page: PDFPage,
  yTop: number,
  supplier: SupplierPdfInfo | undefined,
  meta: PdfDocumentMeta | undefined,
  font: PDFFont,
  fontBold: PDFFont
): number {
  let y = yTop;

  if (supplier?.name) {
    page.drawText(sanitizePdfText(supplier.name, fontBold), {
      x: CONTENT_LEFT,
      y: y - TITLE_SIZE,
      size: TITLE_SIZE,
      font: fontBold,
      color: COLOR_TITLE,
    });
    y -= TITLE_SIZE + SUPPLIER_LINE_GAP;

    const detailLines: string[] = [];
    pushLine(detailLines, 'CNPJ', supplier.cnpj);
    pushLine(detailLines, 'Telefone', supplier.phone);
    pushLine(detailLines, 'E-mail', supplier.email);
    pushLine(detailLines, 'Endereço', supplier.address);
    pushLine(detailLines, 'Contato comercial', supplier.salesContact);
    pushLine(detailLines, 'Condições de pagamento', supplier.paymentTerms);

    for (const line of detailLines) {
      page.drawText(sanitizePdfText(line, font), {
        x: CONTENT_LEFT,
        y: y - SUPPLIER_LINE_SIZE,
        size: SUPPLIER_LINE_SIZE,
        font,
      });
      y -= SUPPLIER_LINE_SIZE + SUPPLIER_LINE_GAP;
    }
  }

  if (meta) {
    const metaLines: string[] = [];
    if (meta.sessionTitle) metaLines.push(`Sessão: ${meta.sessionTitle}`);
    if (meta.budgetLabel) metaLines.push(`Orçamento: ${meta.budgetLabel}`);
    if (meta.exportedAt) metaLines.push(`Exportado em: ${meta.exportedAt}`);

    if (metaLines.length > 0) {
      if (supplier?.name) y -= SUPPLIER_LINE_GAP;
      for (const line of metaLines) {
        page.drawText(sanitizePdfText(line, font), {
          x: CONTENT_LEFT,
          y: y - META_LINE_SIZE,
          size: META_LINE_SIZE,
          font,
          color: COLOR_META,
        });
        y -= META_LINE_SIZE + META_LINE_GAP;
      }
    }
  }

  return y;
}
