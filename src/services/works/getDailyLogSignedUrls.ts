import 'server-only';
import { createSupabaseServiceRoleClient } from '@/lib/supabaseServer';
import { DAILY_LOG_DOWNLOAD_URL_TTL_SECONDS } from '@/types/works';

const ANDAMENTO_OBRA_BUCKET = 'andamento-obra';
const SIGN_BATCH_CHUNK_SIZE = 100;

/**
 * Gera URLs assinadas em batch para preview/download de midias do diario.
 * Mesma estrategia de getAttachmentSignedUrls; TTL de 30 min.
 */
export async function getDailyLogSignedUrls(
  paths: string[],
): Promise<Record<string, string>> {
  const result: Record<string, string> = {};
  if (paths.length === 0) return result;

  const unique = Array.from(new Set(paths.filter((p) => p && p.length > 0)));
  if (unique.length === 0) return result;

  const supabase = createSupabaseServiceRoleClient();
  const storage = supabase.storage.from(ANDAMENTO_OBRA_BUCKET);

  for (let i = 0; i < unique.length; i += SIGN_BATCH_CHUNK_SIZE) {
    const chunk = unique.slice(i, i + SIGN_BATCH_CHUNK_SIZE);
    try {
      const { data, error } = await storage.createSignedUrls(
        chunk,
        DAILY_LOG_DOWNLOAD_URL_TTL_SECONDS,
      );
      if (error || !data) {
        console.error('[getDailyLogSignedUrls] chunk failed', {
          size: chunk.length,
          error: error?.message,
        });
        continue;
      }
      for (const item of data) {
        if (item.path && item.signedUrl && !item.error) {
          result[item.path] = item.signedUrl;
        }
      }
    } catch (err) {
      console.error('[getDailyLogSignedUrls] excecao em chunk', err);
    }
  }

  return result;
}
