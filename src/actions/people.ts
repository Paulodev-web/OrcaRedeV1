'use server';

import { revalidatePath } from 'next/cache';
import { ensureEngineer } from '@/lib/auth/ensureEngineer';
import { getCrewMembers } from '@/services/people/getCrewMembers';
import type {
  ActionResult,
  CreateCrewInput,
  CrewMemberRow,
  UpdateCrewInput,
} from '@/types/people';

const PEOPLE_PATH = '/tools/andamento-obra/pessoas';

function nullIfBlank(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

// =============================================================================
// Membros de Equipe (Crew)
// =============================================================================

export async function listCrew(): Promise<ActionResult<CrewMemberRow[]>> {
  const gate = await ensureEngineer();
  if (!gate.ok) return { success: false, error: gate.error };
  try {
    const data = await getCrewMembers(gate.supabase, gate.engineerId);
    return { success: true, data };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro ao carregar equipe.';
    return { success: false, error: message };
  }
}

export async function createCrew(
  input: CreateCrewInput,
): Promise<ActionResult<CrewMemberRow>> {
  const gate = await ensureEngineer();
  if (!gate.ok) return { success: false, error: gate.error };

  const fullName = input.fullName?.trim() ?? '';
  if (fullName.length === 0) {
    return { success: false, error: 'Informe o nome completo.' };
  }

  const { data, error } = await gate.supabase
    .from('crew_members')
    .insert({
      owner_id: gate.engineerId,
      full_name: fullName,
      role: nullIfBlank(input.role ?? null),
      phone: nullIfBlank(input.phone ?? null),
      document_id: nullIfBlank(input.documentId ?? null),
      notes: nullIfBlank(input.notes ?? null),
    })
    .select('id, full_name, role, phone, document_id, notes, is_active, created_at')
    .maybeSingle();

  if (error || !data) {
    return { success: false, error: error?.message ?? 'Falha ao cadastrar membro de equipe.' };
  }

  revalidatePath(PEOPLE_PATH);

  return {
    success: true,
    data: {
      id: data.id as string,
      fullName: (data.full_name as string) ?? fullName,
      role: (data.role as string | null) ?? null,
      phone: (data.phone as string | null) ?? null,
      documentId: (data.document_id as string | null) ?? null,
      notes: (data.notes as string | null) ?? null,
      isActive: Boolean(data.is_active),
      createdAt: data.created_at as string,
    },
  };
}

export async function updateCrew(
  input: UpdateCrewInput,
): Promise<ActionResult<CrewMemberRow>> {
  const gate = await ensureEngineer();
  if (!gate.ok) return { success: false, error: gate.error };

  const fullName = input.fullName?.trim() ?? '';
  if (fullName.length === 0) {
    return { success: false, error: 'Informe o nome completo.' };
  }

  const { data, error } = await gate.supabase
    .from('crew_members')
    .update({
      full_name: fullName,
      role: nullIfBlank(input.role ?? null),
      phone: nullIfBlank(input.phone ?? null),
      document_id: nullIfBlank(input.documentId ?? null),
      notes: nullIfBlank(input.notes ?? null),
      is_active: input.isActive,
    })
    .eq('id', input.id)
    .eq('owner_id', gate.engineerId)
    .select('id, full_name, role, phone, document_id, notes, is_active, created_at')
    .maybeSingle();

  if (error) return { success: false, error: error.message };
  if (!data) return { success: false, error: 'Membro de equipe não encontrado ou sem permissão.' };

  revalidatePath(PEOPLE_PATH);

  return {
    success: true,
    data: {
      id: data.id as string,
      fullName: (data.full_name as string) ?? fullName,
      role: (data.role as string | null) ?? null,
      phone: (data.phone as string | null) ?? null,
      documentId: (data.document_id as string | null) ?? null,
      notes: (data.notes as string | null) ?? null,
      isActive: Boolean(data.is_active),
      createdAt: data.created_at as string,
    },
  };
}

export async function setCrewActive(
  id: string,
  isActive: boolean,
): Promise<ActionResult> {
  const gate = await ensureEngineer();
  if (!gate.ok) return { success: false, error: gate.error };

  const { data, error } = await gate.supabase
    .from('crew_members')
    .update({ is_active: isActive })
    .eq('id', id)
    .eq('owner_id', gate.engineerId)
    .select('id')
    .maybeSingle();

  if (error) return { success: false, error: error.message };
  if (!data) return { success: false, error: 'Membro de equipe não encontrado ou sem permissão.' };

  revalidatePath(PEOPLE_PATH);
  return { success: true };
}

export async function deactivateCrew(id: string): Promise<ActionResult> {
  return setCrewActive(id, false);
}

export async function reactivateCrew(id: string): Promise<ActionResult> {
  return setCrewActive(id, true);
}
