import JSZip from 'jszip';
import {
  calculateScenariosAction,
  getIdealSelectionsAction,
} from '@/actions/supplierQuotes';
import { getQuotationSessionByIdRead } from '@/lib/quotationSessionReads';
import { createSupabaseServerClient } from '@/lib/supabaseServer';
import { slugifyFileName, formatDateForZip } from '@/lib/slugify';
import { buildSupplierWorkbook, workbookToBuffer } from '@/services/excel/buildSupplierWorkbook';
import { groupIdealExportBySupplier } from '@/services/scenarios/groupIdealExportBySupplier';
import {
  ExportIdealError,
  type IdealExportSessionContext,
} from '@/types/exportIdeal';

export async function buildIdealExportZip(
  sessionId: string
): Promise<{ buffer: Buffer; filename: string }> {
  const sessionRes = await getQuotationSessionByIdRead(sessionId);
  if (!sessionRes.success) {
    throw new ExportIdealError(sessionRes.error, 404);
  }

  const session = sessionRes.data;
  if (!session.budget_id) {
    throw new ExportIdealError('Sessão sem orçamento vinculado.', 400);
  }

  const [scenariosRes, selectionsRes] = await Promise.all([
    calculateScenariosAction(session.budget_id, sessionId),
    getIdealSelectionsAction(sessionId),
  ]);

  if (!scenariosRes.success) {
    throw new ExportIdealError(scenariosRes.error, 500);
  }
  if (!selectionsRes.success) {
    throw new ExportIdealError(selectionsRes.error, 500);
  }

  const selections = selectionsRes.data;
  if (selections.length === 0) {
    throw new ExportIdealError(
      'Selecione fornecedores no Cenário Ideal para exportar.',
      400
    );
  }

  const supabase = await createSupabaseServerClient();
  const { data: budgetRow } = await supabase
    .from('budgets')
    .select('project_name')
    .eq('id', session.budget_id)
    .single();

  const budgetLabel = budgetRow?.project_name ?? '—';
  const exportedAt = new Date();
  const ctx: IdealExportSessionContext = {
    sessionId,
    sessionTitle: session.title,
    budgetLabel,
    exportedAt,
  };

  const suppliers = groupIdealExportBySupplier(scenariosRes.data, selections);
  if (suppliers.length === 0) {
    throw new ExportIdealError(
      'Nenhum material válido encontrado para os fornecedores selecionados.',
      400
    );
  }

  const zip = new JSZip();
  for (const supplier of suppliers) {
    const workbook = await buildSupplierWorkbook(supplier, ctx);
    const buffer = await workbookToBuffer(workbook);
    zip.file(`${supplier.fileSlug}.xlsx`, buffer);
  }

  const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });
  const sessionSlug = slugifyFileName(session.title || sessionId, 40);
  const filename = `cenario-ideal-${sessionSlug}-${formatDateForZip(exportedAt)}.zip`;

  return { buffer: zipBuffer, filename };
}
