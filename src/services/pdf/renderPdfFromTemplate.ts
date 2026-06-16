import 'server-only';
import { PDFDocument, StandardFonts, type PDFPage, type PDFFont } from 'pdf-lib';
import type { GeneratePdfRequest } from '@/types/pdfExport';
import { loadTemplateBytes } from './loadTemplate';
import {
  CONTENT_BOTTOM,
  CONTENT_TOP,
  TABLE_GAP,
} from './constants';
import { drawPageNumber } from './drawPageNumber';
import {
  drawSupplierBlock,
  measureSupplierBlockHeight,
} from './drawSupplierBlock';
import {
  drawTableDataRow,
  drawTableHeader,
  drawTableTitle,
  getTableColumnWidths,
  measureTableDataRowHeight,
  measureTableTitleHeight,
  tableHeaderHeight,
  tableRowHeight,
} from './drawTable';
import {
  drawSignatureBlock,
  embedSignatureImage,
  measureSignatureBlockHeight,
} from './drawSignatureBlock';
import { loadSignatureImageBytes } from './loadSignatureImage';

type LayoutContext = {
  pdfDoc: PDFDocument;
  templateDoc: PDFDocument;
  pages: PDFPage[];
  font: PDFFont;
  fontBold: PDFFont;
  y: number;
};

async function addTemplatePage(ctx: LayoutContext): Promise<void> {
  const [copied] = await ctx.pdfDoc.copyPages(ctx.templateDoc, [0]);
  const page = ctx.pdfDoc.addPage(copied);
  ctx.pages.push(page);
  ctx.y = CONTENT_TOP;
}

function currentPage(ctx: LayoutContext): PDFPage {
  return ctx.pages[ctx.pages.length - 1]!;
}

async function ensureVerticalSpace(ctx: LayoutContext, needed: number): Promise<void> {
  if (ctx.y - needed >= CONTENT_BOTTOM) return;
  await addTemplatePage(ctx);
}

export async function renderPdfFromTemplate(
  request: GeneratePdfRequest
): Promise<Uint8Array> {
  const templateBytes = loadTemplateBytes();
  const templateDoc = await PDFDocument.load(templateBytes);
  const pdfDoc = await PDFDocument.create();

  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const signatureImage = await embedSignatureImage(
    pdfDoc,
    loadSignatureImageBytes()
  );
  const signatureHeight = measureSignatureBlockHeight(signatureImage);

  const [firstPage] = await pdfDoc.copyPages(templateDoc, [0]);
  pdfDoc.addPage(firstPage);

  const ctx: LayoutContext = {
    pdfDoc,
    templateDoc,
    pages: pdfDoc.getPages(),
    font,
    fontBold,
    y: CONTENT_TOP,
  };

  const supplierHeight = measureSupplierBlockHeight(request.supplier, request.meta);
  if (supplierHeight > 0) {
    await ensureVerticalSpace(ctx, supplierHeight);
    ctx.y = drawSupplierBlock(
      currentPage(ctx),
      ctx.y,
      request.supplier,
      request.meta,
      ctx.font,
      ctx.fontBold
    );
    ctx.y -= TABLE_GAP;
  }

  for (let t = 0; t < request.tables.length; t++) {
    const table = request.tables[t]!;
    const colWidths = getTableColumnWidths(table);
    const titleH = measureTableTitleHeight(table);
    const headerH = tableHeaderHeight();
    const minBlock = titleH + headerH + tableRowHeight();

    if (t > 0) {
      await ensureVerticalSpace(ctx, TABLE_GAP);
      ctx.y -= TABLE_GAP;
    }

    await ensureVerticalSpace(ctx, minBlock);

    if (table.title) {
      ctx.y = drawTableTitle(currentPage(ctx), ctx.y, table.title, ctx.fontBold);
    }

    let rowIndex = 0;
    let headerDrawn = false;

    const drawHeaderOnCurrentPage = () => {
      ctx.y = drawTableHeader(currentPage(ctx), ctx.y, table, colWidths, ctx.fontBold);
      headerDrawn = true;
    };

    drawHeaderOnCurrentPage();

    for (const row of table.rows) {
      const isTotalRow = row[0]?.trim().toUpperCase() === 'TOTAL GERAL';
      const rowHeight = measureTableDataRowHeight(
        row,
        colWidths,
        ctx.font,
        ctx.fontBold,
        { bold: isTotalRow }
      );

      if (ctx.y - rowHeight < CONTENT_BOTTOM) {
        await addTemplatePage(ctx);
        headerDrawn = false;
        drawHeaderOnCurrentPage();
      }

      ctx.y = drawTableDataRow(
        currentPage(ctx),
        ctx.y,
        row,
        colWidths,
        rowIndex,
        ctx.font,
        ctx.fontBold,
        { bold: isTotalRow }
      );
      rowIndex += 1;
      headerDrawn = true;
      void headerDrawn;
    }
  }

  if (signatureImage) {
    await ensureVerticalSpace(ctx, signatureHeight);
    ctx.y = drawSignatureBlock(
      currentPage(ctx),
      ctx.y,
      signatureImage,
      ctx.font,
      ctx.fontBold
    );
  }

  const totalPages = ctx.pages.length;
  for (let i = 0; i < totalPages; i++) {
    drawPageNumber(ctx.pages[i]!, i + 1, totalPages, ctx.font, ctx.fontBold);
  }

  return pdfDoc.save();
}
