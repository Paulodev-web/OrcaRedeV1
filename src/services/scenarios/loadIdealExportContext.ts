import {
  calculateScenariosAction,
  getIdealSelectionsAction,
} from '@/actions/supplierQuotes';
import { getQuotationSessionByIdRead } from '@/lib/quotationSessionReads';
import { createSupabaseServerClient } from '@/lib/supabaseServer';
import {
  buildSelectionMap,
  countPendingMaterials,
  groupIdealExportBySupplier,
} from '@/services/scenarios/groupIdealExportBySupplier';
import {
  ExportIdealError,
  type IdealExportSessionContext,
  type SupplierExportData,
} from '@/types/exportIdeal';

export interface IdealExportLoaded {
  ctx: IdealExportSessionContext;
  suppliers: SupplierExportData[];
}

export async function loadIdealExportContext(
  sessionId: string,
  options?: { skipPendingCheck?: boolean }
): Promise<IdealExportLoaded> {
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
  const items = scenariosRes.data.scenarioB.items;
  const hasPurchaseDemand = items.some((i) => i.net_qty > 0);
  if (!hasPurchaseDemand) {
    throw new ExportIdealError(
      'Nenhum material com necessidade de compra para exportar.',
      400
    );
  }

  const validatedMap = buildSelectionMap(selections);
  if (!options?.skipPendingCheck) {
    const pending = countPendingMaterials(items, validatedMap);
    if (pending > 0) {
      throw new ExportIdealError(
        `${pending} material(is) sem cotação disponível para exportação.`,
        400
      );
    }
  }

  const supabase = await createSupabaseServerClient();
  const { data: budgetRow } = await supabase
    .from('budgets')
    .select('project_name')
    .eq('id', session.budget_id)
    .single();

  const exportedAt = new Date();
  const ctx: IdealExportSessionContext = {
    sessionId,
    sessionTitle: session.title,
    budgetLabel: budgetRow?.project_name ?? '—',
    exportedAt,
  };

  const suppliers = groupIdealExportBySupplier(scenariosRes.data, selections);
  if (suppliers.length === 0) {
    throw new ExportIdealError(
      'Nenhum material válido encontrado para os fornecedores selecionados.',
      400
    );
  }

  return { ctx, suppliers };
}
