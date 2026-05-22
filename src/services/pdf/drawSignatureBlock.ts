import type { PDFDocument, PDFImage, PDFPage, PDFFont } from 'pdf-lib';
import {
  CONTENT_LEFT,
  CONTENT_WIDTH,
  COLOR_TITLE,
} from './constants';
import { sanitizePdfText } from './sanitizePdfText';

export const SIGNATURE_GAP_AFTER_TABLE = 28;
const SIGNATURE_IMAGE_MAX_WIDTH = 130;
const SIGNATURE_IMAGE_MAX_HEIGHT = 48;
const SIGNATURE_IMAGE_GAP = 3;
const SIGNATURE_LINE_SIZE = 9;
const SIGNATURE_NAME_SIZE = 10;
const SIGNATURE_TEXT_GAP = 5;

const UNDERLINE =
  '__________________________________';
const LINES = [
  'Eng. Luan Stefanello Pianesso',
  'CPF: 017.392.480-82',
  'CREA RS: 278122',
] as const;

function scaledImageSize(
  imgWidth: number,
  imgHeight: number
): { width: number; height: number } {
  const ratio = imgWidth / imgHeight;
  let width = SIGNATURE_IMAGE_MAX_WIDTH;
  let height = width / ratio;
  if (height > SIGNATURE_IMAGE_MAX_HEIGHT) {
    height = SIGNATURE_IMAGE_MAX_HEIGHT;
    width = height * ratio;
  }
  return { width, height };
}

export function measureSignatureBlockHeight(
  signatureImage: PDFImage | null
): number {
  let h = SIGNATURE_GAP_AFTER_TABLE;
  if (signatureImage) {
    const { width, height } = scaledImageSize(
      signatureImage.width,
      signatureImage.height
    );
    void width;
    h += height + SIGNATURE_IMAGE_GAP;
  }
  h += SIGNATURE_LINE_SIZE + SIGNATURE_TEXT_GAP;
  h += SIGNATURE_NAME_SIZE + SIGNATURE_TEXT_GAP;
  h += (LINES.length - 1) * (SIGNATURE_LINE_SIZE + SIGNATURE_TEXT_GAP);
  h += SIGNATURE_LINE_SIZE;
  return h;
}

function drawCenteredText(
  page: PDFPage,
  yBaseline: number,
  text: string,
  size: number,
  font: PDFFont
): void {
  const safe = sanitizePdfText(text, font);
  const textWidth = font.widthOfTextAtSize(safe, size);
  const x = CONTENT_LEFT + (CONTENT_WIDTH - textWidth) / 2;
  page.drawText(safe, {
    x,
    y: yBaseline,
    size,
    font,
    color: COLOR_TITLE,
  });
}

export function drawSignatureBlock(
  page: PDFPage,
  yTop: number,
  signatureImage: PDFImage | null,
  font: PDFFont,
  fontBold: PDFFont
): number {
  let y = yTop - SIGNATURE_GAP_AFTER_TABLE;

  if (signatureImage) {
    const { width, height } = scaledImageSize(
      signatureImage.width,
      signatureImage.height
    );
    const x = CONTENT_LEFT + (CONTENT_WIDTH - width) / 2;
    page.drawImage(signatureImage, {
      x,
      y: y - height,
      width,
      height,
    });
    y -= height + SIGNATURE_IMAGE_GAP;
  }

  drawCenteredText(page, y - SIGNATURE_LINE_SIZE, UNDERLINE, SIGNATURE_LINE_SIZE, font);
  y -= SIGNATURE_LINE_SIZE + SIGNATURE_TEXT_GAP;

  drawCenteredText(
    page,
    y - SIGNATURE_NAME_SIZE,
    LINES[0],
    SIGNATURE_NAME_SIZE,
    fontBold
  );
  y -= SIGNATURE_NAME_SIZE + SIGNATURE_TEXT_GAP;

  for (let i = 1; i < LINES.length; i++) {
    drawCenteredText(
      page,
      y - SIGNATURE_LINE_SIZE,
      LINES[i]!,
      SIGNATURE_LINE_SIZE,
      font
    );
    y -= SIGNATURE_LINE_SIZE + SIGNATURE_TEXT_GAP;
  }

  return y;
}

export async function embedSignatureImage(
  pdfDoc: PDFDocument,
  pngBytes: Buffer | null
): Promise<PDFImage | null> {
  if (!pngBytes) return null;
  try {
    return await pdfDoc.embedPng(pngBytes);
  } catch {
    return null;
  }
}
