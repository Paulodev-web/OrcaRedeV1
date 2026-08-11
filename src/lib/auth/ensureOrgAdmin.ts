import 'server-only';
import { createSupabaseServerClient, requireAuthUserId } from '@/lib/supabaseServer';

export type OrgRole = 'owner' | 'admin' | 'member';

export type EnsureOrgAdminResult =
  | {
      ok: true;
      supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
      userId: string;
      orgId: string;
      role: OrgRole;
    }
  | { ok: false; error: string };

/**
 * Portão das escritas da tela de organização: garante que o usuário é
 * `owner`/`admin` da org ATIVA, e devolve o cliente já preparado.
 *
 * O RLS de `org_members` e `module_permissions` já barra quem não é admin — isto
 * aqui existe para devolver uma mensagem em português em vez de "0 linhas
 * afetadas", que a tela não teria como explicar.
 *
 * Segue o formato de `ensureMember`/`ensureEngineer`: união discriminada, um
 * `select` extra e nada de exceção para fluxo esperado.
 *
 * ⚠ Admin de plataforma entra por aqui também, porque `is_org_admin()` inclui
 * `is_platform_admin() AND _org_id = current_org_id()`. É deliberado: é a rede
 * de segurança para destravar uma org que ficou sem admin (§7.2 do plano), e
 * continua valendo "uma org por vez" — só alcança a org eleita como ativa.
 */
export async function ensureOrgAdmin(): Promise<EnsureOrgAdminResult> {
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

  // A própria linha de vínculo diz o papel. Um `member` enxerga a tela (a
  // listagem é leitura de membro), mas não passa daqui para escrever.
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

  const role = (membership?.role ?? null) as OrgRole | null;

  if (role !== 'owner' && role !== 'admin') {
    // Sem vínculo de admin: só resta o caminho de plataforma, que o banco
    // confirma. Perguntar ao banco evita duplicar aqui a regra de is_org_admin.
    const { data: isPlatformAdmin } = await supabase.rpc('is_platform_admin');
    if (isPlatformAdmin !== true) {
      return {
        ok: false,
        error: 'Apenas o administrador da organização pode alterar acessos da equipe.',
      };
    }
    return { ok: true, supabase, userId, orgId, role: 'admin' };
  }

  return { ok: true, supabase, userId, orgId, role };
}
