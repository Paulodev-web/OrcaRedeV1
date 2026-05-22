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
  ROW_HEIGHT,
  TITLE_GAP,
  TITLE_SIZE,
} from './constants';
import { sanitizePdfText } from './sanitizePdfText';
import { truncateText } from './truncateText';

function drawRowBackground(page: PDFPage, yBottom: number, fill: RGB): void {
  page.drawRectangle({
    x: CONTENT_LEFT,
    y: yBottom,
    width: CONTENT_WIDTH,
    height: ROW_HEIGHT,
    color: fill,
    borderWidth: 0,
  });
}

function drawRowBorders(page: PDFPage, yBottom: number, colWidths: number[]): void {
  let x = CONTENT_LEFT;
  for (let i = 0; i < colWidths.length; i++) {
    page.drawRectangle({
      x,
      y: yBottom,
      width: colWidths[i],
      height: ROW_HEIGHT,
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
  drawRowBackground(page, yBottom, COLOR_HEADER_BG);
  let x = CONTENT_LEFT;
  for (let i = 0; i < table.columns.length; i++) {
    const cellW = colWidths[i];
    const text = truncateText(
      table.columns[i].header,
      fontBold,
      HEADER_SIZE,
      cellW - PADDING_H * 2
    );
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
  font: PDFFont,
  fontBold: PDFFont,
  boldCells?: boolean
): void {
  const fill = rowIndex % 2 === 0 ? COLOR_ROW_ALT : COLOR_ROW_WHITE;
  drawRowBackground(page, yBottom, fill);
  let x = CONTENT_LEFT;
  for (let i = 0; i < colWidths.length; i++) {
    const cellW = colWidths[i];
    const raw = cells[i] ?? '';
    const useBold = boldCells === true;
    const cellFont = useBold ? fontBold : font;
    const text = truncateText(raw, cellFont, BODY_SIZE, cellW - PADDING_H * 2);
    page.drawText(text, {
      x: x + PADDING_H,
      y: yBottom + PADDING_H + 2,
      size: BODY_SIZE,
      font: cellFont,
    });
    x += cellW;
  }
  drawRowBorders(page, yBottom, colWidths);
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
  const yBottom = yTop - ROW_HEIGHT;
  drawDataRow(page, yBottom, cells, colWidths, rowIndex, font, fontBold, options?.bold);
  return yBottom;
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
