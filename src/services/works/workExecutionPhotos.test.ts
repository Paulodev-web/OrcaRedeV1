import assert from 'node:assert/strict';
import test from 'node:test';
import type { SupabaseClient } from '@supabase/supabase-js';
import { executionPhotoPath, parseExecutionPhotoId, publicExecutionPhotoPath, listExecutionPhotos } from './workExecutionPhotos';

const mediaId = '11111111-1111-4111-8111-111111111111';
const imageId = `campo-pole-${mediaId}`;
const workId = 'obra-a';
const path = `${workId}/pole-installations/foto.jpg`;

function database(options: { published?: boolean; enabled?: boolean; active?: boolean; path?: string; fail?: boolean } = {}) {
  const calls: Array<{ table: string; filters: Array<[string, unknown]> }> = [];
  const db = {
    from(table: string) {
      const call = { table, filters: [] as Array<[string, unknown]> };
      calls.push(call);
      const query = {
        select() { return query; },
        eq(key: string, value: unknown) { call.filters.push([key, value]); return query; },
        neq(key: string, value: unknown) { call.filters.push([key, `not:${value}`]); return query; },
        maybeSingle: async () => ({
          data: table === 'work_trackings'
            ? options.enabled === false ? null : { work_id: workId, work_images: options.published === false ? [] : [{ id: imageId }] }
            : table === 'works' ? options.active === false ? null : { id: workId }
              : { storage_path: options.path ?? path },
          error: options.fail ? { message: 'offline' } : null,
        }),
      };
      return query;
    },
  } as unknown as SupabaseClient;
  return { db, calls };
}

test('publicação só assina a foto selecionada, da mesma obra e do registro pai', async () => {
  const { db, calls } = database();
  assert.equal(await publicExecutionPhotoPath(db, 'public-token', imageId), path);
  assert.deepEqual(calls[0].filters, [['public_id', 'public-token'], ['public_enabled', true]]);
  assert.deepEqual(calls[1].filters, [['id', workId], ['status', 'not:cancelled']]);
  assert.deepEqual(calls[2].filters, [['work_id', workId], ['work_pole_installations.work_id', workId],
    ['kind', 'image'], ['work_pole_installations.status', 'installed'], ['id', mediaId]]);
});

for (const options of [{ published: false }, { enabled: false }, { active: false }]) {
  test(`nega acesso sem autorização pública: ${JSON.stringify(options)}`, async () => {
    const { db, calls } = database(options);
    assert.equal(await publicExecutionPhotoPath(db, 'public-token', imageId), null);
    assert.ok(!calls.some((call) => call.table === 'work_pole_installation_media'));
  });
}

for (const invalidPath of ['obra-b/foto.jpg', `${workId}/../foto.jpg`, `${workId}/pasta\\foto.jpg`]) {
  test(`nega caminho inválido: ${invalidPath}`, async () => {
    assert.equal(await executionPhotoPath(database({ path: invalidPath }).db, workId, imageId), null);
  });
}

test('recusa IDs arbitrários antes de consultar o banco', async () => {
  const { db, calls } = database();
  for (const id of ['https://example.test/foto', 'campo-chat-' + mediaId, 'campo-pole-../../secret', 'img-antiga']) {
    assert.equal(parseExecutionPhotoId(id), null);
    assert.equal(await publicExecutionPhotoPath(db, 'public-token', id), null);
  }
  assert.equal(calls.length, 0);
});

test('falha do banco não autoriza mídia', async () => {
  await assert.rejects(publicExecutionPhotoPath(database({ fail: true }).db, 'public-token', imageId), /offline/);
});

test('valida origem e paginação antes de ler arquivos', async () => {
  const { db, calls } = database();
  for (const page of [-1, 0.5, Infinity, 10001]) {
    await assert.rejects(listExecutionPhotos(db, workId, 'pole', page), /inválido/);
  }
  assert.equal(calls.length, 0);
});
