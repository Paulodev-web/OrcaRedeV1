'use server';

import { revalidatePath } from 'next/cache';
import { ensureMember } from '@/lib/auth/ensureMember';
import { createSupabaseServerClient, requireAuthUserId } from '@/lib/supabaseServer';
import type { ActionResult } from '@/types/works';

const WORKS_PATH = '/tools/andamento-obra';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function allocateCrewToWork(input: {
  workId: string;
  crewMemberId: string;
  roleInWork?: string | null;
}): Promise<ActionResult> {
  if (!input.workId || !UUID_RE.test(input.workId)) {
    return { success: false, error: 'ID de obra invalido.' };
  }
  if (!input.crewMemberId || !UUID_RE.test(input.crewMemberId)) {
    return { success: false, error: 'ID de membro invalido.' };
  }

  const gate = await ensureMember(input.workId);
  if (!gate.ok) return { success: false, error: gate.error };
  if (gate.role !== 'engineer') {
    return { success: false, error: 'Apenas o engenheiro pode alocar equipe.' };
  }

  const { data: crew } = await gate.supabase
    .from('crew_members')
    .select('id, owner_id, is_active')
    .eq('id', input.crewMemberId)
    .maybeSingle();

  if (!crew) return { success: false, error: 'Membro de equipe nao encontrado.' };
  if (crew.owner_id !== gate.userId) {
    return { success: false, error: 'Membro nao pertence ao engenheiro.' };
  }

  const { error } = await gate.supabase
    .from('work_team')
    .upsert(
      {
        work_id: input.workId,
        crew_member_id: input.crewMemberId,
        role_in_work: input.roleInWork?.trim() || null,
        allocated_at: new Date().toISOString(),
        deallocated_at: null,
      },
      { onConflict: 'work_id,crew_member_id' },
    );

  if (error) return { success: false, error: error.message };

  revalidatePath(`${WORKS_PATH}/obras/${input.workId}/equipe`);
  return { success: true };
}

export async function deallocateCrewFromWork(input: {
  workId: string;
  crewMemberId: string;
}): Promise<ActionResult> {
  if (!input.workId || !UUID_RE.test(input.workId)) {
    return { success: false, error: 'ID de obra invalido.' };
  }
  if (!input.crewMemberId || !UUID_RE.test(input.crewMemberId)) {
    return { success: false, error: 'ID de membro invalido.' };
  }

  const gate = await ensureMember(input.workId);
  if (!gate.ok) return { success: false, error: gate.error };
  if (gate.role !== 'engineer') {
    return { success: false, error: 'Apenas o engenheiro pode remover equipe.' };
  }

  const { error } = await gate.supabase
    .from('work_team')
    .update({ deallocated_at: new Date().toISOString() })
    .eq('work_id', input.workId)
    .eq('crew_member_id', input.crewMemberId);

  if (error) return { success: false, error: error.message };

  revalidatePath(`${WORKS_PATH}/obras/${input.workId}/equipe`);
  return { success: true };
}

export async function updateCrewRoleInWork(input: {
  workId: string;
  crewMemberId: string;
  roleInWork: string;
}): Promise<ActionResult> {
  if (!input.workId || !UUID_RE.test(input.workId)) {
    return { success: false, error: 'ID de obra invalido.' };
  }
  if (!input.crewMemberId || !UUID_RE.test(input.crewMemberId)) {
    return { success: false, error: 'ID de membro invalido.' };
  }

  const gate = await ensureMember(input.workId);
  if (!gate.ok) return { success: false, error: gate.error };
  if (gate.role !== 'engineer') {
    return { success: false, error: 'Apenas o engenheiro pode editar funcao.' };
  }

  const { error } = await gate.supabase
    .from('work_team')
    .update({ role_in_work: input.roleInWork.trim() || null })
    .eq('work_id', input.workId)
    .eq('crew_member_id', input.crewMemberId)
    .is('deallocated_at', null);

  if (error) return { success: false, error: error.message };

  revalidatePath(`${WORKS_PATH}/obras/${input.workId}/equipe`);
  return { success: true };
}
