import 'server-only';
import { createSupabaseServerClient, requireAuthUserId } from '@/lib/supabaseServer';

export type WorkMemberRole = 'engineer' | 'manager';

export type EnsureMemberResult =
  | {
      ok: true;
      supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
      userId: string;
      role: WorkMemberRole;
    }
  | { ok: false; error: string };

/**
 * Garante que o usuário autenticado é membro da obra (engineer ou manager).
 * Retorna o cliente Supabase SSR já preparado, o id do usuário e o role
 * (canonical para o INSERT de mensagens, validado pela RLS).
 *
 * Uso típico:
 *   const gate = await ensureMember(workId);
 *   if (!gate.ok) return { success: false, error: gate.error };
 *   // gate.supabase, gate.userId, gate.role
 */
export async function ensureMember(workId: string): Promise<EnsureMemberResult> {
  if (!workId || typeof workId !== 'string') {
    return { ok: false, error: 'Obra inválida.' };
  }

  const supabase = await createSupabaseServerClient();
  let userId: string;
  try {
    userId = await requireAuthUserId(supabase);
  } catch {
    return { ok: false, error: 'Sessão expirada. Faça login novamente.' };
  }

  const { data, error } = await supabase
    .from('work_members')
    .select('role')
    .eq('work_id', workId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    return { ok: false, error: error.message };
  }
  if (!data) {
    return { ok: false, error: 'Você não é membro desta obra.' };
  }

  const role = data.role as WorkMemberRole;
  if (role !== 'engineer' && role !== 'manager') {
    return { ok: false, error: 'Papel de membro inválido.' };
  }

  return { ok: true, supabase, userId, role };
}
