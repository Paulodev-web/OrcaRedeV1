"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient, requireAuthUserId } from "@/lib/supabaseServer";
import { ensureOrgAdmin } from "@/lib/auth/ensureOrgAdmin";
import { ORG_ROLES, ORG_SECTORS, type OrgRole, type OrgSector } from "@/types/organization";

type ActionResult = { success: boolean; error?: string };

function revalidateOrg() {
  revalidatePath("/configuracoes/organizacao");
  revalidatePath("/configuracoes");
}

/**
 * Troca a organização ativa da sessão.
 *
 * Vive em `profiles.active_org_id` e não numa tabela de sessão porque trocar de
 * org é decisão persistente: trocar no desktop e reabrir no celular deve manter
 * a escolha (§5.2 do plano).
 *
 * Não checa a associação aqui de propósito — quem barra é
 * `trg_z_profiles_validate_active_org`, que impede apontar para uma org da qual
 * não se é membro. Duplicar a regra no app criaria duas fontes de verdade.
 */
export async function switchActiveOrgAction(orgId: string): Promise<ActionResult> {
  try {
    if (!orgId) return { success: false, error: "Organização inválida." };

    const supabase = await createSupabaseServerClient();
    const userId = await requireAuthUserId(supabase);

    const { error } = await supabase
      .from("profiles")
      .update({ active_org_id: orgId })
      .eq("id", userId);

    if (error) {
      // A trigger fala em inglês e cita nome de coluna; a tela não tem o que
      // fazer com isso.
      return {
        success: false,
        error: "Não foi possível ativar esta organização — você precisa ser membro dela.",
      };
    }

    // Toda tela do sistema passa a ler outro tenant: o cache inteiro morre.
    revalidatePath("/", "layout");
    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erro inesperado ao trocar de organização.";
    return { success: false, error: message };
  }
}

export async function setMemberSectorAction(
  memberUserId: string,
  sector: OrgSector | null,
): Promise<ActionResult> {
  try {
    if (sector !== null && !ORG_SECTORS.includes(sector)) {
      return { success: false, error: "Setor inválido." };
    }

    const gate = await ensureOrgAdmin();
    if (!gate.ok) return { success: false, error: gate.error };

    const { error } = await gate.supabase
      .from("org_members")
      .update({ sector })
      .eq("org_id", gate.orgId)
      .eq("user_id", memberUserId);

    if (error) return { success: false, error: error.message };

    revalidateOrg();
    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erro inesperado ao definir o setor.";
    return { success: false, error: message };
  }
}

/**
 * Promove ou rebaixa um membro.
 *
 * Duas proteções do banco continuam valendo e a tela precisa saber traduzir:
 * `org_members_update` exige `user_id <> auth.uid()` (ninguém edita o próprio
 * vínculo — anti-escalada de privilégio) e `trg_org_members_protect_last_owner`
 * impede deixar a organização sem dono.
 */
export async function setMemberRoleAction(
  memberUserId: string,
  role: OrgRole,
): Promise<ActionResult> {
  try {
    if (!ORG_ROLES.includes(role)) {
      return { success: false, error: "Papel inválido." };
    }

    const gate = await ensureOrgAdmin();
    if (!gate.ok) return { success: false, error: gate.error };

    if (memberUserId === gate.userId) {
      return { success: false, error: "Você não pode alterar o seu próprio papel na organização." };
    }

    const { error } = await gate.supabase
      .from("org_members")
      .update({ role })
      .eq("org_id", gate.orgId)
      .eq("user_id", memberUserId);

    if (error) {
      if (/last owner|último owner|ultimo owner/i.test(error.message)) {
        return {
          success: false,
          error: "A organização ficaria sem dono. Promova outra pessoa a dono antes.",
        };
      }
      return { success: false, error: error.message };
    }

    revalidateOrg();
    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erro inesperado ao alterar o papel.";
    return { success: false, error: message };
  }
}

/**
 * Desligamento é SOFT DELETE, sempre (§3.3 do plano).
 *
 * `DELETE FROM auth.users` deixaria órfãs as linhas de 20+ tabelas cujo
 * `user_id` não tem FK, e apagaria de verdade as de 14 que cascateiam —
 * `proposals` inclusive, o que arrancaria propostas já publicadas com link
 * ativo para o cliente.
 */
export async function setMemberActiveAction(
  memberUserId: string,
  isActive: boolean,
): Promise<ActionResult> {
  try {
    const gate = await ensureOrgAdmin();
    if (!gate.ok) return { success: false, error: gate.error };

    if (memberUserId === gate.userId) {
      return { success: false, error: "Você não pode desativar o seu próprio acesso." };
    }

    const { error } = await gate.supabase
      .from("org_members")
      .update({ is_active: isActive })
      .eq("org_id", gate.orgId)
      .eq("user_id", memberUserId);

    if (error) {
      if (/last owner|último owner|ultimo owner/i.test(error.message)) {
        return {
          success: false,
          error: "A organização ficaria sem dono. Promova outra pessoa a dono antes.",
        };
      }
      return { success: false, error: error.message };
    }

    revalidateOrg();
    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erro inesperado ao alterar o acesso.";
    return { success: false, error: message };
  }
}

/**
 * Concede ou revoga um módulo para alguém.
 *
 * `can_edit = true` exige `can_view = true` — é CHECK no banco
 * (`module_permissions_edit_requires_view`), e a normalização aqui evita que a
 * tela consiga montar o estado impossível.
 *
 * Revogar apaga a linha em vez de gravar `can_view = false`: ausência de linha é
 * o estado "sem acesso" que a tabela já usava.
 */
export async function setModulePermissionAction(
  memberUserId: string,
  moduleKey: string,
  canView: boolean,
  canEdit: boolean,
): Promise<ActionResult> {
  try {
    const key = moduleKey.trim();
    if (!key) return { success: false, error: "Módulo inválido." };

    const gate = await ensureOrgAdmin();
    if (!gate.ok) return { success: false, error: gate.error };

    const effectiveView = canEdit ? true : canView;

    if (!effectiveView) {
      const { error } = await gate.supabase
        .from("module_permissions")
        .delete()
        .eq("org_id", gate.orgId)
        .eq("user_id", memberUserId)
        .eq("module_key", key);

      if (error) return { success: false, error: error.message };
      revalidateOrg();
      return { success: true };
    }

    const { error } = await gate.supabase.from("module_permissions").upsert(
      {
        user_id: memberUserId,
        module_key: key,
        can_view: true,
        can_edit: canEdit,
        // O RLS exige `granted_by = auth.uid()` no INSERT e no UPDATE: a
        // concessão fica assinada por quem a fez.
        granted_by: gate.userId,
        org_id: gate.orgId,
      },
      { onConflict: "user_id,module_key" },
    );

    if (error) return { success: false, error: error.message };

    revalidateOrg();
    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erro inesperado ao alterar o acesso ao módulo.";
    return { success: false, error: message };
  }
}
