import type { PDFFont } from 'pdf-lib';
import { sanitizePdfText } from './sanitizePdfText';

export function truncateText(
  text: string,
  font: PDFFont,
  fontSize: number,
  maxWidth: number
): string {
  const value = sanitizePdfText(text ?? '', font);
  if (font.widthOfTextAtSize(value, fontSize) <= maxWidth) return value;

  const ellipsis = '...';
  const ellipsisWidth = font.widthOfTextAtSize(ellipsis, fontSize);
  const limit = Math.max(0, maxWidth - ellipsisWidth);
  let low = 0;
  let high = value.length;

  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    const slice = value.slice(0, mid);
    if (font.widthOfTextAtSize(slice, fontSize) <= limit) {
      low = mid;
    } else {
      high = mid - 1;
    }
  }

  return value.slice(0, low) + ellipsis;
}
