import "server-only";
import { createSupabaseServerClient, requireAuthUserId } from "@/lib/supabaseServer";
import type {
  OrganizationScreenData,
  OrgMemberRow,
  OrgRole,
  OrgSector,
  OrgSummary,
} from "@/types/organization";

/**
 * Leitura da tela de Organização e equipe (§5 do MD/PLANO-ORG-MULTITENANCY.md).
 *
 * O modelo (tipos, setores, papéis) vive em `@/types/organization` porque a tela
 * é client component e este módulo é `server-only`.
 */

export async function getOrganizationScreenData(): Promise<OrganizationScreenData> {
  const supabase = await createSupabaseServerClient();
  const viewerUserId = await requireAuthUserId(supabase);

  const [{ data: activeOrgId }, { data: orgRows }] = await Promise.all([
    supabase.rpc("current_org_id"),
    // `organizations_select` devolve as orgs de que o usuário é membro ativo —
    // e todas, para admin de plataforma. É a única leitura cross-org do sistema
    // e o que impede o seletor de ficar preso na org já ativa.
    supabase
      .from("organizations")
      .select("id, name, slug, cnpj, is_active")
      .order("name", { ascending: true }),
  ]);

  const organizations: OrgSummary[] = ((orgRows ?? []) as Record<string, unknown>[]).map((row) => ({
    id: String(row.id),
    name: String(row.name),
    slug: String(row.slug),
    cnpj: (row.cnpj as string | null) ?? null,
    isActive: Boolean(row.is_active),
  }));

  const orgId = (activeOrgId as string | null) ?? null;
  if (!orgId) {
    return {
      activeOrgId: null,
      organizations,
      members: [],
      canManage: false,
      canInvite: false,
      viewerUserId,
    };
  }

  const [{ data: isOrgAdmin }, { data: isPlatformAdmin }] = await Promise.all([
    supabase.rpc("is_org_admin", { _org_id: orgId }),
    supabase.rpc("is_platform_admin"),
  ]);

  // Membros da org ativa. O RLS de `org_members` já restringe a quem é membro;
  // o filtro por org_id é o que evita trazer os vínculos do usuário em OUTRAS
  // orgs (que `auth.uid() = user_id` também autoriza a ler).
  const { data: memberRows } = await supabase
    .from("org_members")
    .select("id, user_id, role, sector, is_active")
    .eq("org_id", orgId)
    .order("role", { ascending: true })
    .order("created_at", { ascending: true });

  const members = (memberRows ?? []) as Record<string, unknown>[];
  const userIds = members.map((row) => String(row.user_id));

  // `profiles_select` ganhou `OR shares_org_with(id)` na Fase 1 — é o que
  // permite ver o e-mail do colega aqui. Sem aquilo, esta tela listaria linhas
  // sem nome nenhum.
  const [{ data: profileRows }, { data: permissionRows }] = await Promise.all([
    userIds.length > 0
      ? supabase.from("profiles").select("id, email").in("id", userIds)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    userIds.length > 0
      ? supabase
          .from("module_permissions")
          .select("user_id, module_key, can_view, can_edit")
          .eq("org_id", orgId)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
  ]);

  const emailByUser = new Map(
    ((profileRows ?? []) as Record<string, unknown>[]).map((row) => [
      String(row.id),
      (row.email as string | null) ?? null,
    ]),
  );

  const modulesByUser = new Map<string, OrgMemberRow["modules"]>();
  for (const row of (permissionRows ?? []) as Record<string, unknown>[]) {
    const key = String(row.user_id);
    const list = modulesByUser.get(key) ?? [];
    list.push({
      moduleKey: String(row.module_key),
      canView: Boolean(row.can_view),
      canEdit: Boolean(row.can_edit),
    });
    modulesByUser.set(key, list);
  }

  const viewerRole = members.find((row) => String(row.user_id) === viewerUserId)?.role;

  return {
    activeOrgId: orgId,
    organizations,
    canManage: isOrgAdmin === true,
    canInvite: viewerRole === "owner" || isPlatformAdmin === true,
    viewerUserId,
    members: members.map((row) => {
      const userId = String(row.user_id);
      return {
        id: String(row.id),
        userId,
        email: emailByUser.get(userId) ?? null,
        role: String(row.role) as OrgRole,
        sector: (row.sector as OrgSector | null) ?? null,
        isActive: Boolean(row.is_active),
        modules: modulesByUser.get(userId) ?? [],
      };
    }),
  };
}
