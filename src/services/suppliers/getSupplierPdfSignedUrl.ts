import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

const BUCKET = 'fornecedores_pdfs';
const TTL_SECONDS = 60 * 15;

/**
 * Gera URL assinada para PDF do fornecedor, validando ownership via prefixo userId.
 */
export async function getSupplierPdfSignedUrl(
  supabase: SupabaseClient,
  userId: string,
  filePath: string
): Promise<string | null> {
  const trimmed = filePath?.trim();
  if (!trimmed) return null;

  const expectedPrefix = `${userId}/`;
  if (!trimmed.startsWith(expectedPrefix)) {
    return null;
  }

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(trimmed, TTL_SECONDS);

  if (error || !data?.signedUrl) {
    return null;
  }

  return data.signedUrl;
}
