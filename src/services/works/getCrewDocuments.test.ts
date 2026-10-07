import assert from 'node:assert/strict';
import test from 'node:test';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getPublicCrewDocuments } from './getCrewDocuments';

function database(options: { portal?: boolean; active?: boolean; member?: boolean; published?: boolean; owner?: string; path?: string; fail?: boolean } = {}) {
  const calls: Array<{ table: string; filters: Array<[string, unknown]> }> = [];
  const tables: Record<string, unknown> = {
    work_trackings: options.portal === false ? null : { work_id: 'work' },
    works: options.active === false ? null : { id: 'work' },
    work_team: options.member === false ? [] : [{ crew_member_id: 'person', crew_members: { full_name: 'Pessoa de teste', owner_id: 'engineer' } }],
    work_document_publications: options.published === false ? [] : [{ published_by: 'engineer', crew_documents: {
      id: 'document', crew_member_id: 'person', owner_id: options.owner ?? 'engineer', title: 'NR-10', document_kind: 'NR',
      storage_path: options.path ?? 'engineer/person/document.pdf', mime_type: 'application/pdf',
    } }],
  };
  const db = { from(table: string) {
    const call = { table, filters: [] as Array<[string, unknown]> }; calls.push(call);
    const query = {
      select() { return query; },
      eq(key: string, value: unknown) { call.filters.push([key, value]); return query; },
      neq(key: string, value: unknown) { call.filters.push([key, `not:${value}`]); return query; },
      is(key: string, value: unknown) { call.filters.push([key, value]); return query; },
      maybeSingle() { return query; },
      then(resolve: (value: unknown) => unknown) { return Promise.resolve({ data: tables[table], error: options.fail ? new Error('offline') : null }).then(resolve); },
    }; return query;
  } } as unknown as SupabaseClient;
  return { db, calls };
}

test('documento público exige token, publicação e alocação ativa na mesma obra', async () => {
  const { db, calls } = database();
  const docs = await getPublicCrewDocuments(db, 'token');
  assert.equal(docs.length, 1);
  assert.equal(docs[0].title, 'NR-10');
  assert.deepEqual(calls.find((call) => call.table === 'work_trackings')?.filters, [['public_id', 'token'], ['public_enabled', true]]);
  assert.deepEqual(calls.find((call) => call.table === 'work_team')?.filters, [['work_id', 'work'], ['deallocated_at', null], ['crew_members.is_active', true]]);
  assert.deepEqual(calls.find((call) => call.table === 'work_document_publications')?.filters, [['work_id', 'work']]);
});
for (const options of [{ portal: false }, { active: false }, { member: false }, { published: false }, { owner: 'outra-pessoa' }, { path: 'outro/documento.pdf' }, { path: 'engineer/person/document.../segredo' }]) {
  test(`documento privado não vaza: ${JSON.stringify(options)}`, async () => {
    assert.deepEqual(await getPublicCrewDocuments(database(options).db, 'token'), []);
  });
}
test('falha de consulta interrompe autorização de documentos', async () => {
  await assert.rejects(getPublicCrewDocuments(database({ fail: true }).db, 'token'), /offline/);
});
