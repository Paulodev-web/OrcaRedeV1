import type { SystemMaterial, UnconciliatedItem } from '@/types/supplierExtract';
import {
  DEFAULT_SEMANTIC_MATCH_MAX_CANDIDATES,
  SEMANTIC_MATCH_MIN_CANDIDATES,
} from '@/lib/suppliesSemanticMatchConfig';

const STOPWORDS = new Set([
  'a',
  'o',
  'e',
  'de',
  'da',
  'do',
  'das',
  'dos',
  'com',
  'sem',
  'para',
  'por',
  'em',
  'c',
  'c/',
  'un',
  'und',
  'unid',
  'unidade',
  'metro',
  'metros',
  'm',
]);

const NUMERIC_PATTERN = /\d+(?:[.,]\d+)?(?:mm²?|mm2|kv|kva|a|m|cm|mm|un)?/gi;

function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\w\s./²]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(value: string): string[] {
  return normalizeText(value)
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

function extractNumericTokens(...values: string[]): Set<string> {
  const out = new Set<string>();
  for (const value of values) {
    const matches = value.match(NUMERIC_PATTERN);
    if (!matches) continue;
    for (const m of matches) {
      out.add(normalizeText(m).replace(/\s/g, ''));
    }
  }
  return out;
}

function unitCompatibilityScore(itemUnit: string, materialUnit: string): number {
  const a = normalizeText(itemUnit);
  const b = normalizeText(materialUnit);
  if (!a || !b) return 0;
  if (a === b) return 8;
  if (a.includes(b) || b.includes(a)) return 4;
  return 0;
}

export function rankMaterialCandidates(
  item: Pick<UnconciliatedItem, 'descricao' | 'unidade'>,
  materials: SystemMaterial[]
): { material: SystemMaterial; score: number }[] {
  const descNorm = normalizeText(item.descricao);
  const itemTokens = new Set(tokenize(item.descricao));
  const itemNumerics = extractNumericTokens(item.descricao);

  const ranked = materials.map((material) => {
    let score = 0;
    const codeNorm = normalizeText(material.code);

    if (codeNorm && descNorm.includes(codeNorm)) {
      score += 40;
    }

    const materialTokens = tokenize(`${material.name} ${material.code}`);
    for (const token of materialTokens) {
      if (itemTokens.has(token)) score += 6;
    }

    const materialNumerics = extractNumericTokens(material.name, material.code);
    for (const num of materialNumerics) {
      if (itemNumerics.has(num)) score += 10;
    }

    score += unitCompatibilityScore(item.unidade, material.unit);

    return { material, score };
  });

  ranked.sort((a, b) => b.score - a.score);
  return ranked;
}

export function getCandidateMaterialsForBatch(
  items: UnconciliatedItem[],
  allMaterials: SystemMaterial[],
  maxCandidates: number = DEFAULT_SEMANTIC_MATCH_MAX_CANDIDATES
): SystemMaterial[] {
  if (items.length === 0 || allMaterials.length === 0) return [];

  const perItemTop = Math.max(8, Math.ceil(maxCandidates / items.length));
  const selectedIds = new Set<string>();
  const selected: SystemMaterial[] = [];

  const addMaterial = (material: SystemMaterial) => {
    if (selectedIds.has(material.id)) return;
    selectedIds.add(material.id);
    selected.push(material);
  };

  for (const item of items) {
    const ranked = rankMaterialCandidates(item, allMaterials);
    for (const entry of ranked.slice(0, perItemTop)) {
      if (entry.score <= 0) continue;
      addMaterial(entry.material);
      if (selected.length >= maxCandidates) return selected;
    }
  }

  if (selected.length >= SEMANTIC_MATCH_MIN_CANDIDATES) {
    return selected;
  }

  const globalRanked = allMaterials
    .map((material) => {
      let best = 0;
      for (const item of items) {
        const top = rankMaterialCandidates(item, [material])[0];
        if (top && top.score > best) best = top.score;
      }
      return { material, score: best };
    })
    .sort((a, b) => b.score - a.score);

  for (const entry of globalRanked) {
    addMaterial(entry.material);
    if (selected.length >= SEMANTIC_MATCH_MIN_CANDIDATES) break;
    if (selected.length >= maxCandidates) break;
  }

  if (selected.length < SEMANTIC_MATCH_MIN_CANDIDATES) {
    for (const material of allMaterials) {
      addMaterial(material);
      if (selected.length >= SEMANTIC_MATCH_MIN_CANDIDATES) break;
      if (selected.length >= maxCandidates) break;
    }
  }

  return selected;
}

export function chunkItems<T>(items: T[], batchSize: number): T[][] {
  if (batchSize <= 0) return items.length ? [items] : [];
  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    batches.push(items.slice(i, i + batchSize));
  }
  return batches;
}
