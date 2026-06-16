import 'server-only';
import { createSupabaseServerClient, requireAuthUserId } from '@/lib/supabaseServer';
import { formatDateForZip } from '@/lib/slugify';
import { renderPdfFromTemplate } from '@/services/pdf/renderPdfFromTemplate';
import { loadIdealExportContext } from '@/services/scenarios/loadIdealExportContext';
import { mapSupplierExportToPdfRequest } from '@/services/scenarios/mapSupplierExportToPdfRequest';
import { resolveSupplierMasterForExport } from '@/services/scenarios/resolveSupplierMaster';
import {
  ExportIdealError,
  type IdealExportSupplierOption,
} from '@/types/exportIdeal';

export async function listIdealExportSuppliers(
  sessionId: string
): Promise<IdealExportSupplierOption[]> {
  const { suppliers } = await loadIdealExportContext(sessionId, {
    skipPendingCheck: true,
  });
  return suppliers.map((s) => ({
    supplierName: s.supplierName,
    fileSlug: s.fileSlug,
  }));
}

export async function buildIdealExportPdf(
  sessionId: string,
  supplierSlug: string
): Promise<{ buffer: Buffer; filename: string }> {
  const { ctx, suppliers } = await loadIdealExportContext(sessionId, {
    skipPendingCheck: true,
  });
  const supplier = suppliers.find((s) => s.fileSlug === supplierSlug);
  if (!supplier) {
    throw new ExportIdealError('Fornecedor não encontrado para esta exportação.', 404);
  }

  const supabase = await createSupabaseServerClient();
  const userId = await requireAuthUserId(supabase);
  const master = await resolveSupplierMasterForExport(supabase, userId, supplier);
  const pdfRequest = mapSupplierExportToPdfRequest(supplier, ctx, master);
  const pdfBytes = await renderPdfFromTemplate(pdfRequest);

  const filename = `pedido-${supplier.fileSlug}-${formatDateForZip(ctx.exportedAt)}.pdf`;
  return { buffer: Buffer.from(pdfBytes), filename };
}
