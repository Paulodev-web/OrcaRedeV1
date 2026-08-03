"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient, requireAuthUserId } from "@/lib/supabaseServer";

type ActionResult<T = undefined> = { success: boolean; error?: string; data?: T };

const MEDIA_BUCKET = "proposal-media";
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const ACCEPTED_PREFIX = "image/";

function nullify(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Sobe uma imagem para a biblioteca.
 *
 * O prefixo `{user_id}/` não é organização: é o que a policy de storage exige
 * para autorizar a escrita. O bucket é de leitura pública porque o PDF e a
 * página da proposta baixam a imagem sem sessão — a listagem do bucket, essa
 * sim, continua fechada.
 */
export async function uploadMediaAction(formData: FormData): Promise<ActionResult<{ id: string }>> {
  try {
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) {
      return { success: false, error: "Selecione um arquivo de imagem." };
    }
    if (!file.type.startsWith(ACCEPTED_PREFIX)) {
      return { success: false, error: "Apenas imagens são aceitas." };
    }
    if (file.size > MAX_FILE_BYTES) {
      return { success: false, error: "A imagem passa de 10 MB." };
    }

    const supabase = await createSupabaseServerClient();
    const userId = await requireAuthUserId(supabase);

    const extension = file.name.split(".").pop()?.toLowerCase() || "jpg";
    const path = `${userId}/biblioteca/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${extension}`;

    const { error: uploadError } = await supabase.storage
      .from(MEDIA_BUCKET)
      .upload(path, file, { contentType: file.type || undefined, upsert: false });

    if (uploadError) return { success: false, error: uploadError.message };

    const {
      data: { publicUrl },
    } = supabase.storage.from(MEDIA_BUCKET).getPublicUrl(path);

    const { data, error } = await supabase
      .from("media_library")
      .insert({
        user_id: userId,
        url: publicUrl,
        storage_path: path,
        title: nullify(String(formData.get("title") ?? "")) ?? file.name,
        source: "upload",
        mime_type: file.type || null,
        file_size: file.size,
      })
      .select("id")
      .single();

    if (error || !data) {
      // A linha é a fonte de verdade: sem ela, o arquivo é lixo no bucket.
      await supabase.storage.from(MEDIA_BUCKET).remove([path]);
      return { success: false, error: error?.message ?? "Falha ao registrar a imagem." };
    }

    revalidatePath("/configuracoes/midia");
    return { success: true, data: { id: String(data.id) } };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erro inesperado ao enviar a imagem.";
    return { success: false, error: message };
  }
}

export async function updateMediaAction(input: {
  id: string;
  title: string | null;
  caption: string | null;
}): Promise<ActionResult> {
  try {
    const supabase = await createSupabaseServerClient();
    const userId = await requireAuthUserId(supabase);

    const { error } = await supabase
      .from("media_library")
      .update({ title: nullify(input.title), caption: nullify(input.caption) })
      .eq("id", input.id)
      .eq("user_id", userId);

    if (error) return { success: false, error: error.message };

    revalidatePath("/configuracoes/midia");
    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erro inesperado ao salvar a imagem.";
    return { success: false, error: message };
  }
}

export async function deleteMediaAction(id: string): Promise<ActionResult> {
  try {
    const supabase = await createSupabaseServerClient();
    const userId = await requireAuthUserId(supabase);

    const { data: existing } = await supabase
      .from("media_library")
      .select("storage_path")
      .eq("id", id)
      .eq("user_id", userId)
      .maybeSingle();

    const { error } = await supabase
      .from("media_library")
      .delete()
      .eq("id", id)
      .eq("user_id", userId);

    if (error) return { success: false, error: error.message };

    // Propostas já publicadas guardam a URL em proposal_media; apagar da
    // biblioteca não deveria arrancar a foto de uma peça enviada ao cliente.
    // Por isso o arquivo só sai do bucket se ninguém mais o referencia.
    const path = existing?.storage_path as string | undefined;
    if (path) {
      const { count } = await supabase
        .from("proposal_media")
        .select("id", { count: "exact", head: true })
        .eq("media_id", id);

      if (!count) {
        await supabase.storage.from(MEDIA_BUCKET).remove([path]);
      }
    }

    revalidatePath("/configuracoes/midia");
    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erro inesperado ao excluir a imagem.";
    return { success: false, error: message };
  }
}

/** Substitui as tags da imagem, criando as que ainda não existem. */
export async function setMediaTagsAction(input: {
  mediaId: string;
  tags: string[];
}): Promise<ActionResult> {
  try {
    const supabase = await createSupabaseServerClient();
    const userId = await requireAuthUserId(supabase);

    const names = [
      ...new Set(
        input.tags
          .map((tag) => tag.trim().toLowerCase())
          .filter((tag) => tag.length > 0 && tag.length <= 40),
      ),
    ];

    const { error: clearError } = await supabase
      .from("media_library_tags")
      .delete()
      .eq("media_id", input.mediaId)
      .eq("user_id", userId);

    if (clearError) return { success: false, error: clearError.message };
    if (names.length === 0) {
      revalidatePath("/configuracoes/midia");
      return { success: true };
    }

    const { data: existing } = await supabase
      .from("media_tags")
      .select("id, name")
      .eq("user_id", userId)
      .in("name", names);

    const byName = new Map(
      ((existing ?? []) as Record<string, unknown>[]).map((row) => [
        String(row.name),
        String(row.id),
      ]),
    );

    const missing = names.filter((name) => !byName.has(name));
    if (missing.length > 0) {
      const { data: created, error: createError } = await supabase
        .from("media_tags")
        .insert(missing.map((name) => ({ user_id: userId, name })))
        .select("id, name");

      if (createError) return { success: false, error: createError.message };
      for (const row of (created ?? []) as Record<string, unknown>[]) {
        byName.set(String(row.name), String(row.id));
      }
    }

    const { error: linkError } = await supabase.from("media_library_tags").insert(
      names.map((name) => ({
        media_id: input.mediaId,
        tag_id: byName.get(name)!,
        user_id: userId,
      })),
    );

    if (linkError) return { success: false, error: linkError.message };

    revalidatePath("/configuracoes/midia");
    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erro inesperado ao salvar as tags.";
    return { success: false, error: message };
  }
}
