/**
 * Tamanho da primeira pagina de um PDF, do lado do servidor.
 *
 * Usa `pdf-lib`, que ja e dependencia e le PDF com object stream (regex em cima
 * do MediaBox falha justamente nos arquivos modernos, que sao a maioria das
 * pranchas de projeto).
 *
 * Devolve a pagina EXIBIDA: com `/Rotate 90` ou `/Rotate 270` os lados sao
 * trocados, que e o que o `getViewport` do pdf.js faz por padrao e portanto o
 * que o portal ja usa hoje. Conferido contra o poppler em tres pranchas reais
 * (A0 com Rotate 270, A1 sem rotacao, A2 com Rotate 270).
 */
import { PDFDocument } from 'pdf-lib';

export interface PdfPageGeometry {
  /** Pagina exibida, em pontos. */
  width: number;
  height: number;
  /** 0, 90, 180 ou 270. */
  rotation: number;
  numPages: number;
}

export async function readPdfPageGeometry(
  bytes: Uint8Array,
): Promise<PdfPageGeometry | null> {
  try {
    const doc = await PDFDocument.load(bytes, {
      updateMetadata: false,
      ignoreEncryption: true,
    });
    if (doc.getPageCount() === 0) return null;

    const page = doc.getPage(0);
    const { width, height } = page.getSize();
    if (!(width > 0) || !(height > 0)) return null;

    const bruto = page.getRotation().angle ?? 0;
    const rotation = ((Math.round(bruto / 90) * 90) % 360 + 360) % 360;
    const deLado = rotation === 90 || rotation === 270;

    return {
      width: deLado ? height : width,
      height: deLado ? width : height,
      rotation,
      numPages: doc.getPageCount(),
    };
  } catch (e) {
    // Prancha ilegivel nao pode derrubar a importacao da obra: o APK cai no
    // caminho antigo, que e o comportamento de hoje.
    console.error('[readPdfPageGeometry] falhou ao ler a pagina', {
      error: e instanceof Error ? e.message : String(e),
    });
    return null;
  }
}
