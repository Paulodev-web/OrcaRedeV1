'use server';

import { revalidatePath } from 'next/cache';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ensureEngineer } from '@/lib/auth/ensureEngineer';
import type {
  ActionResult,
  CreateWorkInput,
  UpdateWorkInput,
  WorkStatus,
} from '@/types/works';

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
