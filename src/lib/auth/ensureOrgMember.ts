import 'server-only';
import { createSupabaseServerClient, requireAuthUserId } from '@/lib/supabaseServer';
import type { OrgSector } from '@/types/organization';

export type EnsureOrgMemberResult =
  | {
      ok: true;
      supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
      userId: string;
      orgId: string;
      sector: OrgSector | null;
    }
  | { ok: false; error: string };

/**
 * Portão das escritas do Quadro de Trabalho: só exige vínculo ATIVO na org
 * corrente, qualquer `role`. Mover um card, mandar mensagem ou criar uma task
 * é ato de qualquer colega — não de admin — pós-flip (`org_rls_flip.sql`
 * já libera colega editar dado de colega). Mais simples que `ensureOrgAdmin`
 * de propósito: aquele é o portão de administração da org, este é o portão de
 * uso comum do dia a dia.
 *
 * O RLS de `tasks`/`task_messages`/`task_members` já barra quem não é membro
 * — isto existe para devolver mensagem em português em vez de "0 linhas
 * afetadas".
 */
export async function ensureOrgMember(): Promise<EnsureOrgMemberResult> {
  const supabase = await createSupabaseServerClient();

  let userId: string;
  try {
    userId = await requireAuthUserId(supabase);
  } catch {
    return { ok: false, error: 'Sessão expirada. Faça login novamente.' };
  }

  const { data, error } = await supabase.rpc('current_org_id');
  if (error) {
    return { ok: false, error: error.message };
  }

  const orgId = data as string | null;
  if (!orgId) {
    return { ok: false, error: 'Você ainda não pertence a nenhuma organização.' };
  }

  const { data: membership, error: membershipError } = await supabase
    .from('org_members')
    .select('sector')
    .eq('org_id', orgId)
    .eq('user_id', userId)
    .eq('is_active', true)
    .maybeSingle();

  if (membershipError) {
    return { ok: false, error: membershipError.message };
  }

  if (!membership) {
    // Cobre também o caso do admin de plataforma agindo via org eleita, sem
    // vínculo próprio (mesmo caminho aceito por ensureOrgAdmin/is_org_admin).
    const { data: isPlatformAdmin } = await supabase.rpc('is_platform_admin');
    if (isPlatformAdmin !== true) {
      return { ok: false, error: 'Você não é membro ativo desta organização.' };
    }
    return { ok: true, supabase, userId, orgId, sector: null };
  }

  return { ok: true, supabase, userId, orgId, sector: (membership.sector as OrgSector | null) };
}
