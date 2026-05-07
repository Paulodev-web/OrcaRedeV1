import 'server-only';
import { createSupabaseServerClient, requireAuthUserId } from '@/lib/supabaseServer';
import { getCurrentUserProfile } from '@/services/people/getCurrentUserProfile';

export type EnsureEngineerResult =
  | {
      ok: true;
      supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
      engineerId: string;
    }
  | { ok: false; error: string };

/**
 * Garante que o usuário autenticado tem perfil com role 'engineer'.
 * Retorna o cliente Supabase SSR já preparado e o id do engenheiro.
 */
export async function ensureEngineer(): Promise<EnsureEngineerResult> {
  const supabase = await createSupabaseServerClient();
  let engineerId: string;
  try {
    engineerId = await requireAuthUserId(supabase);
  } catch {
    return { ok: false, error: 'Sessão expirada. Faça login novamente.' };
  }
  const profile = await getCurrentUserProfile(supabase, engineerId);
  if (!profile) {
    return { ok: false, error: 'Perfil do usuário não encontrado.' };
  }
  if (profile.role !== 'engineer') {
    return { ok: false, error: 'Apenas engenheiros podem realizar esta ação.' };
  }
  return { ok: true, supabase, engineerId };
}
