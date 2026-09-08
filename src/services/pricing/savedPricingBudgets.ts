import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  calculateServicePricing,
  calcularValorServicoPorPercentual,
} from '@/lib/pricingMath';
import { consolidateMaterialsFromBudgetDetails } from '@/services/budgetMaterialAggregation';
import { getBudgetPostsForPricing } from '@/services/works/getBudgetForImport';
import { loadFullConsolidatedBudgetMaterials } from '@/services/supplies/budgetMaterialQuantities';
import { DRE_COST_GROUPS, inferCostItemGroup, resolveCostItemValue } from '@/components/precificacao/types';
import type {
  CostItem,
  CostItemTipo,
  DreCostGroup,
  PercentualBase,
  PricingInputMode,
  PricingMaterialSnapshot,
  PricingSaveMode,
  SavedPricingBudget,
  SavePricingBudgetInput,
  ServicePricingResult,
} from '@/components/precificacao/types';

/**
 * Cenário único gravado enquanto não existe UI de múltiplos cenários (Escopo §7.4).
 * A migration 20260803130000 já admite N cenários por orçamento.
 */
export const DEFAULT_PRICING_SCENARIO = 'Principal';

/**
 * Alvo do ON CONFLICT do upsert, espelhando
 * `saved_pricing_budgets_budget_scenario_key`. Fica junto do builder da linha
 * porque as duas coisas têm de mudar juntas: já quebrou com 42P10 antes, quando
 * uma migration trocou a UNIQUE sem que este alvo acompanhasse.
 *
 * `user_id` saiu da chave em 20260811120000: a precificação é da organização, e
 * o segundo colega a salvar o mesmo cenário deve SOBRESCREVER a linha, não
 * ganhar uma cópia paralela invisível para o outro.
 */
export const SAVED_PRICING_CONFLICT_TARGET = 'budget_id,scenario_name';

export interface SavedPricingBudgetRow {
  id: string;
  user_id: string;
  budget_id: string;
  scenario_name: string;
  is_primary: boolean;
  save_mode: string;
  budget_name: string;
  client_name: string | null;
  city: string | null;
  pricing_input_mode: string;
  valor_servico_input: number | string | null;
  lucro_percent_input: number | string | null;
  percent_materiais_input: number | string | null;
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

/** Nome/cliente/cidade do orçamento, sem nenhum poste junto (ver `listSavedPricingBudgets`). */
interface LiveBudgetHeader {
  budgetName: string;
  clientName: string | null;
  city: string | null;
}

interface BudgetHeaderRow {
  id: string;
  project_name: string;
  client_name: string | null;
  city: string | null;
  user_id: string;
}

function toNumber(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

// Modo legado 'lucro' vira 'valor' (o VS já calculado fica como entrada direta).
function toPricingInputMode(value: string): PricingInputMode {
  return value === 'percentual' ? 'percentual' : 'valor';
}

function toPricingSaveMode(value: string): PricingSaveMode {
  return value === 'live' ? 'live' : 'snapshot';
}

function asObjectArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function toCostItemTipo(value: unknown): CostItemTipo {
  if (value === 'maoDeObra' || value === 'percentual') {
    return value;
  }

  return 'unitario';
}

function toPercentualBase(value: unknown): PercentualBase {
  return value === 'servico' ? 'servico' : 'total';
}

// Linha gravada antes de `grupo` existir (MD/PLANO-DRE-OBRA.md Fase 2): infere
// pela descrição/tipo em vez de largar tudo em 'adicional' sem tentar.
function toDreCostGroup(value: unknown, descricao: string, tipo: CostItemTipo): DreCostGroup {
  if (typeof value === 'string' && (DRE_COST_GROUPS as string[]).includes(value)) {
    return value as DreCostGroup;
  }

  return inferCostItemGroup(descricao, tipo);
}

function sanitizeCostItems(value: unknown): CostItem[] {
  return asObjectArray(value).map((item, index) => {
    const row = item && typeof item === 'object' ? item as Record<string, unknown> : {};
    const id = typeof row.id === 'string' && row.id ? row.id : `cost-${index}`;
    const descricao = typeof row.descricao === 'string' ? row.descricao : '';
    const hasUnitFields = row.unidade !== undefined || row.valorUnitario !== undefined || row.valor_unitario !== undefined;
    const unidade = Math.max(toNumber(row.unidade), 0);
    const valorUnitario = Math.max(toNumber(row.valorUnitario ?? row.valor_unitario), 0);
    const valorSalvo = Math.max(toNumber(row.valor), 0);
    const tipo = toCostItemTipo(row.tipo);

    // Linha legada (antes dos campos unidade/valorUnitario): só tinha `valor`.
    if (row.tipo === undefined && !hasUnitFields) {
      return {
        id,
        descricao,
        tipo: 'unitario' as const,
        grupo: toDreCostGroup(row.grupo, descricao, 'unitario'),
        unidade: valorSalvo > 0 ? 1 : 0,
        valorUnitario: valorSalvo,
        pessoas: 0,
        dias: 0,
        percentual: 0,
        percentualBase: 'total' as const,
        valor: valorSalvo,
      };
    }

    const sanitized: CostItem = {
      id,
      descricao,
      tipo,
      grupo: toDreCostGroup(row.grupo, descricao, tipo),
      unidade,
      valorUnitario,
      pessoas: Math.max(toNumber(row.pessoas), 0),
      dias: Math.max(toNumber(row.dias), 0),
      percentual: Math.max(toNumber(row.percentual), 0),
      percentualBase: toPercentualBase(row.percentualBase),
      valor: valorSalvo,
    };

    // Tipos determinísticos são recalculados; 'percentual' mantém o valor salvo
    // (snapshot) e é re-resolvido no cálculo live quando há totais atualizados.
    if (tipo !== 'percentual') {
      sanitized.valor = resolveCostItemValue(sanitized, { valorServico: 0, valorMateriais: 0 });
    }

    return sanitized;
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
      subgrupo: typeof row.subgrupo === 'string' && row.subgrupo ? row.subgrupo : 'Não classificado',
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
  const valorServico =
    inputMode === 'percentual'
      ? calcularValorServicoPorPercentual(valorMateriais, Math.max(toNumber(row.percent_materiais_input), 0))
      // Linhas legadas do modo 'lucro' têm valor_servico_input = 0; usa o VS calculado salvo.
      : Math.max(toNumber(row.valor_servico_input), 0) || Math.max(toNumber(row.valor_servico), 0);

  return calculateServicePricing(valorServico, costItems, toNumber(row.imposto_percent), valorMateriais);
}

export async function getBudgetPricingSnapshot(
  supabase: SupabaseClient,
  budgetId: string,
  userId: string
): Promise<BudgetPricingSnapshot | null> {
  const budget = await getBudgetPostsForPricing(supabase, budgetId, userId);
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
    scenario_name: DEFAULT_PRICING_SCENARIO,
    // Com um cenário só por orçamento, ele é necessariamente o principal — é o que o
    // gate de publicar proposta (§7.2) procura. Seguro perante o índice único parcial
    // `uq_saved_pricing_budgets_primary` justamente porque só 'Principal' é gravado
    // aqui; quem introduzir a UI de cenários passa a decidir este campo.
    is_primary: true,
    save_mode: input.saveMode,
    budget_name: input.budgetName,
    client_name: input.clientName || null,
    city: input.city || null,
    pricing_input_mode: input.pricingInputMode,
    valor_servico_input: Math.max(toNumber(input.valorServicoInput), 0),
    percent_materiais_input: Math.max(toNumber(input.percentMateriaisInput), 0),
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

/**
 * Linha como ela está gravada, sem ir ao orçamento.
 *
 * É o resultado final do modo `snapshot` e a base sobre a qual o modo `live`
 * sobrescreve nome, cliente, cidade e totais.
 */
function savedPricingFromRow(row: SavedPricingBudgetRow, costItems: CostItem[]): SavedPricingBudget {
  return {
    id: row.id,
    userId: row.user_id,
    budgetId: row.budget_id,
    budgetName: row.budget_name,
    clientName: row.client_name,
    city: row.city,
    saveMode: toPricingSaveMode(row.save_mode),
    pricingInputMode: toPricingInputMode(row.pricing_input_mode),
    valorServicoInput: toNumber(row.valor_servico_input) || toNumber(row.valor_servico),
    percentMateriaisInput: toNumber(row.percent_materiais_input),
    impostoPercent: toNumber(row.imposto_percent),
    costItems,
    materialsSnapshot: sanitizeMaterials(row.materials_snapshot),
    result: resultFromRow(row, costItems),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Resolução completa de uma linha: no modo `live` relê o orçamento inteiro.
 *
 * Caro de propósito, e só vale quando alguém ABRE a precificação e vai ver a
 * lista de materiais item a item. Para montar a lista de cards use
 * `listSavedPricingBudgets`, que não carrega poste nenhum.
 */
export async function resolveSavedPricingBudget(
  supabase: SupabaseClient,
  row: SavedPricingBudgetRow,
  userId: string
): Promise<SavedPricingBudget> {
  const costItems = sanitizeCostItems(row.cost_items);
  const saved = savedPricingFromRow(row, costItems);

  if (saved.saveMode !== 'live') {
    return saved;
  }

  const liveSnapshot = await getBudgetPricingSnapshot(supabase, row.budget_id, userId);
  if (!liveSnapshot) {
    return saved;
  }

  return {
    ...saved,
    budgetName: liveSnapshot.budgetName,
    clientName: liveSnapshot.clientName,
    city: liveSnapshot.city,
    materialsSnapshot: liveSnapshot.materials,
    result: calculateLiveResult(row, costItems, liveSnapshot.valorMateriais),
  };
}

/**
 * Cabeçalho dos orçamentos em modo live, tudo em uma consulta.
 *
 * A checagem de dono espelha `getBudgetPostsForPricing`: orçamento de outro
 * engenheiro devolve nada e a linha cai para o snapshot gravado, que é o que
 * acontecia antes.
 */
async function loadLiveBudgetHeaders(
  supabase: SupabaseClient,
  budgetIds: string[],
  userId: string
): Promise<Map<string, LiveBudgetHeader>> {
  const headers = new Map<string, LiveBudgetHeader>();
  if (budgetIds.length === 0) {
    return headers;
  }

  const { data, error } = await supabase
    .from('budgets')
    .select('id, project_name, client_name, city, user_id')
    .in('id', budgetIds);

  if (error) {
    return headers;
  }

  for (const row of (data ?? []) as unknown as BudgetHeaderRow[]) {
    if (row.user_id !== userId) continue;
    headers.set(row.id, {
      budgetName: row.project_name,
      clientName: row.client_name,
      city: row.city,
    });
  }

  return headers;
}

/**
 * Valor de materiais de cada orçamento, sem trazer nenhum poste.
 *
 * `budget_consolidated_materials` devolve uma linha por material (uma centena
 * no maior orçamento da base) no lugar dos ~2 MB de postes, grupos e catálogo
 * aninhados que a leitura live trazia por precificação salva.
 *
 * Falha em um orçamento não derruba a lista: aquela linha cai para o valor
 * gravado, igual ao que já acontecia quando a leitura live não vinha.
 */
async function loadLiveValorMateriais(
  supabase: SupabaseClient,
  budgetIds: string[]
): Promise<Map<string, number>> {
  const entries = await Promise.all(
    budgetIds.map(async (budgetId): Promise<[string, number] | null> => {
      try {
        const materials = await loadFullConsolidatedBudgetMaterials(supabase, budgetId);
        let total = 0;
        for (const material of materials.values()) {
          total += material.required_qty * material.unit_price;
        }
        return [budgetId, total];
      } catch (err) {
        console.error('[listSavedPricingBudgets] BOM consolidado falhou:', budgetId, err);
        return null;
      }
    })
  );

  return new Map(entries.filter((entry): entry is [string, number] => entry !== null));
}

/**
 * Lista de cards da Precificação.
 *
 * REGRA: tela de lista não carrega o detalhe completo de cada item. Esta função
 * já foi o gargalo do sistema inteiro (docs/perf-diagnostico-producao.md, P1):
 * resolvia cada linha com `resolveSavedPricingBudget` e, em modo `live`, cada
 * uma relia o orçamento completo. Com 11 precificações live isso eram 11
 * leituras de 2 MB por montagem da página, 1.348 na janela medida, com média de
 * 16 s em `budget_posts` e o banco cancelando queries por timeout.
 *
 * O card mostra nome, cliente, cidade e totais. Nada disso precisa de poste:
 * são duas consultas fixas para a lista toda (a tabela e os cabeçalhos dos
 * orçamentos) mais uma agregação por orçamento live.
 *
 * `materialsSnapshot` fica com o valor gravado de propósito: a lista não exibe
 * material, e quem abre a precificação passa por `getSavedPricingBudgetById`,
 * que resolve o live item a item.
 */
export async function listSavedPricingBudgets(
  supabase: SupabaseClient,
  userId: string
): Promise<SavedPricingBudget[]> {
  const { data, error } = await supabase
    .from('saved_pricing_budgets')
    .select('*')
    .order('updated_at', { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  const rows = (data ?? []) as unknown as SavedPricingBudgetRow[];
  const liveBudgetIds = [
    ...new Set(
      rows
        .filter((row) => toPricingSaveMode(row.save_mode) === 'live')
        .map((row) => row.budget_id)
    ),
  ];

  const headers = await loadLiveBudgetHeaders(supabase, liveBudgetIds, userId);
  const valorMateriaisPorOrcamento = await loadLiveValorMateriais(supabase, [...headers.keys()]);

  return rows.map((row) => {
    const costItems = sanitizeCostItems(row.cost_items);
    const saved = savedPricingFromRow(row, costItems);

    if (saved.saveMode !== 'live') {
      return saved;
    }

    const header = headers.get(row.budget_id);
    const valorMateriais = valorMateriaisPorOrcamento.get(row.budget_id);
    if (!header || valorMateriais === undefined) {
      return saved;
    }

    return {
      ...saved,
      budgetName: header.budgetName,
      clientName: header.clientName,
      city: header.city,
      result: calculateLiveResult(row, costItems, valorMateriais),
    };
  });
}

/**
 * Precificação de um orçamento específico, preferindo o cenário principal.
 *
 * Existe para a etapa 3 da esteira: usar `listSavedPricingBudgets` e filtrar
 * resolveria todas as linhas do usuário — e cada resolução em modo `live`
 * relê o orçamento — só para descartar quase tudo.
 */
export async function getSavedPricingBudgetForBudget(
  supabase: SupabaseClient,
  userId: string,
  budgetId: string
): Promise<SavedPricingBudget | null> {
  const { data, error } = await supabase
    .from('saved_pricing_budgets')
    .select('*')
    .eq('budget_id', budgetId)
    .order('is_primary', { ascending: false })
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    return null;
  }

  return resolveSavedPricingBudget(supabase, data as unknown as SavedPricingBudgetRow, userId);
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
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    return null;
  }

  return resolveSavedPricingBudget(supabase, data as unknown as SavedPricingBudgetRow, userId);
}
