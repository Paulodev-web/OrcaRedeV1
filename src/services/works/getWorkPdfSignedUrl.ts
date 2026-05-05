import 'server-only';
import { createSupabaseServiceRoleClient } from '@/lib/supabaseServer';

/**
 * TTL padrao das URLs assinadas de PDF do projeto importado.
 *
 * 30 minutos = 1800s. Mais longo que o TTL da aba Documentos (10 min)
 * porque o canvas pode ficar aberto por longos periodos durante uma
 * sessao de inspecao do projeto. Apos expirar, F5 regenera a URL.
 *
 * Renovacao automatica via revalidacao do Server Component fica como
 * divida tecnica (registrada no plano - secao G).
 */
export const WORK_PDF_SIGNED_URL_TTL_SECONDS = 60 * 30;

/**
 * Gera uma URL assinada (`andamento-obra` bucket) para o PDF de projeto
 * de uma obra. Deve ser chamada apenas em Server Components / Server
 * Actions, pois usa a service role key.
 *
 * - Retorna `null` se `pdfStoragePath` for null/undefined ou se o objeto
 *   nao existir (caso raro de corrupcao).
 * - O caller deve apresentar fallback "PDF indisponivel" quando null.
 *
 * Nota de seguranca: a Server Action que carrega esta URL ja roda apos
 * a RLS de `work_project_snapshot` validar que o usuario e membro da obra.
 * O service role aqui apenas gera a URL temporaria; o Storage policy
 * `andamento_obra_storage_select` continua aplicado a quem usar a URL.
 */
export async function getWorkPdfSignedUrl(
  pdfStoragePath: string | null | undefined,
): Promise<string | null> {
  if (!pdfStoragePath) return null;

  try {
    const supabase = createSupabaseServiceRoleClient();
    const { data, error } = await supabase.storage
      .from('andamento-obra')
      .createSignedUrl(pdfStoragePath, WORK_PDF_SIGNED_URL_TTL_SECONDS);

    if (error || !data?.signedUrl) {
      console.error('[getWorkPdfSignedUrl] falha ao gerar URL assinada', {
        path: pdfStoragePath,
        error: error?.message,
      });
      return null;
    }

    return data.signedUrl;
  } catch (err) {
    console.error('[getWorkPdfSignedUrl] excecao inesperada', err);
    return null;
  }
}
