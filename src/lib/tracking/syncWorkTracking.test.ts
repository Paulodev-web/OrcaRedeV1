import assert from 'node:assert/strict';
import test from 'node:test';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { WorkTracking } from '@/types';
import { calculateWeightedProgress, syncWorkTrackingToSupabase } from './syncWorkTracking';

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

// Cliente falso só com o que o sync usa. `onUpsert` roda enquanto o upsert da
// obra está "em voo", que é onde o autosave do Portal entra no meio.
function fakeSupabase(opts: { onUpsert?: () => void; error?: { message: string } } = {}) {
  const chain = {
    upsert() {
      return chain;
    },
    select() {
      return chain;
    },
    async single() {
      opts.onUpsert?.();
      return opts.error
        ? { data: null, error: opts.error }
        : { data: { id: 'row-1' }, error: null };
    },
  };
  return {
    from: () => chain,
    rpc: async () => ({ error: null }),
  } as unknown as SupabaseClient;
}

function obra(): WorkTracking {
  return {
    id: 'pub-1',
    budget_id: 'budget-1',
    name: 'Marcos Marx',
    status: 'Em Andamento',
    tracked_posts: [],
    post_connections: [],
  } as unknown as WorkTracking;
}

test('autosave no meio do Salvar nao vira erro: a linha da obra ja foi gravada', async () => {
  let generation = 1;
  const result = await syncWorkTrackingToSupabase(
    fakeSupabase({ onUpsert: () => { generation += 1; } }),
    obra(),
    { deletedPostIds: new Set(), syncGeneration: 1, getCurrentGeneration: () => generation },
  );
  assert.equal(result, 'superseded');
});

test('sem ninguem no meio, o sync termina como saved', async () => {
  const result = await syncWorkTrackingToSupabase(fakeSupabase(), obra(), {
    deletedPostIds: new Set(),
    syncGeneration: 1,
    getCurrentGeneration: () => 1,
  });
  assert.equal(result, 'saved');
});

test('banco recusando (RLS) continua sendo failed', async () => {
  const result = await syncWorkTrackingToSupabase(
    fakeSupabase({ error: { message: 'new row violates row-level security policy' } }),
    obra(),
    { deletedPostIds: new Set(), syncGeneration: 1, getCurrentGeneration: () => 1 },
  );
  assert.equal(result, 'failed');
});
