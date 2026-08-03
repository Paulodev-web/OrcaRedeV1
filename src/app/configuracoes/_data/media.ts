import "server-only";

import { createSupabaseServerClient, requireAuthUserId } from "@/lib/supabaseServer";

export interface MediaLibraryItem {
  id: string;
  url: string;
  title: string | null;
  caption: string | null;
  source: string;
  createdAt: string;
  tags: string[];
}

/**
 * Biblioteca de mídia do usuário, mais recente primeiro.
 *
 * As tags vêm no mesmo round-trip pelo embed do PostgREST: uma consulta por
 * imagem transformaria a grade num N+1 assim que a biblioteca crescer.
 */
export async function getMediaLibrary(): Promise<{
  items: MediaLibraryItem[];
  allTags: string[];
  error: string | null;
}> {
  try {
    const supabase = await createSupabaseServerClient();
    const userId = await requireAuthUserId(supabase);

    const [mediaResult, tagsResult] = await Promise.all([
      supabase
        .from("media_library")
        .select(
          "id, url, title, caption, source, created_at, media_library_tags ( media_tags ( name ) )",
        )
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(300),
      supabase.from("media_tags").select("name").eq("user_id", userId).order("name"),
    ]);

    if (mediaResult.error) {
      return { items: [], allTags: [], error: mediaResult.error.message };
    }

    const items: MediaLibraryItem[] = ((mediaResult.data ?? []) as Record<string, unknown>[]).map(
      (row) => {
        const links = Array.isArray(row.media_library_tags) ? row.media_library_tags : [];
        const tags = links
          .map((link) => {
            const record = link as Record<string, unknown>;
            const tag = Array.isArray(record.media_tags) ? record.media_tags[0] : record.media_tags;
            const name = (tag as Record<string, unknown> | null)?.name;
            return typeof name === "string" ? name : null;
          })
          .filter((name): name is string => name !== null)
          .sort();

        return {
          id: String(row.id ?? ""),
          url: String(row.url ?? ""),
          title: typeof row.title === "string" ? row.title : null,
          caption: typeof row.caption === "string" ? row.caption : null,
          source: typeof row.source === "string" ? row.source : "upload",
          createdAt: String(row.created_at ?? ""),
          tags,
        };
      },
    );

    const allTags = ((tagsResult.data ?? []) as Record<string, unknown>[])
      .map((row) => String(row.name ?? ""))
      .filter((name) => name.length > 0);

    return { items, allTags, error: null };
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Não foi possível carregar a biblioteca de mídia.";
    return { items: [], allTags: [], error: message };
  }
}
