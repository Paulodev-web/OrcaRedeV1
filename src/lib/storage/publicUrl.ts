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

/**
 * Detecção de imagem raster (PNG, JPEG, WebP) via content-type ou extensão.
 * Complementa `looksLikePdf` para cobrir o caso em que a planta do
 * orçamento é uma imagem normal (não PDF).
 */
export function looksLikeRasterImage(params: {
  contentType?: string | null;
  fileName?: string | null;
}): boolean {
  const ct = (params.contentType ?? '').toLowerCase();
  if (
    ct.includes('image/png') ||
    ct.includes('image/jpeg') ||
    ct.includes('image/webp') ||
    ct.includes('image/gif') ||
    ct.includes('image/bmp')
  ) {
    return true;
  }
  const name = (params.fileName ?? '').toLowerCase();
  return /\.(png|jpe?g|webp|gif|bmp)$/.test(name);
}

/** Infere o content-type a partir da extensão do arquivo. */
export function inferImageContentType(fileName: string): string {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.gif')) return 'image/gif';
  if (lower.endsWith('.bmp')) return 'image/bmp';
  return 'application/octet-stream';
}

/** Extrai a extensão de imagem de um nome de arquivo (fallback: 'png'). */
export function inferImageExtension(
  contentType: string | null,
  fileName: string | null,
): string {
  const ct = (contentType ?? '').toLowerCase();
  if (ct.includes('image/png')) return 'png';
  if (ct.includes('image/jpeg')) return 'jpg';
  if (ct.includes('image/webp')) return 'webp';
  if (ct.includes('image/gif')) return 'gif';

  const ext = (fileName ?? '').toLowerCase().split('.').pop() ?? '';
  if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'].includes(ext)) return ext;
  return 'png';
}

/**
 * Lê as dimensões naturais (width, height) de uma imagem PNG ou JPEG
 * diretamente dos bytes do cabeçalho, sem dependências externas.
 * Retorna `null` para formatos não reconhecidos ou dados corrompidos.
 */
export function getImageNaturalDimensions(
  bytes: Uint8Array,
): { width: number; height: number } | null {
  if (bytes.length < 24) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  // PNG: 89 50 4E 47 ... IHDR width(4B BE) height(4B BE) at offset 16
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    const w = view.getUint32(16);
    const h = view.getUint32(20);
    return w > 0 && h > 0 ? { width: w, height: h } : null;
  }

  // JPEG: FF D8, scan for SOF0..SOF3 markers (C0–C3)
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    let i = 2;
    while (i + 9 < bytes.length) {
      if (bytes[i] !== 0xff) {
        i++;
        continue;
      }
      const marker = bytes[i + 1];
      if (marker === 0x00 || marker === 0xff) {
        i++;
        continue;
      }
      if (marker >= 0xc0 && marker <= 0xc3) {
        const h = view.getUint16(i + 5);
        const w = view.getUint16(i + 7);
        return w > 0 && h > 0 ? { width: w, height: h } : null;
      }
      if (marker === 0xda) break; // SOS — no more metadata
      const segLen = view.getUint16(i + 2);
      if (segLen < 2) break;
      i += 2 + segLen;
    }
  }

  return null;
}
