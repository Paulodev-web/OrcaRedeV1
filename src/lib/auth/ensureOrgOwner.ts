import 'server-only';
import { createSupabaseServerClient, requireAuthUserId } from '@/lib/supabaseServer';

export type EnsureOrgOwnerResult =
  | {
      ok: true;
      supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
      userId: string;
      orgId: string;
    }
  | { ok: false; error: string };

/**
 * Portão de "cadastrar gente na organização" — só o `owner`, ao contrário de
 * `ensureOrgAdmin` (que aceita `admin` também). Pedido explícito: quem convida
 * gente pra dentro é uma decisão mais restrita que quem administra setor/módulo
 * do dia a dia.
 *
 * O admin de plataforma segue valendo como rede de segurança, pelo mesmo motivo
 * de `ensureOrgAdmin`: sem isso, ele não teria como popular uma organização
 * travada sem passar por service role manual.
 */
export async function ensureOrgOwner(): Promise<EnsureOrgOwnerResult> {
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
    .select('role')
    .eq('org_id', orgId)
    .eq('user_id', userId)
    .eq('is_active', true)
    .maybeSingle();

  if (membershipError) {
    return { ok: false, error: membershipError.message };
  }

  if (membership?.role === 'owner') {
    return { ok: true, supabase, userId, orgId };
  }

  const { data: isPlatformAdmin } = await supabase.rpc('is_platform_admin');
  if (isPlatformAdmin === true) {
    return { ok: true, supabase, userId, orgId };
  }

  return {
    ok: false,
    error: 'Apenas o dono da organização pode cadastrar novas pessoas.',
  };
}
