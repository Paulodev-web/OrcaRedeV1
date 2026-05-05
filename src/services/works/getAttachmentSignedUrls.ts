import 'server-only';
import { createSupabaseServiceRoleClient } from '@/lib/supabaseServer';
import { CHAT_DOWNLOAD_URL_TTL_SECONDS } from '@/types/works';

const ANDAMENTO_OBRA_BUCKET = 'andamento-obra';
const SIGN_BATCH_CHUNK_SIZE = 100;

/**
 * Gera URLs assinadas em batch para preview/download de anexos do chat.
 * Usa service role; TTL 30 min (CHAT_DOWNLOAD_URL_TTL_SECONDS).
 *
 * Retorna mapa { storagePath -> signedUrl }. Paths que falharem ao assinar
 * sao omitidos do mapa (caller deve tratar como "midia indisponivel").
 *
 * Notes:
 *  - Apesar de o RLS de SELECT no Storage ja proteger membros via path,
 *    geramos via service role para evitar latencia/erros de cookies em
 *    Server Components renderizados em paralelo.
 *  - createSignedUrls em chunks de 100 paths por chamada.
 */
export async function getAttachmentSignedUrls(
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
        CHAT_DOWNLOAD_URL_TTL_SECONDS,
      );
      if (error || !data) {
        console.error('[getAttachmentSignedUrls] chunk failed', {
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
      console.error('[getAttachmentSignedUrls] excecao em chunk', err);
    }
  }

  return result;
}
