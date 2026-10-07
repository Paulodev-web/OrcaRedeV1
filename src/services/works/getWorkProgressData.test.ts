import assert from 'node:assert/strict';
import test from 'node:test';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getWorkProgressData } from './getWorkProgressData';

function database(failedTable?: string) {
  const calls: Array<{ table: string; filters: Array<[string, unknown]> }> = [];
  const tables: Record<string, { data: unknown; count?: number }> = {
    works: { data: { started_at: null, expected_end_at: null } },
    work_project_snapshot: { data: { meters_planned: { BT: 100, MT: 0, rede: 0 } } },
    work_project_posts: { data: null, count: 24 },
    work_pole_installations: { data: null, count: 19 },
    work_milestones: { data: [{ status: 'approved' }, { status: 'awaiting_approval' }] },
    work_daily_logs: { data: [{ id: 'day', log_date: '2026-10-05', current_revision_id: 'revision' }] },
    work_daily_log_revisions: { data: [{ id: 'revision', meters_installed: { BT: 40 } }] },
  };
  const client = {
    from(table: string) {
      const call = { table, filters: [] as Array<[string, unknown]> };
      calls.push(call);
      const query = {
        select() { return query; },
        eq(key: string, value: unknown) { call.filters.push([key, value]); return query; },
        in() { return query; },
        order() { return query; },
        maybeSingle() { return query; },
        then(resolve: (value: unknown) => unknown) {
          return Promise.resolve({ ...tables[table], error: table === failedTable ? { message: 'offline' } : null }).then(resolve);
        },
      };
      return query;
    },
  } as unknown as SupabaseClient;
  return { client, calls };
}

test('progresso interno conta postes instalados da obra, sem exigir aprovação pública', async () => {
  const { client, calls } = database();
  const result = await getWorkProgressData(client, 'obra-teste');
  assert.equal(result.postsInstalled, 19);
  assert.equal(result.postsPlanned, 24);
  assert.deepEqual(calls.find((c) => c.table === 'work_pole_installations')?.filters,
    [['work_id', 'obra-teste'], ['status', 'installed']]);
  assert.equal(result.milestonesCounts.awaiting_approval, 1);
  assert.equal(result.milestonesCounts.approved, 1);
  assert.equal(result.totalMetersRealized, 40);
});

for (const table of ['work_pole_installations', 'work_milestones', 'work_daily_log_revisions']) {
  test(`erro em ${table} não vira progresso zero`, async () => {
    const { client } = database(table);
    await assert.rejects(getWorkProgressData(client, 'obra-teste'), /offline/);
  });
}
