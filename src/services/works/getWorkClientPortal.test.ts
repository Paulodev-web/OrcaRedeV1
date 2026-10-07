import assert from 'node:assert/strict';
import test from 'node:test';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getWorkClientPortal } from './getWorkClientPortal';

function database(data: unknown, error: { message: string } | null = null) {
  const query = {
    select() { return query; },
    eq(column: string, value: string) {
      assert.equal(column, 'work_id');
      assert.equal(value, 'obra-teste');
      return query;
    },
    maybeSingle: async () => ({ data, error }),
  };
  return { from: () => query } as unknown as SupabaseClient;
}

test('falha de consulta não é apresentada como obra sem portal', async () => {
  await assert.rejects(getWorkClientPortal(database(null, { message: 'offline' }), 'obra-teste'), /offline/);
});

test('obra realmente sem portal retorna estado vazio', async () => {
  assert.equal(await getWorkClientPortal(database(null), 'obra-teste'), null);
});

test('portal preserva suspensão pública e filtra fotos inválidas', async () => {
  const portal = await getWorkClientPortal(database({
    id: 'portal', public_enabled: false,
    work_images: [null, 'inválido', {}, { id: 'foto', url: 'https://example.test/foto.jpg' }],
    planned_public_lighting: 12, public_lighting_installed: 4,
  }), 'obra-teste');
  assert.equal(portal?.publicEnabled, false);
  assert.equal(portal?.images.length, 1);
  assert.equal(portal?.plannedPublicLighting, 12);
  assert.equal(portal?.publicLightingInstalled, 4);
});
