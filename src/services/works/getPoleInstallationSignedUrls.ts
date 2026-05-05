import 'server-only';
import { createSupabaseServiceRoleClient } from '@/lib/supabaseServer';
import { POLE_INSTALLATION_DOWNLOAD_URL_TTL_SECONDS } from '@/types/works';

const ANDAMENTO_OBRA_BUCKET = 'andamento-obra';
const SIGN_BATCH_CHUNK_SIZE = 100;

/**
 * Gera URLs assinadas em batch para preview/download de midia de instalacoes.
 * Mesma estrategia de getAttachmentSignedUrls / getDailyLogSignedUrls;
 * TTL 30 min (POLE_INSTALLATION_DOWNLOAD_URL_TTL_SECONDS).
 *
 * Retorna mapa { storagePath -> signedUrl }. Paths que falharem ao assinar
 * sao omitidos do mapa (caller deve tratar como "midia indisponivel").
 */
export async function getPoleInstallationSignedUrls(
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
        POLE_INSTALLATION_DOWNLOAD_URL_TTL_SECONDS,
      );
      if (error || !data) {
        console.error('[getPoleInstallationSignedUrls] chunk failed', {
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
      console.error('[getPoleInstallationSignedUrls] excecao em chunk', err);
    }
  }

  return result;
}
