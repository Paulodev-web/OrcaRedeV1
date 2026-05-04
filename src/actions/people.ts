'use server';

import { revalidatePath } from 'next/cache';
import { ensureEngineer } from '@/lib/auth/ensureEngineer';
import { getSupabaseAdmin } from '@/services/people/supabaseAdmin';
import { getManagers } from '@/services/people/getManagers';
import { getCrewMembers } from '@/services/people/getCrewMembers';
import type {
  ActionResult,
  CreateCrewInput,
  CreateManagerInput,
  CreateManagerResultData,
  CrewMemberRow,
  ManagerRow,
  UpdateCrewInput,
  UpdateManagerInput,
} from '@/types/people';

const PEOPLE_PATH = '/tools/andamento-obra/pessoas';
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;

function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

function nullIfBlank(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

// =============================================================================
// Gerentes de Obra
// =============================================================================

export async function listManagers(): Promise<ActionResult<ManagerRow[]>> {
  const gate = await ensureEngineer();
  if (!gate.ok) return { success: false, error: gate.error };
  try {
    const data = await getManagers(gate.supabase, gate.engineerId);
    return { success: true, data };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro ao carregar gerentes.';
    return { success: false, error: message };
  }
}

export async function createManager(
  input: CreateManagerInput,
): Promise<ActionResult<CreateManagerResultData>> {
  const gate = await ensureEngineer();
  if (!gate.ok) return { success: false, error: gate.error };

  const fullName = input.fullName?.trim() ?? '';
  const email = normalizeEmail(input.email ?? '');
  const phone = nullIfBlank(input.phone ?? null);
  const temporaryPassword = input.temporaryPassword ?? '';

  if (fullName.length === 0) {
    return { success: false, error: 'Informe o nome completo.' };
  }
  if (!EMAIL_REGEX.test(email)) {
    return { success: false, error: 'E-mail em formato inválido.' };
  }
  if (temporaryPassword.length < MIN_PASSWORD_LENGTH) {
    return {
      success: false,
      error: `A senha temporária precisa ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres.`,
    };
  }

  const admin = getSupabaseAdmin();

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password: temporaryPassword,
    email_confirm: true,
    user_metadata: {
      role: 'manager',
      created_by: gate.engineerId,
      full_name: fullName,
      phone: phone ?? '',
    },
  });

  if (createError || !created?.user) {
    const raw = createError?.message ?? '';
    let friendly = 'Não foi possível criar a conta do gerente.';
    if (/already|registered|exists/i.test(raw)) {
      friendly = 'Já existe um usuário cadastrado com este e-mail.';
    } else if (raw) {
      friendly = raw;
    }
    return { success: false, error: friendly };
  }

  const newUserId = created.user.id;

  const { data: updated, error: updateError } = await admin
    .from('profiles')
    .update({
      full_name: fullName,
      phone,
      email,
      role: 'manager',
      created_by: gate.engineerId,
      is_active: true,
    })
    .eq('id', newUserId)
    .select('id, full_name, email, phone, is_active, created_at')
    .maybeSingle();

  if (updateError || !updated) {
    await admin.auth.admin.deleteUser(newUserId).catch(() => undefined);
    return {
      success: false,
      error:
        updateError?.message ??
        'Falha ao registrar perfil do gerente. A conta foi revertida; tente novamente.',
    };
  }

  revalidatePath(PEOPLE_PATH);

  const manager: ManagerRow = {
    id: updated.id as string,
    fullName: (updated.full_name as string) ?? fullName,
    email: (updated.email as string | null) ?? email,
    phone: (updated.phone as string | null) ?? phone,
    isActive: Boolean(updated.is_active),
    createdAt: updated.created_at as string,
  };

  return {
    success: true,
    data: { manager, temporaryPassword },
  };
}

export async function updateManager(
  input: UpdateManagerInput,
): Promise<ActionResult<ManagerRow>> {
  const gate = await ensureEngineer();
  if (!gate.ok) return { success: false, error: gate.error };

  const fullName = input.fullName?.trim() ?? '';
  if (fullName.length === 0) {
    return { success: false, error: 'Informe o nome completo.' };
  }
  const phone = nullIfBlank(input.phone ?? null);

  const { data, error } = await gate.supabase
    .from('profiles')
    .update({
      full_name: fullName,
      phone,
      is_active: input.isActive,
    })
    .eq('id', input.id)
    .eq('role', 'manager')
    .eq('created_by', gate.engineerId)
    .select('id, full_name, email, phone, is_active, created_at')
    .maybeSingle();

  if (error) {
    return { success: false, error: error.message };
  }
  if (!data) {
    return { success: false, error: 'Gerente não encontrado ou sem permissão.' };
  }

  revalidatePath(PEOPLE_PATH);

  return {
    success: true,
    data: {
      id: data.id as string,
      fullName: (data.full_name as string) ?? fullName,
      email: (data.email as string | null) ?? null,
      phone: (data.phone as string | null) ?? null,
      isActive: Boolean(data.is_active),
      createdAt: data.created_at as string,
    },
  };
}

export async function setManagerActive(
  id: string,
  isActive: boolean,
): Promise<ActionResult> {
  const gate = await ensureEngineer();
  if (!gate.ok) return { success: false, error: gate.error };

  const { data, error } = await gate.supabase
    .from('profiles')
    .update({ is_active: isActive })
    .eq('id', id)
    .eq('role', 'manager')
    .eq('created_by', gate.engineerId)
    .select('id')
    .maybeSingle();

  if (error) return { success: false, error: error.message };
  if (!data) return { success: false, error: 'Gerente não encontrado ou sem permissão.' };

  revalidatePath(PEOPLE_PATH);
  return { success: true };
}

export async function deactivateManager(id: string): Promise<ActionResult> {
  return setManagerActive(id, false);
}

export async function reactivateManager(id: string): Promise<ActionResult> {
  return setManagerActive(id, true);
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
