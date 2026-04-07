import PDFParser from 'pdf2json';
import type { Output } from 'pdf2json';

export async function extractTextFromPdfBuffer(
  buffer: Buffer
): Promise<{ text: string; numpages: number }> {
  return new Promise((resolve, reject) => {
    const pdfParser = new PDFParser(null, true);

    pdfParser.on('pdfParser_dataError', (errData) => {
      if (errData && typeof errData === 'object' && 'parserError' in errData && errData.parserError) {
        reject(errData.parserError);
        return;
      }
      reject(errData instanceof Error ? errData : new Error(String(errData)));
    });

    pdfParser.on('pdfParser_dataReady', (pdfData: Output) => {
      try {
        const rawText = pdfParser.getRawTextContent();
        const numpages = Array.isArray(pdfData.Pages) ? pdfData.Pages.length : 0;
        resolve({ text: rawText, numpages });
      } catch (e) {
        reject(e instanceof Error ? e : new Error(String(e)));
      }
    });

    pdfParser.parseBuffer(buffer);
  });
}
