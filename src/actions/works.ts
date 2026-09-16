'use server';

import { revalidatePath } from 'next/cache';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ensureEngineer } from '@/lib/auth/ensureEngineer';
import { createSupabaseServiceRoleClient } from '@/lib/supabaseServer';
import {
  parseSupabaseStoragePublicUrl,
  looksLikePdf,
  looksLikeRasterImage,
  inferImageContentType,
  inferImageExtension,
  getImageNaturalDimensions,
} from '@/lib/storage/publicUrl';
import {
  calculateRasterImageDimensions,
  computeRasterCoordTransform,
} from '@/lib/canvas/rasterPlanGeometry';
import { buildPlanGeometry, buildRasterPlanGeometry, type PlanGeometry } from '@/lib/canvas/planFrame';
import { readPdfPageGeometry } from '@/lib/canvas/pdfPageGeometry';
import { isBudgetFinalizedForImport } from '@/lib/budgetStatus';
import { getImportableBudgets } from '@/services/works/getImportableBudgets';
import { getBudgetForImport } from '@/services/works/getBudgetForImport';
import type {
  ActionResult,
  CreateWorkFromBudgetInput,
  CreateWorkInput,
  ImportableBudget,
  UpdateWorkInput,
  WorkStatus,
} from '@/types/works';

const ANDAMENTO_OBRA_BUCKET = 'andamento-obra';
const CONNECTIONS_INSERT_CHUNK = 300;

/** Hosts Supabase cujo Storage público pode ser buscado via HTTP em createWorkFromBudget (fallback). */
const ALLOWED_PDF_HOSTS = [
  'qnmydwumaqoanorgspop.supabase.co',
  'ubqyjbtjkzxlexbuxoum.supabase.co',
];

function isAllowedPdfHost(url: string): boolean {
  try {
    const parsed = new URL(url);
    return ALLOWED_PDF_HOSTS.includes(parsed.hostname);
  } catch {
    return false;
  }
}

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

/**
 * Apaga a obra e tudo que pende dela (marcos, alertas, checklists, mensagens,
 * postes, equipe...) via ON DELETE CASCADE do banco. Não limpa arquivos do
 * Storage (PDF do projeto, fotos) — ficam órfãos. Aceitável como primeira
 * versão; se virar problema, replicar o rollback de Storage que
 * `createWorkFromBudget` já faz.
 */
export async function deleteWork(id: string): Promise<ActionResult> {
  const gate = await ensureEngineer();
  if (!gate.ok) return { success: false, error: gate.error };

  const { error } = await gate.supabase
    .from('works')
    .delete()
    .eq('id', id)
    .eq('engineer_id', gate.engineerId);

  if (error) return { success: false, error: error.message };

  revalidatePath(WORKS_PATH);

  return { success: true };
}

// =============================================================================
// Importação de orçamento -> obra (Fase 3)
// =============================================================================

export async function listImportableBudgets(): Promise<ActionResult<{ budgets: ImportableBudget[] }>> {
  try {
    const gate = await ensureEngineer();
    if (!gate.ok) return { success: false, error: gate.error };

    const budgets = await getImportableBudgets(gate.supabase, gate.engineerId);
    return { success: true, data: { budgets } };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro ao listar orçamentos.';
    return { success: false, error: message };
  }
}

interface ImportContext {
  workId: string | null;
  planStoragePath: string | null;
  planUploaded: boolean;
}

interface CoordTransform {
  scale: number;
  offsetX: number;
  offsetY: number;
}

/**
 * Cria uma obra a partir de um orçamento finalizado e tira um snapshot fixo:
 *  - linha em `works` (trigger seed_work_defaults dispara)
 *  - opcional: cópia de plan_image_url para `andamento-obra/{work_id}/project/projeto.pdf`
 *  - linha em `work_project_snapshot`
 *  - posts e connections em batch
 *
 * Em qualquer falha pós-criação, faz rollback manual (Storage primeiro, depois DELETE works).
 *
 * Se uma obra existente ficou sem PDF no snapshot (pdf_storage_path NULL) por importação
 * anterior, ver [DEBT-014] em docs/_arquivo/known-debt.md — SQL opcional para apagar a obra e reimportar.
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
  if (!isBudgetFinalizedForImport(budget.status)) {
    return { success: false, error: 'Apenas orçamentos finalizados podem ser importados.' };
  }

  const requestedName = (input.name ?? '').trim();
  const finalName = requestedName.length >= 3 ? requestedName : budget.projectName.trim();
  if (finalName.length < 3) {
    return { success: false, error: 'O nome da obra precisa ter ao menos 3 caracteres.' };
  }

  const { data: orgId, error: orgIdError } = await gate.supabase.rpc('current_org_id');
  if (orgIdError || !orgId) {
    return { success: false, error: 'Não foi possível identificar a organização ativa.' };
  }

  const serviceRole = createSupabaseServiceRoleClient();
  const ctx: ImportContext = { workId: null, planStoragePath: null, planUploaded: false };

  try {
    const insertBody: Record<string, unknown> = {
      org_id: orgId,
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

    // Cópia da planta (PDF ou imagem raster). Falhas tratam como "sem planta" e seguem.
    const parsed = parseSupabaseStoragePublicUrl(budget.planImageUrl);
    let pdfNumPages: number | null = null;
    let planGeometry: PlanGeometry | null = null;
    let coordTransform: CoordTransform | undefined;

    if (parsed) {
      let blob: Blob | null = null;

      const downloadResult = await serviceRole.storage
        .from(parsed.bucket)
        .download(parsed.path);
      if (downloadResult.data) {
        blob = downloadResult.data;
      } else {
        console.warn('[createWorkFromBudget] Storage download failed, trying HTTP fallback', {
          budgetId: budget.budgetId,
          bucket: parsed.bucket,
          path: parsed.path,
          error: downloadResult.error?.message,
        });

        const planUrl = budget.planImageUrl;
        if (planUrl && isAllowedPdfHost(planUrl)) {
          try {
            const response = await fetch(planUrl);
            if (response.ok) {
              blob = await response.blob();
              console.log('[createWorkFromBudget] HTTP fallback succeeded', {
                budgetId: budget.budgetId,
                host: new URL(planUrl).hostname,
                sizeBytes: blob.size,
              });
            } else {
              console.error('[createWorkFromBudget] HTTP fallback failed', {
                budgetId: budget.budgetId,
                status: response.status,
              });
            }
          } catch (e) {
            console.error('[createWorkFromBudget] HTTP fallback exception', {
              budgetId: budget.budgetId,
              error: e instanceof Error ? e.message : String(e),
            });
          }
        } else if (planUrl) {
          console.error('[createWorkFromBudget] PDF URL host not in whitelist', {
            budgetId: budget.budgetId,
            url: planUrl,
          });
        }
      }

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
          ctx.planStoragePath = destPath;
          ctx.planUploaded = true;

          // A geometria da prancha e resolvida AQUI, uma vez, e gravada no
          // snapshot. O APK nao consegue descobri-la sozinho: o Android reporta
          // o tamanho da view em pixels, nao o da pagina em pontos, e o quadro
          // logico do aparelho diverge do quadro do portal. Ver `planFrame.ts`.
          const pageGeometry = await readPdfPageGeometry(bytes);
          if (pageGeometry) {
            pdfNumPages = pageGeometry.numPages;
            planGeometry = buildPlanGeometry({
              pageWidth: pageGeometry.width,
              pageHeight: pageGeometry.height,
              rotation: pageGeometry.rotation,
              renderVersion: budget.renderVersion ?? 2,
              numPages: pageGeometry.numPages,
            });
          }
        } else if (
          looksLikeRasterImage({
            contentType: blob.type ?? null,
            fileName: parsed.path,
          })
        ) {
          const ext = inferImageExtension(blob.type ?? null, parsed.path);
          const ct = inferImageContentType(parsed.path);
          const destPath = `${ctx.workId}/project/planta.${ext}`;
          const uploadResult = await serviceRole.storage
            .from(ANDAMENTO_OBRA_BUCKET)
            .upload(destPath, bytes, {
              contentType: ct,
              upsert: true,
            });
          if (uploadResult.error) {
            throw new Error(`Falha ao copiar imagem do projeto: ${uploadResult.error.message}`);
          }
          ctx.planStoragePath = destPath;
          ctx.planUploaded = true;

          // Normalizar coordenadas: no CanvasVisual, postes de imagem raster
          // vivem no espaço do display (max 1200x800). No WorkCanvas, tudo
          // vive no quadro 6000x6000. Aplicar transformação uniforme.
          const naturalDims = getImageNaturalDimensions(bytes);
          if (naturalDims) {
            coordTransform = computeRasterCoordTransform(
              naturalDims.width,
              naturalDims.height,
            );
            // Gravada porque a sincronia do orçamento roda no banco e precisa
            // reaplicar exatamente esta transformada nos postes que chegarem
            // depois da importação.
            const display = calculateRasterImageDimensions(
              naturalDims.width,
              naturalDims.height,
            );
            planGeometry = buildRasterPlanGeometry({
              naturalWidth: naturalDims.width,
              naturalHeight: naturalDims.height,
              displayWidth: display.width,
              displayHeight: display.height,
              transform: coordTransform,
              renderVersion: budget.renderVersion ?? 2,
            });
          }
        }
      }
    }

    // Snapshot 1:1.
    const renderVersion = budget.renderVersion ?? 2;
    const { error: snapError } = await serviceRole.from('work_project_snapshot').insert({
      work_id: ctx.workId,
      source_budget_id: budget.budgetId,
      pdf_storage_path: ctx.planStoragePath,
      original_pdf_path: parsed ? parsed.path : null,
      render_version: renderVersion,
      pdf_num_pages: pdfNumPages,
      plan_geometry: planGeometry,
      materials_planned: budget.materialsPlanned,
      meters_planned: budget.metersPlanned,
      imported_by: gate.engineerId,
    });
    if (snapError) throw new Error(`Falha ao criar snapshot: ${snapError.message}`);

    // Os postes descem pela MESMA função que a sincronia usa.
    //
    // Antes isto era um `buildPostRow` em TypeScript, e a sincronia do orçamento
    // precisaria repetir a conversão em SQL. Duas implementações da mesma regra
    // divergem com o tempo, e a divergência aqui move poste de lugar. Então a
    // função do banco é a única, e a importação é só o primeiro `sync` da obra.
    const { error: syncError } = await serviceRole.rpc('sync_work_project_from_budget', {
      p_work_id: ctx.workId,
    });
    if (syncError) throw new Error(`Falha ao copiar postes: ${syncError.message}`);

    // O mapa source_post_id -> id novo, para remapear as conexões.
    const sourceToNewPostId = new Map<string, string>();
    {
      const { data: criados, error: readError } = await serviceRole
        .from('work_project_posts')
        .select('id, source_post_id')
        .eq('work_id', ctx.workId);
      if (readError) throw new Error(`Falha ao ler postes copiados: ${readError.message}`);
      for (const row of (criados ?? []) as Array<{ id: string; source_post_id: string | null }>) {
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



async function rollbackImport(
  serviceRole: SupabaseClient,
  ctx: ImportContext,
): Promise<void> {
  if (ctx.planUploaded && ctx.planStoragePath) {
    try {
      await serviceRole.storage.from(ANDAMENTO_OBRA_BUCKET).remove([ctx.planStoragePath]);
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
