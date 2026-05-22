import JSZip from 'jszip';
import { slugifyFileName, formatDateForZip } from '@/lib/slugify';
import { buildSupplierWorkbook, workbookToBuffer } from '@/services/excel/buildSupplierWorkbook';
import { loadIdealExportContext } from '@/services/scenarios/loadIdealExportContext';

export async function buildIdealExportZip(
  sessionId: string
): Promise<{ buffer: Buffer; filename: string }> {
  const { ctx, suppliers } = await loadIdealExportContext(sessionId);

  const zip = new JSZip();
  for (const supplier of suppliers) {
    const workbook = await buildSupplierWorkbook(supplier, ctx);
    const buffer = await workbookToBuffer(workbook);
    zip.file(`${supplier.fileSlug}.xlsx`, buffer);
  }

  const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });
  const sessionSlug = slugifyFileName(ctx.sessionTitle || sessionId, 40);
  const filename = `cenario-ideal-${sessionSlug}-${formatDateForZip(ctx.exportedAt)}.zip`;

  return { buffer: zipBuffer, filename };
}
