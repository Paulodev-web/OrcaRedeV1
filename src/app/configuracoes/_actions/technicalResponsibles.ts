"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient, requireAuthUserId } from "@/lib/supabaseServer";

type ActionResult = { success: boolean; error?: string };

const COMPANY_ASSETS_BUCKET = "company-assets";

export interface TechnicalResponsibleInput {
  full_name: string;
  crea: string;
}

export async function addTechnicalResponsibleAction(
  input: TechnicalResponsibleInput,
): Promise<ActionResult> {
  try {
    const supabase = await createSupabaseServerClient();
    const userId = await requireAuthUserId(supabase);

    const { data: last } = await supabase
      .from("technical_responsibles")
      .select("order_index")
      .eq("user_id", userId)
      .order("order_index", { ascending: false })
      .limit(1)
      .maybeSingle();

    const { error } = await supabase.from("technical_responsibles").insert({
      user_id: userId,
      full_name: input.full_name.trim(),
      crea: input.crea.trim(),
      order_index: (last?.order_index ?? -1) + 1,
    });

    if (error) {
      if (error.code === "23505") {
        return {
          success: false,
          error: `Já existe um responsável técnico com o CREA "${input.crea.trim()}".`,
        };
      }
      return { success: false, error: error.message };
    }

    revalidatePath("/configuracoes/responsaveis");
    return { success: true };
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Erro inesperado ao adicionar responsável técnico.";
    return { success: false, error: message };
  }
}

export async function updateTechnicalResponsibleAction(
  id: string,
  input: TechnicalResponsibleInput,
): Promise<ActionResult> {
  try {
    const supabase = await createSupabaseServerClient();
    const userId = await requireAuthUserId(supabase);

    const { error } = await supabase
      .from("technical_responsibles")
      .update({ full_name: input.full_name.trim(), crea: input.crea.trim() })
      .eq("id", id)
      .eq("user_id", userId);

    if (error) {
      if (error.code === "23505") {
        return {
          success: false,
          error: `Já existe um responsável técnico com o CREA "${input.crea.trim()}".`,
        };
      }
      return { success: false, error: error.message };
    }

    revalidatePath("/configuracoes/responsaveis");
    return { success: true };
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Erro inesperado ao atualizar responsável técnico.";
    return { success: false, error: message };
  }
}

/**
 * Soft delete via `is_active` (§6.4): o inativo some do seletor de novas
 * propostas, mas continua resolvendo o termo de aceite das propostas antigas
 * que já apontam para ele. Por isso não existe exclusão física aqui.
 */
export async function setTechnicalResponsibleActiveAction(
  id: string,
  isActive: boolean,
): Promise<ActionResult> {
  try {
    const supabase = await createSupabaseServerClient();
    const userId = await requireAuthUserId(supabase);

    const { error } = await supabase
      .from("technical_responsibles")
      .update({ is_active: isActive })
      .eq("id", id)
      .eq("user_id", userId);

    if (error) return { success: false, error: error.message };

    revalidatePath("/configuracoes/responsaveis");
    return { success: true };
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Erro inesperado ao alterar o responsável técnico.";
    return { success: false, error: message };
  }
}

/** Sobe a assinatura em `{user_id}/assinaturas/...`, como a policy de storage exige. */
export async function uploadResponsibleSignatureAction(formData: FormData): Promise<ActionResult> {
  try {
    const id = formData.get("id");
    const file = formData.get("file");

    if (typeof id !== "string" || !id) {
      return { success: false, error: "Responsável técnico não identificado." };
    }
    if (!(file instanceof File) || file.size === 0) {
      return { success: false, error: "Selecione uma imagem de assinatura." };
    }

    const supabase = await createSupabaseServerClient();
    const userId = await requireAuthUserId(supabase);

    const extension = file.name.split(".").pop()?.toLowerCase() || "png";
    const path = `${userId}/assinaturas/${id}-${Date.now()}.${extension}`;

    const { error: uploadError } = await supabase.storage
      .from(COMPANY_ASSETS_BUCKET)
      .upload(path, file, { contentType: file.type || undefined, upsert: true });

    if (uploadError) return { success: false, error: uploadError.message };

    const {
      data: { publicUrl },
    } = supabase.storage.from(COMPANY_ASSETS_BUCKET).getPublicUrl(path);

    const { data: existing } = await supabase
      .from("technical_responsibles")
      .select("signature_storage_path")
      .eq("id", id)
      .eq("user_id", userId)
      .maybeSingle();

    const { error: updateError } = await supabase
      .from("technical_responsibles")
      .update({ signature_url: publicUrl, signature_storage_path: path })
      .eq("id", id)
      .eq("user_id", userId);

    if (updateError) {
      await supabase.storage.from(COMPANY_ASSETS_BUCKET).remove([path]);
      return { success: false, error: updateError.message };
    }

    const previousPath = existing?.signature_storage_path;
    if (previousPath && previousPath !== path) {
      await supabase.storage.from(COMPANY_ASSETS_BUCKET).remove([previousPath]);
    }

    revalidatePath("/configuracoes/responsaveis");
    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erro inesperado ao enviar a assinatura.";
    return { success: false, error: message };
  }
}

export async function removeResponsibleSignatureAction(id: string): Promise<ActionResult> {
  try {
    const supabase = await createSupabaseServerClient();
    const userId = await requireAuthUserId(supabase);

    const { data: existing } = await supabase
      .from("technical_responsibles")
      .select("signature_storage_path")
      .eq("id", id)
      .eq("user_id", userId)
      .maybeSingle();

    const { error } = await supabase
      .from("technical_responsibles")
      .update({ signature_url: null, signature_storage_path: null })
      .eq("id", id)
      .eq("user_id", userId);

    if (error) return { success: false, error: error.message };

    if (existing?.signature_storage_path) {
      await supabase.storage.from(COMPANY_ASSETS_BUCKET).remove([existing.signature_storage_path]);
    }

    revalidatePath("/configuracoes/responsaveis");
    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erro inesperado ao remover a assinatura.";
    return { success: false, error: message };
  }
}
