import type { TrackedPost } from '@/types';

/** Converte string para UUID válido (determinístico) para sync com Supabase */
export function toValidUuid(str: string): string {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (uuidRegex.test(str)) return str;
  let h = 0;
  for (let i = 0; i < str.length; i++) h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  const h2 = Math.imul(h, 31);
  const h3 = Math.imul(h2, 31);
  const hex = [
    (h >>> 0).toString(16).padStart(8, '0'),
    (h2 >>> 0).toString(16).padStart(8, '0').slice(-8),
    (h3 >>> 0).toString(16).padStart(8, '0').slice(-8),
    ((h ^ h2 ^ h3) >>> 0).toString(16).padStart(8, '0').slice(-8),
  ].join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(12, 15)}-8${hex.slice(15, 18)}-${hex.slice(18, 30)}`;
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Identificador estável usado como client_id no banco */
export function getPostClientId(post: TrackedPost): string {
  return post.client_id ?? post.id;
}

/** ID da linha em tracked_posts */
export function getDbPostId(post: TrackedPost): string {
  if (UUID_REGEX.test(post.id)) return post.id;
  return toValidUuid(getPostClientId(post));
}

export function isPostTombstoned(post: TrackedPost, tombstones: ReadonlySet<string>): boolean {
  if (tombstones.has(post.id)) return true;
  if (tombstones.has(getPostClientId(post))) return true;
  if (tombstones.has(getDbPostId(post))) return true;
  return false;
}

const POST_NUMBER_REGEX = /^Poste\s+(\d+)$/i;

export function computeMaxPostNumber(posts: TrackedPost[]): number {
  let maxNumber = 0;
  for (const p of posts) {
    const match = POST_NUMBER_REGEX.exec(p.name || '');
    if (match) {
      const num = parseInt(match[1], 10);
      if (num > maxNumber) maxNumber = num;
    }
  }
  return maxNumber;
}
