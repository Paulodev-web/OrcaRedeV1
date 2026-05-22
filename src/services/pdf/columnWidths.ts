import type { TableColumn } from '@/types/pdfExport';
import { CONTENT_WIDTH } from './constants';

export function computeColumnWidths(columns: TableColumn[]): number[] {
  const weights = columns.map((c) => (c.weight != null && c.weight > 0 ? c.weight : 1));
  const totalWeight = weights.reduce((sum, w) => sum + w, 0);
  return weights.map((w) => (CONTENT_WIDTH * w) / totalWeight);
}
