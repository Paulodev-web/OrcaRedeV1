'use server';

import { ensureEngineer } from '@/lib/auth/ensureEngineer';
import { createSupabaseServiceRoleClient } from '@/lib/supabaseServer';
import type { ActionResult } from '@/types/works';

const BUCKET = 'andamento-obra';
const ORPHAN_THRESHOLD_MS = 24 * 60 * 60 * 1000;
const LIST_BATCH_SIZE = 1000;

interface CleanupResult {
  scanned: number;
  removed: number;
  errors: string[];
  dryRun: boolean;
}

/**
 * Scans the andamento-obra bucket for orphan files older than 24h
 * that have no matching record in any media table.
 *
 * Engineer-only. Uses service role for both storage listing and
 * database checks. Supports dry-run mode (default) to preview
 * before deleting.
 */
export async function cleanupOrphanStorage(
  dryRun: boolean = true,
): Promise<ActionResult<CleanupResult>> {
  const gate = await ensureEngineer();
  if (!gate.ok) return { success: false, error: gate.error };

  const serviceRole = createSupabaseServiceRoleClient();
  const result: CleanupResult = {
    scanned: 0,
    removed: 0,
    errors: [],
    dryRun,
  };

  const cutoffDate = new Date(Date.now() - ORPHAN_THRESHOLD_MS);
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    const { data: objects, error: listErr } = await serviceRole.storage
      .from(BUCKET)
      .list('', {
        limit: LIST_BATCH_SIZE,
        offset,
        sortBy: { column: 'created_at', order: 'asc' },
      });

    if (listErr) {
      result.errors.push(`Erro ao listar objetos (offset ${offset}): ${listErr.message}`);
      break;
    }

    if (!objects || objects.length === 0) {
      hasMore = false;
      break;
    }

    for (const obj of objects) {
      if (!obj.name || !obj.created_at) continue;

      const createdAt = new Date(obj.created_at);
      if (createdAt > cutoffDate) continue;

      result.scanned += 1;
      const storagePath = obj.name;

      const isOrphan = await checkIfOrphan(serviceRole, storagePath);
      if (!isOrphan) continue;

      if (dryRun) {
        result.removed += 1;
      } else {
        const { error: removeErr } = await serviceRole.storage
          .from(BUCKET)
          .remove([storagePath]);

        if (removeErr) {
          result.errors.push(`Falha ao remover ${storagePath}: ${removeErr.message}`);
        } else {
          result.removed += 1;
        }
      }
    }

    if (objects.length < LIST_BATCH_SIZE) {
      hasMore = false;
    } else {
      offset += LIST_BATCH_SIZE;
    }

    if (result.errors.length > 50) {
      result.errors.push('Muitos erros. Interrompendo.');
      break;
    }
  }

  return { success: true, data: result };
}

async function checkIfOrphan(
  supabase: ReturnType<typeof createSupabaseServiceRoleClient>,
  storagePath: string,
): Promise<boolean> {
  const tables = [
    { table: 'work_message_attachments', column: 'storage_path' },
    { table: 'work_daily_log_media', column: 'storage_path' },
    { table: 'work_milestone_event_media', column: 'storage_path' },
    { table: 'work_pole_installation_media', column: 'storage_path' },
    { table: 'work_checklist_item_media', column: 'storage_path' },
    { table: 'work_alert_media', column: 'storage_path' },
    { table: 'work_project_snapshot', column: 'pdf_storage_path' },
  ];

  for (const { table, column } of tables) {
    const { count } = await supabase
      .from(table)
      .select('id', { count: 'exact', head: true })
      .eq(column, storagePath);

    if (count && count > 0) return false;
  }

  return true;
}
