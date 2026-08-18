import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { computeDreResult } from './computeDreResult';
import { DRE_GROUPS } from './types';
import type { DreFreightGap, DreGroup, DrePlannedSnapshot, DreResult, DreRevenueSource } from './types';

export interface WorkDreRow {
  id: string;
  budgetId: string;
  status: 'aberta' | 'fechada';
  contractValue: number;
  revenueSource: DreRevenueSource;
  plannedSnapshot: DrePlannedSnapshot;
  closedAt: string | null;
}

export interface DreActualRow {
  id: string;
  grupo: DreGroup;
  descricao: string;
  valor: number;
  competencia: string;
}

export type FreightType = 'cif' | 'fob';
export type PurchaseOrderStatus = 'emitida' | 'entregue' | 'cancelada';

export interface PurchaseOrderRow {
  id: string;
  ocNumber: string;
  supplierName: string;
  itemsValue: number;
  freightValue: number | null;
  freightType: FreightType | null;
  status: PurchaseOrderStatus;
  deliveryDate: string | null;
  notes: string | null;
}

export interface DreContext {
  dre: WorkDreRow;
  result: DreResult;
  freightGap: DreFreightGap;
  actuals: DreActualRow[];
  purchaseOrders: PurchaseOrderRow[];
}

function toPlannedSnapshot(json: unknown): DrePlannedSnapshot {
  const row = json && typeof json === 'object' ? (json as Record<string, unknown>) : {};
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

  return {
    material: num(row.material),
    mao_de_obra: num(row.mao_de_obra),
    imposto: num(row.imposto),
    frete: num(row.frete),
    comissao: num(row.comissao),
    adicional: num(row.adicional),
    sourcePricingId: typeof row.sourcePricingId === 'string' ? row.sourcePricingId : null,
    frozenAt: typeof row.frozenAt === 'string' ? row.frozenAt : new Date(0).toISOString(),
  };
}

interface PurchaseOrderQueryRow {
  id: string;
  oc_number: string;
  supplier_name: string;
  items_value: number;
  freight_value: number | null;
  freight_type: string | null;
  status: string;
  delivery_date: string | null;
  notes: string | null;
}

function toPurchaseOrderRow(row: PurchaseOrderQueryRow): PurchaseOrderRow {
  return {
    id: row.id,
    ocNumber: row.oc_number,
    supplierName: row.supplier_name,
    itemsValue: row.items_value,
    freightValue: row.freight_value,
    freightType: row.freight_type === 'cif' || row.freight_type === 'fob' ? row.freight_type : null,
    status: row.status === 'entregue' || row.status === 'cancelada' ? row.status : 'emitida',
    deliveryDate: row.delivery_date,
    notes: row.notes,
  };
}

/**
 * Carrega a DRE já aberta de um orçamento, com o realizado somado das duas
 * fontes (MD/PLANO-DRE-OBRA.md §5.4/§5.5):
 *
 *   - material e frete de OC: `purchase_orders` (por `budget_id`, excluindo
 *     canceladas).
 *   - os outros 4 grupos (+ frete avulso fora de OC): `dre_actuals`, por
 *     `dre_id`.
 *
 * `freightGap` (20260818140000): uma OC só conta como lacuna quando o frete
 * está genuinamente pendente — `freight_type = 'fob'` (paga à parte) sem
 * `freight_value`, ou sem `freight_type` nenhum (não classificada). OC `cif`
 * com frete embutido no material tem `freight_value` zero/NULL por definição
 * correta — nunca é lacuna.
 *
 * Retorna `null` quando o orçamento ainda não tem DRE aberta — não é erro, é
 * o estado "ainda não abri" que a UI trata mostrando o botão de abertura.
 */
export async function loadDreContext(supabase: SupabaseClient, budgetId: string): Promise<DreContext | null> {
  const { data: dreRow, error: dreError } = await supabase
    .from('work_dre')
    .select('id, budget_id, status, contract_value, revenue_source, planned_snapshot, closed_at')
    .eq('budget_id', budgetId)
    .maybeSingle();

  if (dreError) {
    throw new Error(dreError.message);
  }

  if (!dreRow) {
    return null;
  }

  const dre: WorkDreRow = {
    id: dreRow.id,
    budgetId: dreRow.budget_id,
    status: dreRow.status === 'fechada' ? 'fechada' : 'aberta',
    contractValue: dreRow.contract_value,
    revenueSource: dreRow.revenue_source === 'proposal' ? 'proposal' : 'pricing',
    plannedSnapshot: toPlannedSnapshot(dreRow.planned_snapshot),
    closedAt: dreRow.closed_at,
  };

  const [{ data: groupStatusRows, error: groupStatusError }, { data: orders, error: ordersError }, { data: actuals, error: actualsError }] =
    await Promise.all([
      supabase.from('dre_group_status').select('grupo, fechado').eq('dre_id', dre.id),
      supabase
        .from('purchase_orders')
        .select('id, oc_number, supplier_name, items_value, freight_value, freight_type, status, delivery_date, notes')
        .eq('budget_id', budgetId)
        .order('created_at', { ascending: false }),
      supabase
        .from('dre_actuals')
        .select('id, grupo, descricao, valor, competencia')
        .eq('dre_id', dre.id)
        .order('competencia', { ascending: false }),
    ]);

  if (groupStatusError) throw new Error(groupStatusError.message);
  if (ordersError) throw new Error(ordersError.message);
  if (actualsError) throw new Error(actualsError.message);

  const fechados: Partial<Record<DreGroup, boolean>> = {};
  for (const row of (groupStatusRows ?? []) as Array<{ grupo: DreGroup; fechado: boolean }>) {
    fechados[row.grupo] = row.fechado;
  }

  const realizado: Record<DreGroup, number> = Object.fromEntries(DRE_GROUPS.map((g) => [g, 0])) as Record<
    DreGroup,
    number
  >;

  const purchaseOrders = ((orders ?? []) as PurchaseOrderQueryRow[]).map(toPurchaseOrderRow);
  const activeOrders = purchaseOrders.filter((order) => order.status !== 'cancelada');

  let ordersWithoutFreight = 0;
  for (const order of activeOrders) {
    realizado.material += order.itemsValue ?? 0;
    realizado.frete += order.freightValue ?? 0;

    const freightPending = order.freightType !== 'cif' && order.freightValue === null;
    if (freightPending) {
      ordersWithoutFreight += 1;
    }
  }

  const actualRows = (actuals ?? []) as DreActualRow[];
  for (const actual of actualRows) {
    realizado[actual.grupo] = (realizado[actual.grupo] ?? 0) + actual.valor;
  }

  const result = computeDreResult({
    contractValue: dre.contractValue,
    revenueSource: dre.revenueSource,
    planned: dre.plannedSnapshot,
    realizado,
    fechados,
  });

  return {
    dre,
    result,
    freightGap: { ordersWithoutFreight, ordersTotal: activeOrders.length },
    actuals: actualRows,
    purchaseOrders,
  };
}
