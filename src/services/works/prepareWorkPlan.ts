import 'server-only';
import { PDFDocument } from 'pdf-lib';
import { buildPlanGeometry } from '@/lib/canvas/planFrame';

export async function prepareWorkPlan(file: File) {
  if (file.size === 0 || file.size > 8 * 1024 * 1024) throw new Error('A planta deve ter até 8 MB e não pode estar vazia.');
  if (!file.name.toLowerCase().endsWith('.pdf')) throw new Error('Selecione uma planta em PDF.');
  const bytes = new Uint8Array(await file.arrayBuffer());
  let pdf: PDFDocument;
  try { pdf = await PDFDocument.load(bytes, { updateMetadata: false }); }
  catch { throw new Error('PDF inválido ou protegido por senha. Envie um PDF que abra sem senha.'); }
  if (pdf.getPageCount() === 0) throw new Error('O PDF não tem páginas.');
  const page = pdf.getPage(0);
  const { width, height } = page.getSize();
  if (!(width > 0) || !(height > 0)) throw new Error('Dimensões da planta inválidas.');
  const rotation = ((page.getRotation().angle % 360) + 360) % 360;
  const landscape = rotation === 90 || rotation === 270;
  const geometry = buildPlanGeometry({
    pageWidth: landscape ? height : width, pageHeight: landscape ? width : height,
    rotation, numPages: pdf.getPageCount(), renderVersion: 2,
  });
  return { bytes, geometry, numPages: pdf.getPageCount() };
}
