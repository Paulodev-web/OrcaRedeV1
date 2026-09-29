import assert from 'node:assert/strict';
import test from 'node:test';
import type { WorkTracking } from '@/types';
import { calculateWeightedProgress } from './syncWorkTracking';

function tracking(overrides: Partial<WorkTracking>): Partial<WorkTracking> {
  return {
    progress_percentage: 0,
    ...overrides,
  };
}

test('normaliza o peso quando o espelho possui apenas meta de postes', () => {
  assert.equal(
    calculateWeightedProgress(
      tracking({ work_id: 'work-1', planned_poles: 52, poles_installed: 14 }),
    ),
    27,
  );
});

test('mantem o divisor historico de 100 nos acompanhamentos legados', () => {
  assert.equal(
    calculateWeightedProgress(
      tracking({ work_id: null, planned_poles: 20, poles_installed: 10 }),
    ),
    25,
  );
});

test('combina somente metas existentes no acompanhamento espelhado', () => {
  assert.equal(
    calculateWeightedProgress(
      tracking({
        work_id: 'work-2',
        planned_poles: 10,
        poles_installed: 5,
        planned_bt_meters: 100,
        bt_extension_km: 0.1,
      }),
    ),
    67,
  );
});

test('limita cada meta e o total a 100 por cento', () => {
  assert.equal(
    calculateWeightedProgress(
      tracking({ work_id: 'work-3', planned_poles: 2, poles_installed: 20 }),
    ),
    100,
  );
});

test('preserva o valor persistido quando nao existe nenhuma meta', () => {
  assert.equal(
    calculateWeightedProgress(tracking({ work_id: 'work-4', progress_percentage: 31 })),
    31,
  );
});
