/**
 * Parse uma URL pública do Supabase Storage gerada por `getPublicUrl`,
 * apenas para o bucket `plans` (planta/PDF do orçamento OrçaRede).
 *
 * Padrão: `<host>/storage/v1/object/public/plans/<path>`
 *
 * Retorna `null` se a URL for inválida, externa ao Supabase, ou apontar
 * para outro bucket. Nunca lança.
 */
export interface ParsedSupabasePublicUrl {
  bucket: 'plans';
  path: string;
}

const PLANS_PUBLIC_URL_PATTERN = /\/storage\/v1\/object\/public\/plans\/(.+)$/;

export function parseSupabaseStoragePublicUrl(
  url: string | null | undefined,
): ParsedSupabasePublicUrl | null {
  if (!url || typeof url !== 'string') return null;
  const match = url.match(PLANS_PUBLIC_URL_PATTERN);
  if (!match || !match[1]) return null;
  try {
    return { bucket: 'plans', path: decodeURIComponent(match[1]) };
  } catch {
    return null;
  }
}

const PDF_MAGIC_BYTES = new Uint8Array([0x25, 0x50, 0x44, 0x46]); // %PDF

/**
 * Detecção de PDF a partir do blob baixado e/ou metadados.
 * Alinhada à heurística usada em src/components/CanvasVisual.tsx
 * (extensão `.pdf`, content-type `application/pdf`, prefixo data: `application/pdf`).
 */
export function looksLikePdf(params: {
  bytes?: Uint8Array | null;
  contentType?: string | null;
  fileName?: string | null;
}): boolean {
  const ct = params.contentType?.toLowerCase() ?? '';
  if (ct.includes('application/pdf')) return true;

  const name = params.fileName?.toLowerCase() ?? '';
  if (name.endsWith('.pdf')) return true;

  const bytes = params.bytes;
  if (bytes && bytes.length >= PDF_MAGIC_BYTES.length) {
    let match = true;
    for (let i = 0; i < PDF_MAGIC_BYTES.length; i++) {
      if (bytes[i] !== PDF_MAGIC_BYTES[i]) {
        match = false;
        break;
      }
    }
    if (match) return true;
  }

  return false;
}
