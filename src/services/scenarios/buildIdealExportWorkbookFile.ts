import { slugifyFileName, formatDateForZip } from '@/lib/slugify';
import {
  buildIdealExportWorkbook,
  workbookToBuffer,
} from '@/services/excel/buildIdealExportWorkbook';
import { loadIdealExportContext } from '@/services/scenarios/loadIdealExportContext';

export async function buildIdealExportWorkbookFile(
  sessionId: string
): Promise<{ buffer: Buffer; filename: string }> {
  const { ctx, suppliers } = await loadIdealExportContext(sessionId);

  const workbook = await buildIdealExportWorkbook(suppliers, ctx);
  const buffer = await workbookToBuffer(workbook);
  const sessionSlug = slugifyFileName(ctx.sessionTitle || sessionId, 40);
  const filename = `cenario-ideal-${sessionSlug}-${formatDateForZip(ctx.exportedAt)}.xlsx`;

  return { buffer, filename };
}
