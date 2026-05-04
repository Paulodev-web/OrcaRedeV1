import type {
  CategorizeWorksOptions,
  WorksGrouped,
  WorkWithManager,
} from '@/types/works';

/**
 * Função pura: agrupa obras nas 4 faixas da Central de Acompanhamento.
 *
 * Regras nesta fase:
 *   - red:    obras com alertas críticos (passados em options.workIdsWithAlerts)
 *   - yellow: obras com pendências de revisão (options.workIdsWithPending)
 *   - green:  obras com status 'planned' ou 'in_progress' que não estão em red/yellow
 *   - gray:   obras com status 'paused', 'completed' ou 'cancelled'
 *
 * Os arrays de IDs são opcionais para permitir evolução futura sem refactor.
 */
export function categorizeWorks(
  works: ReadonlyArray<WorkWithManager>,
  options: CategorizeWorksOptions = {},
): WorksGrouped {
  const alertSet = new Set(options.workIdsWithAlerts ?? []);
  const pendingSet = new Set(options.workIdsWithPending ?? []);

  const result: WorksGrouped = { red: [], yellow: [], green: [], gray: [] };

  for (const work of works) {
    if (alertSet.has(work.id)) {
      result.red.push(work);
      continue;
    }
    if (pendingSet.has(work.id)) {
      result.yellow.push(work);
      continue;
    }
    if (work.status === 'planned' || work.status === 'in_progress') {
      result.green.push(work);
      continue;
    }
    result.gray.push(work);
  }

  return result;
}
