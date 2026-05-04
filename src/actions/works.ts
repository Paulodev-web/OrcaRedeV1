'use server';

import { revalidatePath } from 'next/cache';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ensureEngineer } from '@/lib/auth/ensureEngineer';
import { createSupabaseServiceRoleClient } from '@/lib/supabaseServer';
import {
  parseSupabaseStoragePublicUrl,
  looksLikePdf,
} from '@/lib/storage/publicUrl';
import { getImportableBudgets } from '@/services/works/getImportableBudgets';
import { getBudgetForImport } from '@/services/works/getBudgetForImport';
import type { BudgetPostDetail } from '@/types';
import type {
  ActionResult,
  CreateWorkFromBudgetInput,
  CreateWorkInput,
  ImportableBudget,
  UpdateWorkInput,
  WorkStatus,
} from '@/types/works';

const ANDAMENTO_OBRA_BUCKET = 'andamento-obra';
const POSTS_INSERT_CHUNK = 300;
const CONNECTIONS_INSERT_CHUNK = 300;

const WORKS_PATH = '/tools/andamento-obra';

const ALLOWED_TRANSITIONS: Record<WorkStatus, ReadonlyArray<WorkStatus>> = {
  planned: ['in_progress', 'cancelled'],
  in_progress: ['paused', 'completed', 'cancelled'],
  paused: ['in_progress', 'cancelled'],
  completed: [],
  cancelled: [],
};

const STATUS_LABELS: Record<WorkStatus, string> = {
  planned: 'Planejada',
  in_progress: 'Em andamento',
  paused: 'Pausada',
  completed: 'Concluída',
  cancelled: 'Cancelada',
};

function trimOrNull(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const t = value.trim();
  return t.length === 0 ? null : t;
}

function dateOrNull(value: string | null | undefined): string | null {
  if (!value) return null;
  const t = value.trim();
  return t.length === 0 ? null : t;
}

async function ensureManagerBelongsToEngineer(
  supabase: SupabaseClient,
  engineerId: string,
  managerId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, role, created_by, is_active')
    .eq('id', managerId)
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: 'Gerente inválido.' };
  if (data.role !== 'manager' || data.created_by !== engineerId) {
    return { ok: false, error: 'Gerente inválido.' };
  }
  if (data.is_active === false) {
    return { ok: false, error: 'Este gerente está inativo.' };
  }
  return { ok: true };
}

export async function createWork(
  input: CreateWorkInput,
): Promise<ActionResult<{ workId: string }>> {
  const gate = await ensureEngineer();
  if (!gate.ok) return { success: false, error: gate.error };

  const name = (input.name ?? '').trim();
  if (name.length < 3) {
    return { success: false, error: 'O nome da obra precisa ter ao menos 3 caracteres.' };
  }

  const startedAt = dateOrNull(input.startedAt);
  const expectedEndAt = dateOrNull(input.expectedEndAt);
  if (startedAt && expectedEndAt && expectedEndAt < startedAt) {
    return {
      success: false,
      error: 'A data prevista de término deve ser igual ou posterior à data de início.',
    };
  }

  const managerId = trimOrNull(input.managerId ?? null);
  if (managerId) {
    const check = await ensureManagerBelongsToEngineer(gate.supabase, gate.engineerId, managerId);
    if (!check.ok) return { success: false, error: check.error };
  }

  const { data, error } = await gate.supabase
    .from('works')
    .insert({
      engineer_id: gate.engineerId,
      manager_id: managerId,
      name,
      client_name: trimOrNull(input.clientName ?? null),
      utility_company: trimOrNull(input.utilityCompany ?? null),
      address: trimOrNull(input.address ?? null),
      started_at: startedAt,
      expected_end_at: expectedEndAt,
      notes: trimOrNull(input.notes ?? null),
    })
    .select('id')
    .maybeSingle();

  if (error || !data) {
    return { success: false, error: error?.message ?? 'Falha ao criar obra.' };
  }

  const workId = data.id as string;
  revalidatePath(WORKS_PATH);
  revalidatePath(`${WORKS_PATH}/obras/${workId}`);

  return { success: true, data: { workId } };
}

export async function updateWork(input: UpdateWorkInput): Promise<ActionResult<{ workId: string }>> {
  const gate = await ensureEngineer();
  if (!gate.ok) return { success: false, error: gate.error };

  const { data: current, error: fetchError } = await gate.supabase
    .from('works')
    .select('id, status, engineer_id, started_at, expected_end_at')
    .eq('id', input.id)
    .maybeSingle();

  if (fetchError) return { success: false, error: fetchError.message };
  if (!current) return { success: false, error: 'Obra não encontrada ou sem permissão.' };
  if (current.engineer_id !== gate.engineerId) {
    return { success: false, error: 'Sem permissão para editar esta obra.' };
  }

  const updates: Record<string, unknown> = {};

  if (input.name !== undefined) {
    const name = input.name.trim();
    if (name.length < 3) {
      return { success: false, error: 'O nome da obra precisa ter ao menos 3 caracteres.' };
    }
    updates.name = name;
  }
  if (input.clientName !== undefined) updates.client_name = trimOrNull(input.clientName);
  if (input.utilityCompany !== undefined) updates.utility_company = trimOrNull(input.utilityCompany);
  if (input.address !== undefined) updates.address = trimOrNull(input.address);
  if (input.notes !== undefined) updates.notes = trimOrNull(input.notes);

  if (input.startedAt !== undefined) updates.started_at = dateOrNull(input.startedAt);
  if (input.expectedEndAt !== undefined) updates.expected_end_at = dateOrNull(input.expectedEndAt);

  const startedAtFinal =
    'started_at' in updates ? (updates.started_at as string | null) : (current.started_at as string | null);
  const expectedEndFinal =
    'expected_end_at' in updates
      ? (updates.expected_end_at as string | null)
      : (current.expected_end_at as string | null);
  if (startedAtFinal && expectedEndFinal && expectedEndFinal < startedAtFinal) {
    return {
      success: false,
      error: 'A data prevista de término deve ser igual ou posterior à data de início.',
    };
  }

  if (input.managerId !== undefined) {
    const managerId = trimOrNull(input.managerId);
    if (managerId) {
      const check = await ensureManagerBelongsToEngineer(
        gate.supabase,
        gate.engineerId,
        managerId,
      );
      if (!check.ok) return { success: false, error: check.error };
    }
    updates.manager_id = managerId;
  }

  if (input.status !== undefined) {
    const from = current.status as WorkStatus;
    const to = input.status;
    if (from !== to) {
      const allowed = ALLOWED_TRANSITIONS[from];
      if (!allowed.includes(to)) {
        return {
          success: false,
          error: `Não é possível mudar de "${STATUS_LABELS[from]}" para "${STATUS_LABELS[to]}".`,
        };
      }
      updates.status = to;
      if (to === 'completed') {
        updates.completed_at = new Date().toISOString();
      } else if (from === 'completed') {
        updates.completed_at = null;
      }
    }
  }

  if (Object.keys(updates).length === 0) {
    return { success: true, data: { workId: input.id } };
  }

  const { error: updateError } = await gate.supabase
    .from('works')
    .update(updates)
    .eq('id', input.id)
    .eq('engineer_id', gate.engineerId);

  if (updateError) return { success: false, error: updateError.message };

  revalidatePath(WORKS_PATH);
  revalidatePath(`${WORKS_PATH}/obras/${input.id}`);

  return { success: true, data: { workId: input.id } };
}

export async function cancelWork(id: string): Promise<ActionResult<{ workId: string }>> {
  return updateWork({ id, status: 'cancelled' });
}

// =============================================================================
// Importação de orçamento -> obra (Fase 3)
// =============================================================================

export async function listImportableBudgets(): Promise<ActionResult<{ budgets: ImportableBudget[] }>> {
  const gate = await ensureEngineer();
  if (!gate.ok) return { success: false, error: gate.error };

  try {
    const budgets = await getImportableBudgets(gate.supabase, gate.engineerId);
    return { success: true, data: { budgets } };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro ao listar orçamentos.';
    return { success: false, error: message };
  }
}

interface ImportContext {
  workId: string | null;
  pdfStoragePath: string | null;
  pdfUploaded: boolean;
}

/**
 * Cria uma obra a partir de um orçamento finalizado e tira um snapshot fixo:
 *  - linha em `works` (trigger seed_work_defaults dispara)
 *  - opcional: cópia de plan_image_url para `andamento-obra/{work_id}/project/projeto.pdf`
 *  - linha em `work_project_snapshot`
 *  - posts e connections em batch
 *
 * Em qualquer falha pós-criação, faz rollback manual (Storage primeiro, depois DELETE works).
 */
export async function createWorkFromBudget(
  input: CreateWorkFromBudgetInput,
): Promise<ActionResult<{ workId: string }>> {
  const gate = await ensureEngineer();
  if (!gate.ok) return { success: false, error: gate.error };

  const budgetId = (input.budgetId ?? '').trim();
  if (!budgetId) {
    return { success: false, error: 'Selecione um orçamento para importar.' };
  }

  const startedAt = dateOrNull(input.startedAt);
  const expectedEndAt = dateOrNull(input.expectedEndAt);
  if (startedAt && expectedEndAt && expectedEndAt < startedAt) {
    return {
      success: false,
      error: 'A data prevista de término deve ser igual ou posterior à data de início.',
    };
  }

  const managerId = trimOrNull(input.managerId ?? null);
  if (managerId) {
    const check = await ensureManagerBelongsToEngineer(gate.supabase, gate.engineerId, managerId);
    if (!check.ok) return { success: false, error: check.error };
  }

  const budget = await getBudgetForImport(gate.supabase, budgetId, gate.engineerId);
  if (!budget) {
    return { success: false, error: 'Orçamento não encontrado ou sem permissão.' };
  }
  const status = (budget.status ?? '').trim();
  if (!['Finalizado', 'finalized', 'Concluído'].includes(status)) {
    return { success: false, error: 'Apenas orçamentos finalizados podem ser importados.' };
  }

  const requestedName = (input.name ?? '').trim();
  const finalName = requestedName.length >= 3 ? requestedName : budget.projectName.trim();
  if (finalName.length < 3) {
    return { success: false, error: 'O nome da obra precisa ter ao menos 3 caracteres.' };
  }

  const serviceRole = createSupabaseServiceRoleClient();
  const ctx: ImportContext = { workId: null, pdfStoragePath: null, pdfUploaded: false };

  try {
    const insertBody: Record<string, unknown> = {
      engineer_id: gate.engineerId,
      manager_id: managerId,
      budget_id: budget.budgetId,
      name: finalName,
      client_name: trimOrNull(input.clientName ?? null) ?? budget.clientName ?? null,
      utility_company:
        trimOrNull(input.utilityCompany ?? null) ?? budget.utilityCompanyName ?? null,
      address: trimOrNull(input.address ?? null) ?? null,
      started_at: startedAt,
      expected_end_at: expectedEndAt,
      notes: trimOrNull(input.notes ?? null),
    };

    const { data: workInsert, error: workError } = await serviceRole
      .from('works')
      .insert(insertBody)
      .select('id')
      .single();
    if (workError || !workInsert) {
      throw new Error(workError?.message ?? 'Falha ao criar obra.');
    }
    ctx.workId = (workInsert as { id: string }).id;

    // Cópia da planta/PDF (opcional). Falhas tratam como "sem PDF" e seguem.
    const parsed = parseSupabaseStoragePublicUrl(budget.planImageUrl);
    let pdfNumPages: number | null = null;
    if (parsed) {
      const downloadResult = await serviceRole.storage
        .from(parsed.bucket)
        .download(parsed.path);
      const blob = downloadResult.data;
      if (blob) {
        const arrayBuffer = await blob.arrayBuffer();
        const bytes = new Uint8Array(arrayBuffer);
        const isPdf = looksLikePdf({
          bytes,
          contentType: blob.type ?? null,
          fileName: parsed.path,
        });
        if (isPdf) {
          const destPath = `${ctx.workId}/project/projeto.pdf`;
          const uploadResult = await serviceRole.storage
            .from(ANDAMENTO_OBRA_BUCKET)
            .upload(destPath, bytes, {
              contentType: 'application/pdf',
              upsert: true,
            });
          if (uploadResult.error) {
            throw new Error(`Falha ao copiar PDF do projeto: ${uploadResult.error.message}`);
          }
          ctx.pdfStoragePath = destPath;
          ctx.pdfUploaded = true;
        }
      }
    }

    // Snapshot 1:1.
    const renderVersion = budget.renderVersion ?? 2;
    const { error: snapError } = await serviceRole.from('work_project_snapshot').insert({
      work_id: ctx.workId,
      source_budget_id: budget.budgetId,
      pdf_storage_path: ctx.pdfStoragePath,
      original_pdf_path: parsed ? parsed.path : null,
      render_version: renderVersion,
      pdf_num_pages: pdfNumPages,
      materials_planned: budget.materialsPlanned,
      meters_planned: budget.metersPlanned,
      imported_by: gate.engineerId,
    });
    if (snapError) throw new Error(`Falha ao criar snapshot: ${snapError.message}`);

    // Postes em batch + mapa source_post_id -> new_id.
    const sourceToNewPostId = new Map<string, string>();
    const seenSourceIds = new Set<string>();
    const postRows = budget.posts
      .filter((p) => {
        if (seenSourceIds.has(p.id)) return false;
        seenSourceIds.add(p.id);
        return true;
      })
      .map((p) => buildPostRow(ctx.workId!, p));

    for (let i = 0; i < postRows.length; i += POSTS_INSERT_CHUNK) {
      const chunk = postRows.slice(i, i + POSTS_INSERT_CHUNK);
      const { data: inserted, error: postsError } = await serviceRole
        .from('work_project_posts')
        .insert(chunk)
        .select('id, source_post_id');
      if (postsError) throw new Error(`Falha ao copiar postes: ${postsError.message}`);
      for (const row of (inserted ?? []) as Array<{ id: string; source_post_id: string | null }>) {
        if (row.source_post_id) sourceToNewPostId.set(row.source_post_id, row.id);
      }
    }

    // Conexões em batch (apenas as que conseguimos remapear).
    const connectionRows = budget.connections
      .map((c) => {
        const fromId = sourceToNewPostId.get(c.fromBudgetPostId);
        const toId = sourceToNewPostId.get(c.toBudgetPostId);
        if (!fromId || !toId) return null;
        return {
          work_id: ctx.workId,
          source_connection_id: c.sourceConnectionId,
          from_post_id: fromId,
          to_post_id: toId,
          color: c.color,
          metadata: {},
        };
      })
      .filter((row): row is NonNullable<typeof row> => row !== null);

    for (let i = 0; i < connectionRows.length; i += CONNECTIONS_INSERT_CHUNK) {
      const chunk = connectionRows.slice(i, i + CONNECTIONS_INSERT_CHUNK);
      const { error: connError } = await serviceRole.from('work_project_connections').insert(chunk);
      if (connError) throw new Error(`Falha ao copiar conexões: ${connError.message}`);
    }

    revalidatePath(WORKS_PATH);
    revalidatePath(`${WORKS_PATH}/obras/${ctx.workId}`);

    return { success: true, data: { workId: ctx.workId } };
  } catch (err) {
    await rollbackImport(serviceRole, ctx);
    const message =
      err instanceof Error ? err.message : 'Erro inesperado ao importar orçamento.';
    return { success: false, error: message };
  }
}

function buildPostRow(workId: string, post: BudgetPostDetail) {
  const numbering = normalizeNumbering(post);
  const postType = post.post_types?.name ?? null;
  const metadata: Record<string, unknown> = {
    counter: post.counter ?? null,
    custom_name: post.custom_name ?? null,
    name: post.name ?? null,
    post_type_id: post.post_types?.id ?? null,
    post_type_name: post.post_types?.name ?? null,
    post_type_code: post.post_types?.code ?? null,
    post_type_height_m: post.post_types?.height_m ?? null,
    post_type_shape: post.post_types?.shape ?? null,
  };
  return {
    work_id: workId,
    source_post_id: post.id,
    numbering,
    post_type: postType,
    x_coord: post.x_coord,
    y_coord: post.y_coord,
    metadata,
  };
}

function normalizeNumbering(post: BudgetPostDetail): string | null {
  const custom = post.custom_name?.trim();
  const counter = post.counter ?? 0;
  if (counter > 0) {
    const padded = counter.toString().padStart(2, '0');
    return custom && custom.length > 0 ? `${custom} ${padded}` : padded;
  }
  if (custom && custom.length > 0) return custom;
  const name = post.name?.trim();
  return name && name.length > 0 ? name : null;
}

async function rollbackImport(
  serviceRole: SupabaseClient,
  ctx: ImportContext,
): Promise<void> {
  if (ctx.pdfUploaded && ctx.pdfStoragePath) {
    try {
      await serviceRole.storage.from(ANDAMENTO_OBRA_BUCKET).remove([ctx.pdfStoragePath]);
    } catch {
      // ignore: best-effort cleanup; objeto pode ser limpado manualmente.
    }
  }
  if (ctx.workId) {
    try {
      await serviceRole.from('works').delete().eq('id', ctx.workId);
    } catch {
      // ignore: estado consistente é responsabilidade do operador se chegar aqui.
    }
  }
}
