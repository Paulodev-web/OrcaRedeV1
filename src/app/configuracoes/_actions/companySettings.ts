"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient, requireAuthUserId } from "@/lib/supabaseServer";

type ActionResult = { success: boolean; error?: string };

const COMPANY_ASSETS_BUCKET = "company-assets";

export interface CompanySettingsInput {
  legal_name: string;
  trade_name: string | null;
  cnpj: string | null;
  address: string | null;
  phone_primary: string | null;
  phone_secondary: string | null;
  email: string | null;
  website: string | null;
  instagram: string | null;
  whatsapp_number: string | null;
}

/** Campo vazio vira `null` — evita distinguir '' de NULL na leitura. */
function nullify(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Um registro por usuário: a escrita natural é o upsert em `user_id`, que a
 * constraint `company_settings_user_key` garante.
 */
export async function saveCompanySettingsAction(
  input: CompanySettingsInput,
): Promise<ActionResult> {
  try {
    const supabase = await createSupabaseServerClient();
    const userId = await requireAuthUserId(supabase);

    const { error } = await supabase.from("company_settings").upsert(
      {
        user_id: userId,
        legal_name: input.legal_name.trim(),
        trade_name: nullify(input.trade_name),
        cnpj: nullify(input.cnpj),
        address: nullify(input.address),
        phone_primary: nullify(input.phone_primary),
        phone_secondary: nullify(input.phone_secondary),
        email: nullify(input.email),
        website: nullify(input.website),
        instagram: nullify(input.instagram),
        whatsapp_number: nullify(input.whatsapp_number),
      },
      { onConflict: "user_id" },
    );

    if (error) return { success: false, error: error.message };

    revalidatePath("/configuracoes/empresa");
    return { success: true };
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Erro inesperado ao salvar os dados da empresa.";
    return { success: false, error: message };
  }
}

/**
 * Sobe o logo em `{user_id}/logo/...` — o prefixo é o que a policy de storage
 * exige — e guarda URL pública e caminho. O caminho é o que permite apagar o
 * arquivo anterior em vez de acumular lixo no bucket.
 */
export async function uploadCompanyLogoAction(formData: FormData): Promise<ActionResult> {
  try {
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) {
      return { success: false, error: "Selecione um arquivo de imagem." };
    }

    const supabase = await createSupabaseServerClient();
    const userId = await requireAuthUserId(supabase);

    const extension = file.name.split(".").pop()?.toLowerCase() || "png";
    // O nome inclui o timestamp para furar o cache do CDN do bucket público.
    const path = `${userId}/logo/logo-${Date.now()}.${extension}`;

    const { error: uploadError } = await supabase.storage
      .from(COMPANY_ASSETS_BUCKET)
      .upload(path, file, { contentType: file.type || undefined, upsert: true });

    if (uploadError) return { success: false, error: uploadError.message };

    const {
      data: { publicUrl },
    } = supabase.storage.from(COMPANY_ASSETS_BUCKET).getPublicUrl(path);

    const { data: existing } = await supabase
      .from("company_settings")
      .select("logo_storage_path")
      .eq("user_id", userId)
      .maybeSingle();

    const { error: updateError } = await supabase.from("company_settings").upsert(
      { user_id: userId, logo_url: publicUrl, logo_storage_path: path },
      { onConflict: "user_id" },
    );

    if (updateError) {
      // A linha é a fonte de verdade: se ela não aponta para o arquivo novo,
      // o arquivo não deve ficar no bucket.
      await supabase.storage.from(COMPANY_ASSETS_BUCKET).remove([path]);
      return { success: false, error: updateError.message };
    }

    const previousPath = existing?.logo_storage_path;
    if (previousPath && previousPath !== path) {
      await supabase.storage.from(COMPANY_ASSETS_BUCKET).remove([previousPath]);
    }

    revalidatePath("/configuracoes/empresa");
    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erro inesperado ao enviar o logo.";
    return { success: false, error: message };
  }
}

export async function removeCompanyLogoAction(): Promise<ActionResult> {
  try {
    const supabase = await createSupabaseServerClient();
    const userId = await requireAuthUserId(supabase);

    const { data: existing } = await supabase
      .from("company_settings")
      .select("logo_storage_path")
      .eq("user_id", userId)
      .maybeSingle();

    const { error } = await supabase
      .from("company_settings")
      .update({ logo_url: null, logo_storage_path: null })
      .eq("user_id", userId);

    if (error) return { success: false, error: error.message };

    if (existing?.logo_storage_path) {
      await supabase.storage.from(COMPANY_ASSETS_BUCKET).remove([existing.logo_storage_path]);
    }

    revalidatePath("/configuracoes/empresa");
    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erro inesperado ao remover o logo.";
    return { success: false, error: message };
  }
}
