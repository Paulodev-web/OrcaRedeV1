import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  calculateServicePricing,
  calcularValorServicoPorLucro,
} from '@/lib/pricingMath';
import { consolidateMaterialsFromBudgetDetails } from '@/services/budgetMaterialAggregation';
import { getBudgetForImport } from '@/services/works/getBudgetForImport';
import type {
  CostItem,
  PricingInputMode,
  PricingMaterialSnapshot,
  PricingSaveMode,
  SavedPricingBudget,
  SavePricingBudgetInput,
  ServicePricingResult,
} from '@/components/precificacao/types';

export interface SavedPricingBudgetRow {
  id: string;
  user_id: string;
  budget_id: string;
  save_mode: string;
  budget_name: string;
  client_name: string | null;
  city: string | null;
  pricing_input_mode: string;
  valor_servico_input: number | string | null;
  lucro_percent_input: number | string | null;
  imposto_percent: number | string | null;
  cost_items: unknown;
  materials_snapshot: unknown;
  result_snapshot: unknown;
  valor_materiais: number | string | null;
  valor_servico: number | string | null;
  total_custos: number | string | null;
  imposto_valor: number | string | null;
  lucro_bruto: number | string | null;
  lucro_liquido: number | string | null;
  preco_total_cliente: number | string | null;
  created_at: string;
  updated_at: string;
}

interface BudgetPricingSnapshot {
  budgetName: string;
  clientName: string | null;
  city: string | null;
  materials: PricingMaterialSnapshot[];
  valorMateriais: number;
}

function toNumber(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toPricingInputMode(value: string): PricingInputMode {
  return value === 'lucro' ? 'lucro' : 'valor';
}

function toPricingSaveMode(value: string): PricingSaveMode {
  return value === 'live' ? 'live' : 'snapshot';
}

function asObjectArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function sanitizeCostItems(value: unknown): CostItem[] {
  return asObjectArray(value).map((item, index) => {
    const row = item && typeof item === 'object' ? item as Record<string, unknown> : {};
    const id = typeof row.id === 'string' && row.id ? row.id : `cost-${index}`;
    const descricao = typeof row.descricao === 'string' ? row.descricao : '';
    const hasUnitFields = row.unidade !== undefined || row.valorUnitario !== undefined || row.valor_unitario !== undefined;
    const unidade = Math.max(toNumber(row.unidade), 0);
    const valorUnitario = Math.max(toNumber(row.valorUnitario ?? row.valor_unitario), 0);
    const valorLegado = Math.max(toNumber(row.valor), 0);

    if (hasUnitFields) {
      return {
        id,
        descricao,
        unidade,
        valorUnitario,
        valor: unidade * valorUnitario,
      };
    }

    return {
      id,
      descricao,
      unidade: valorLegado > 0 ? 1 : 0,
      valorUnitario: valorLegado,
      valor: valorLegado,
    };
  });
}

function sanitizeMaterials(value: unknown): PricingMaterialSnapshot[] {
  return asObjectArray(value).map((item) => {
    const row = item && typeof item === 'object' ? item as Record<string, unknown> : {};

    return {
      materialId: typeof row.materialId === 'string' ? row.materialId : '',
      codigo: typeof row.codigo === 'string' ? row.codigo : '',
      nome: typeof row.nome === 'string' ? row.nome : 'Material sem nome',
      unidade: typeof row.unidade === 'string' ? row.unidade : '',
      precoUnit: Math.max(toNumber(row.precoUnit), 0),
      quantidade: Math.max(toNumber(row.quantidade), 0),
      subtotal: Math.max(toNumber(row.subtotal), 0),
    };
  });
}

function resultFromRow(row: SavedPricingBudgetRow, costItems: CostItem[]): ServicePricingResult {
  const valorServico = Math.max(toNumber(row.valor_servico), 0);
  const totalCustos = Math.max(toNumber(row.total_custos), 0);
  const impostoPercent = Math.max(toNumber(row.imposto_percent), 0);
  const impostoValor = Math.max(toNumber(row.imposto_valor), 0);
  const lucroBruto = toNumber(row.lucro_bruto);
  const lucroLiquido = toNumber(row.lucro_liquido);
  const valorMateriais = Math.max(toNumber(row.valor_materiais), 0);

  return {
    valorServico,
    totalCustos,
    totalCustosPercent: valorServico > 0 ? (totalCustos / valorServico) * 100 : 0,
    custosDetalhados: costItems.map((item) => ({
      ...item,
      percentualDoVS: valorServico > 0 ? (item.valor / valorServico) * 100 : 0,
    })),
    lucroBruto,
    lucroBrutoPercent: valorServico > 0 ? (lucroBruto / valorServico) * 100 : 0,
    impostoPercent,
    impostoValor,
    lucroLiquido,
    lucroLiquidoPercent: valorServico > 0 ? (lucroLiquido / valorServico) * 100 : 0,
    valorMateriais,
    precoTotalCliente: Math.max(toNumber(row.preco_total_cliente), 0),
  };
}

function calculateLiveResult(row: SavedPricingBudgetRow, costItems: CostItem[], valorMateriais: number) {
  const inputMode = toPricingInputMode(row.pricing_input_mode);
  const totalCustos = costItems.reduce((acc, item) => acc + item.valor, 0);
  const valorServico =
    inputMode === 'valor'
      ? Math.max(toNumber(row.valor_servico_input), 0)
      : calcularValorServicoPorLucro(totalCustos, Math.max(toNumber(row.lucro_percent_input), 0)) ?? 0;

  return calculateServicePricing(valorServico, costItems, toNumber(row.imposto_percent), valorMateriais);
}

export async function getBudgetPricingSnapshot(
  supabase: SupabaseClient,
  budgetId: string,
  userId: string
): Promise<BudgetPricingSnapshot | null> {
  const budget = await getBudgetForImport(supabase, budgetId, userId);
  if (!budget) {
    return null;
  }

  const materials = consolidateMaterialsFromBudgetDetails({
    id: budget.budgetId,
    name: budget.projectName,
    company_id: budget.utilityCompanyId ?? undefined,
    client_name: budget.clientName ?? undefined,
    city: budget.city ?? undefined,
    status: budget.status === 'Finalizado' ? 'Finalizado' : 'Em Andamento',
    plan_image_url: budget.planImageUrl ?? undefined,
    posts: budget.posts,
    render_version: budget.renderVersion ?? undefined,
  });

  return {
    budgetName: budget.projectName,
    clientName: budget.clientName,
    city: budget.city,
    materials,
    valorMateriais: materials.reduce((acc, item) => acc + item.subtotal, 0),
  };
}

export function buildSavedPricingUpsertRow(input: SavePricingBudgetInput, userId: string) {
  const costItems = sanitizeCostItems(input.costItems);
  const materialsSnapshot = sanitizeMaterials(input.materialsSnapshot);

  return {
    user_id: userId,
    budget_id: input.budgetId,
    save_mode: input.saveMode,
    budget_name: input.budgetName,
    client_name: input.clientName || null,
    city: input.city || null,
    pricing_input_mode: input.pricingInputMode,
    valor_servico_input: Math.max(toNumber(input.valorServicoInput), 0),
    lucro_percent_input: Math.max(toNumber(input.lucroPercentInput), 0),
    imposto_percent: Math.max(toNumber(input.impostoPercent), 0),
    cost_items: costItems,
    materials_snapshot: materialsSnapshot,
    result_snapshot: input.result,
    valor_materiais: Math.max(toNumber(input.result.valorMateriais), 0),
    valor_servico: Math.max(toNumber(input.result.valorServico), 0),
    total_custos: Math.max(toNumber(input.result.totalCustos), 0),
    imposto_valor: Math.max(toNumber(input.result.impostoValor), 0),
    lucro_bruto: toNumber(input.result.lucroBruto),
    lucro_liquido: toNumber(input.result.lucroLiquido),
    preco_total_cliente: Math.max(toNumber(input.result.precoTotalCliente), 0),
  };
}

export async function resolveSavedPricingBudget(
  supabase: SupabaseClient,
  row: SavedPricingBudgetRow,
  userId: string
): Promise<SavedPricingBudget> {
  const costItems = sanitizeCostItems(row.cost_items);
  const saveMode = toPricingSaveMode(row.save_mode);
  const fallbackMaterials = sanitizeMaterials(row.materials_snapshot);
  const fallbackResult = resultFromRow(row, costItems);

  if (saveMode === 'live') {
    const liveSnapshot = await getBudgetPricingSnapshot(supabase, row.budget_id, userId);
    if (liveSnapshot) {
      return {
        id: row.id,
        userId: row.user_id,
        budgetId: row.budget_id,
        budgetName: liveSnapshot.budgetName,
        clientName: liveSnapshot.clientName,
        city: liveSnapshot.city,
        saveMode,
        pricingInputMode: toPricingInputMode(row.pricing_input_mode),
        valorServicoInput: toNumber(row.valor_servico_input),
        lucroPercentInput: toNumber(row.lucro_percent_input),
        impostoPercent: toNumber(row.imposto_percent),
        costItems,
        materialsSnapshot: liveSnapshot.materials,
        result: calculateLiveResult(row, costItems, liveSnapshot.valorMateriais),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
    }
  }

  return {
    id: row.id,
    userId: row.user_id,
    budgetId: row.budget_id,
    budgetName: row.budget_name,
    clientName: row.client_name,
    city: row.city,
    saveMode,
    pricingInputMode: toPricingInputMode(row.pricing_input_mode),
    valorServicoInput: toNumber(row.valor_servico_input),
    lucroPercentInput: toNumber(row.lucro_percent_input),
    impostoPercent: toNumber(row.imposto_percent),
    costItems,
    materialsSnapshot: fallbackMaterials,
    result: fallbackResult,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listSavedPricingBudgets(
  supabase: SupabaseClient,
  userId: string
): Promise<SavedPricingBudget[]> {
  const { data, error } = await supabase
    .from('saved_pricing_budgets')
    .select('*')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  const rows = (data ?? []) as unknown as SavedPricingBudgetRow[];
  return Promise.all(rows.map((row) => resolveSavedPricingBudget(supabase, row, userId)));
}

export async function getSavedPricingBudgetById(
  supabase: SupabaseClient,
  userId: string,
  savedPricingId: string
): Promise<SavedPricingBudget | null> {
  const { data, error } = await supabase
    .from('saved_pricing_budgets')
    .select('*')
    .eq('id', savedPricingId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    return null;
  }

  return resolveSavedPricingBudget(supabase, data as unknown as SavedPricingBudgetRow, userId);
}
