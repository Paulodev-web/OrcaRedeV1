import type { PDFPage, PDFFont, RGB } from 'pdf-lib';
import type { TableData } from '@/types/pdfExport';
import { computeColumnWidths } from './columnWidths';
import {
  BODY_SIZE,
  BORDER_WIDTH,
  COLOR_BORDER,
  COLOR_HEADER_BG,
  COLOR_HEADER_TEXT,
  COLOR_ROW_ALT,
  COLOR_ROW_WHITE,
  COLOR_TITLE,
  CONTENT_LEFT,
  CONTENT_WIDTH,
  HEADER_SIZE,
  PADDING_H,
  PADDING_V,
  ROW_HEIGHT,
  TITLE_GAP,
  TITLE_SIZE,
} from './constants';
import { sanitizePdfText } from './sanitizePdfText';

const BODY_LINE_HEIGHT = BODY_SIZE + 2;

function splitLongWord(word: string, font: PDFFont, fontSize: number, maxWidth: number): string[] {
  const parts: string[] = [];
  let current = '';

  for (const char of word) {
    const next = current + char;
    if (current && font.widthOfTextAtSize(next, fontSize) > maxWidth) {
      parts.push(current);
      current = char;
    } else {
      current = next;
    }
  }

  if (current) parts.push(current);
  return parts;
}

function wrapText(
  text: string,
  font: PDFFont,
  fontSize: number,
  maxWidth: number
): string[] {
  const safe = sanitizePdfText(text, font);
  if (!safe) return [''];

  const lines: string[] = [];
  let current = '';

  for (const word of safe.split(' ')) {
    if (font.widthOfTextAtSize(word, fontSize) > maxWidth) {
      if (current) {
        lines.push(current);
        current = '';
      }
      lines.push(...splitLongWord(word, font, fontSize, maxWidth));
      continue;
    }

    const next = current ? `${current} ${word}` : word;
    if (current && font.widthOfTextAtSize(next, fontSize) > maxWidth) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }

  if (current) lines.push(current);
  return lines.length > 0 ? lines : [''];
}

function drawRowBackground(page: PDFPage, yBottom: number, height: number, fill: RGB): void {
  page.drawRectangle({
    x: CONTENT_LEFT,
    y: yBottom,
    width: CONTENT_WIDTH,
    height,
    color: fill,
    borderWidth: 0,
  });
}

function drawRowBorders(
  page: PDFPage,
  yBottom: number,
  height: number,
  colWidths: number[]
): void {
  let x = CONTENT_LEFT;
  for (let i = 0; i < colWidths.length; i++) {
    page.drawRectangle({
      x,
      y: yBottom,
      width: colWidths[i],
      height,
      borderColor: COLOR_BORDER,
      borderWidth: BORDER_WIDTH,
    });
    x += colWidths[i];
  }
}

function drawHeaderRow(
  page: PDFPage,
  yBottom: number,
  table: TableData,
  colWidths: number[],
  fontBold: PDFFont
): void {
  drawRowBackground(page, yBottom, ROW_HEIGHT, COLOR_HEADER_BG);
  let x = CONTENT_LEFT;
  for (let i = 0; i < table.columns.length; i++) {
    const cellW = colWidths[i];
    const text = sanitizePdfText(table.columns[i].header, fontBold);
    page.drawText(text, {
      x: x + PADDING_H,
      y: yBottom + PADDING_H + 2,
      size: HEADER_SIZE,
      font: fontBold,
      color: COLOR_HEADER_TEXT,
    });
    page.drawRectangle({
      x,
      y: yBottom,
      width: cellW,
      height: ROW_HEIGHT,
      borderColor: COLOR_BORDER,
      borderWidth: BORDER_WIDTH,
    });
    x += cellW;
  }
}

function drawDataRow(
  page: PDFPage,
  yBottom: number,
  cells: string[],
  colWidths: number[],
  rowIndex: number,
  rowHeight: number,
  font: PDFFont,
  fontBold: PDFFont,
  boldCells?: boolean
): void {
  const fill = rowIndex % 2 === 0 ? COLOR_ROW_ALT : COLOR_ROW_WHITE;
  drawRowBackground(page, yBottom, rowHeight, fill);
  let x = CONTENT_LEFT;
  for (let i = 0; i < colWidths.length; i++) {
    const cellW = colWidths[i];
    const raw = cells[i] ?? '';
    const useBold = boldCells === true;
    const cellFont = useBold ? fontBold : font;
    const lines = wrapText(raw, cellFont, BODY_SIZE, cellW - PADDING_H * 2);
    const firstLineY = yBottom + rowHeight - PADDING_V - BODY_SIZE;
    lines.forEach((line, lineIndex) => {
      page.drawText(line, {
        x: x + PADDING_H,
        y: firstLineY - lineIndex * BODY_LINE_HEIGHT,
        size: BODY_SIZE,
        font: cellFont,
      });
    });
    x += cellW;
  }
  drawRowBorders(page, yBottom, rowHeight, colWidths);
}

export function measureTableTitleHeight(table: TableData): number {
  return table.title ? TITLE_SIZE + TITLE_GAP : 0;
}

export function drawTableTitle(
  page: PDFPage,
  yTop: number,
  title: string,
  fontBold: PDFFont
): number {
  page.drawText(sanitizePdfText(title, fontBold), {
    x: CONTENT_LEFT,
    y: yTop - TITLE_SIZE,
    size: TITLE_SIZE,
    font: fontBold,
    color: COLOR_TITLE,
  });
  return yTop - TITLE_SIZE - TITLE_GAP;
}

export function drawTableHeader(
  page: PDFPage,
  yTop: number,
  table: TableData,
  colWidths: number[],
  fontBold: PDFFont
): number {
  const yBottom = yTop - ROW_HEIGHT;
  drawHeaderRow(page, yBottom, table, colWidths, fontBold);
  return yBottom;
}

export function drawTableDataRow(
  page: PDFPage,
  yTop: number,
  cells: string[],
  colWidths: number[],
  rowIndex: number,
  font: PDFFont,
  fontBold: PDFFont,
  options?: { bold?: boolean }
): number {
  const rowHeight = measureTableDataRowHeight(cells, colWidths, font, fontBold, options);
  const yBottom = yTop - rowHeight;
  drawDataRow(
    page,
    yBottom,
    cells,
    colWidths,
    rowIndex,
    rowHeight,
    font,
    fontBold,
    options?.bold
  );
  return yBottom;
}

export function measureTableDataRowHeight(
  cells: string[],
  colWidths: number[],
  font: PDFFont,
  fontBold: PDFFont,
  options?: { bold?: boolean }
): number {
  const useBold = options?.bold === true;
  const cellFont = useBold ? fontBold : font;
  const maxLines = colWidths.reduce((count, width, index) => {
    const lines = wrapText(cells[index] ?? '', cellFont, BODY_SIZE, width - PADDING_H * 2);
    return Math.max(count, lines.length);
  }, 1);

  return Math.max(ROW_HEIGHT, maxLines * BODY_LINE_HEIGHT + PADDING_V * 2);
}

export function getTableColumnWidths(table: TableData): number[] {
  return computeColumnWidths(table.columns);
}

export function tableHeaderHeight(): number {
  return ROW_HEIGHT;
}

export function tableRowHeight(): number {
  return ROW_HEIGHT;
}
