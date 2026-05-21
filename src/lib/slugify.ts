/**
 * Slug para nomes de arquivo (kebab-case, sem acentos).
 */
export function slugifyFileName(name: string, maxLen = 60): string {
  const slug = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-+/g, '-');

  if (!slug) return 'sem-nome';
  return slug.length > maxLen ? slug.slice(0, maxLen).replace(/-+$/, '') : slug;
}

/** Evita colisão quando dois fornecedores geram o mesmo slug. */
export function uniqueSlug(base: string, used: Set<string>): string {
  if (!used.has(base)) {
    used.add(base);
    return base;
  }
  let n = 2;
  while (used.has(`${base}-${n}`)) n += 1;
  const unique = `${base}-${n}`;
  used.add(unique);
  return unique;
}

/** Data no formato YYYY-MM-DD para nomes de arquivo. */
export function formatDateForZip(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
