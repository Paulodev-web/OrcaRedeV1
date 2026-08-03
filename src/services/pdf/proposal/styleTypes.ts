import type { Style } from '@react-pdf/types';

/**
 * Alias do tipo de estilo do react-pdf.
 *
 * Centralizado aqui para que os componentes não precisem importar
 * `@react-pdf/types` um a um — e para que uma eventual troca de major do
 * renderer se resolva em um arquivo só.
 */
export type PdfStyle = Style;

/** Estilo único ou lista, como o próprio react-pdf aceita na prop `style`. */
export type PdfStyleProp = PdfStyle | PdfStyle[];
