import type { PDFPage, PDFFont } from 'pdf-lib';
import { PAGE_NUM_RIGHT, PAGE_NUM_SIZE, PAGE_NUM_Y } from './constants';

export function drawPageNumber(
  page: PDFPage,
  pageIndex: number,
  totalPages: number,
  font: PDFFont,
  fontBold: PDFFont
): void {
  const prefix = 'Página ';
  const middle = ' de ';
  const pageStr = String(pageIndex);
  const totalStr = String(totalPages);

  const wPrefix = font.widthOfTextAtSize(prefix, PAGE_NUM_SIZE);
  const wPage = fontBold.widthOfTextAtSize(pageStr, PAGE_NUM_SIZE);
  const wMiddle = font.widthOfTextAtSize(middle, PAGE_NUM_SIZE);
  const wTotal = fontBold.widthOfTextAtSize(totalStr, PAGE_NUM_SIZE);
  const totalWidth = wPrefix + wPage + wMiddle + wTotal;

  let x = PAGE_NUM_RIGHT - totalWidth;

  page.drawText(prefix, {
    x,
    y: PAGE_NUM_Y,
    size: PAGE_NUM_SIZE,
    font,
  });
  x += wPrefix;

  page.drawText(pageStr, {
    x,
    y: PAGE_NUM_Y,
    size: PAGE_NUM_SIZE,
    font: fontBold,
  });
  x += wPage;

  page.drawText(middle, {
    x,
    y: PAGE_NUM_Y,
    size: PAGE_NUM_SIZE,
    font,
  });
  x += wMiddle;

  page.drawText(totalStr, {
    x,
    y: PAGE_NUM_Y,
    size: PAGE_NUM_SIZE,
    font: fontBold,
  });
}
