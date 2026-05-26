import { NextResponse, type NextRequest } from 'next/server';
import { createSupabaseServerClient, requireAuthUserId } from '@/lib/supabaseServer';
import {
  buildPricingWorkbook,
  pricingWorkbookToBuffer,
  type PricingWorkbookData,
} from '@/services/pricing/buildPricingWorkbook';
import { getSavedPricingBudgetById } from '@/services/pricing/savedPricingBudgets';
import type {
  CostItem,
  PricingMaterialSnapshot,
  ServicePricingResult,
} from '@/components/precificacao/types';

export const runtime = 'nodejs';

function filenameSafe(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'precificacao';
}

function excelResponse(buffer: Buffer, budgetName: string) {
  const filename = `precificacao-${filenameSafe(budgetName)}.xlsx`;

  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function parseCurrentExportBody(value: unknown): PricingWorkbookData | null {
  if (!isObject(value) || !isObject(value.result)) {
    return null;
  }

  const budgetName = typeof value.budgetName === 'string' ? value.budgetName : '';
  const result = value.result as unknown as ServicePricingResult;

  return {
    title: 'Precificação de Serviço',
    budgetName,
    clientName: typeof value.clientName === 'string' ? value.clientName : null,
    city: typeof value.city === 'string' ? value.city : null,
    saveMode: 'current',
    exportedAt: new Date(),
    result,
    costItems: Array.isArray(value.costItems) ? value.costItems as CostItem[] : [],
    materials: Array.isArray(value.materialsSnapshot)
      ? value.materialsSnapshot as PricingMaterialSnapshot[]
      : [],
  };
}

export async function GET(request: NextRequest) {
  const savedId = request.nextUrl.searchParams.get('savedId');
  if (!savedId) {
    return NextResponse.json({ error: 'savedId é obrigatório.' }, { status: 400 });
  }

  try {
    const supabase = await createSupabaseServerClient();
    const userId = await requireAuthUserId(supabase);
    const saved = await getSavedPricingBudgetById(supabase, userId, savedId);

    if (!saved) {
      return NextResponse.json({ error: 'Precificação salva não encontrada.' }, { status: 404 });
    }

    const workbook = await buildPricingWorkbook({
      title: 'Precificação Salva',
      budgetName: saved.budgetName,
      clientName: saved.clientName,
      city: saved.city,
      saveMode: saved.saveMode,
      exportedAt: new Date(),
      result: saved.result,
      costItems: saved.costItems,
      materials: saved.materialsSnapshot,
    });
    const buffer = await pricingWorkbookToBuffer(workbook);

    return excelResponse(buffer, saved.budgetName);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro ao exportar precificação.';
    const status = message.includes('autenticado') ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const workbookData = parseCurrentExportBody(body);
    if (!workbookData || !isObject(body) || typeof body.budgetId !== 'string') {
      return NextResponse.json({ error: 'Dados de precificação inválidos.' }, { status: 400 });
    }

    const supabase = await createSupabaseServerClient();
    const userId = await requireAuthUserId(supabase);

    const { data: budget, error: budgetError } = await supabase
      .from('budgets')
      .select('project_name, client_name, city')
      .eq('id', body.budgetId)
      .eq('user_id', userId)
      .maybeSingle();

    if (budgetError) {
      return NextResponse.json({ error: budgetError.message }, { status: 500 });
    }

    if (!budget) {
      return NextResponse.json({ error: 'Orçamento não encontrado para este usuário.' }, { status: 404 });
    }

    const budgetRow = budget as {
      project_name?: string | null;
      client_name?: string | null;
      city?: string | null;
    };

    const workbook = await buildPricingWorkbook({
      ...workbookData,
      budgetName: budgetRow.project_name || workbookData.budgetName,
      clientName: budgetRow.client_name ?? workbookData.clientName,
      city: budgetRow.city ?? workbookData.city,
    });
    const buffer = await pricingWorkbookToBuffer(workbook);

    return excelResponse(buffer, budgetRow.project_name || workbookData.budgetName);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro ao exportar precificação.';
    const status = message.includes('autenticado') ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
