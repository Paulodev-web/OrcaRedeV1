/** Fixture isolada para testes de interface. Não reutiliza identidade ou tenant do cliente. */
import { loadEnvConfig } from '@next/env';
import { createClient } from '@supabase/supabase-js';
import { existsSync, mkdtempSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { PDFDocument } from 'pdf-lib';
import assert from 'node:assert/strict';

loadEnvConfig(process.cwd(), true);
assert.equal(new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname, 'cvumyonqcazhnwxpclms.supabase.co');
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
type State = { userId: string; orgId: string; email: string; password: string; directory: string };
function check(error: { message: string } | null) { if (error) throw new Error(error.message); }

async function main() {
  if (process.argv[2] === 'setup') {
    const runId = randomUUID();
    const directory = mkdtempSync(join(tmpdir(), 'orcarede-meeting-e2e-'));
    const email = `qa-reuniao-${runId}@example.test`;
    const password = `Qa!${randomUUID()}`;
    const user = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: 'Engenheiro QA reunião' } });
    check(user.error); assert.ok(user.data.user);
    const state: State = { userId: user.data.user.id, orgId: randomUUID(), email, password, directory };
    // Salva antes das próximas escritas para permitir limpeza se a preparação falhar.
    writeFileSync(join(directory, 'state.json'), JSON.stringify(state), { mode: 0o600 });
    check((await admin.from('organizations').insert({ id: state.orgId, name: 'QA reunião - tenant descartável', slug: `qa-reuniao-${runId}` })).error);
    check((await admin.from('profiles').upsert({ id: state.userId, full_name: 'Engenheiro QA reunião', email, role: 'engineer', is_active: true, active_org_id: state.orgId })).error);
    // Admin basta para testar as telas e permite excluir a fixture sem esbarrar
    // na proteção de último owner. Esta organização existe apenas no dev.
    check((await admin.from('org_members').insert({ org_id: state.orgId, user_id: state.userId, role: 'admin', sector: 'engenharia', is_active: true })).error);
    check((await admin.from('crew_members').insert({ owner_id: state.userId, org_id: state.orgId, full_name: 'Pessoa sintética QA', role: 'Eletricista', is_active: true })).error);
    const pdf = await PDFDocument.create();
    const page = pdf.addPage([600, 400]);
    page.drawText('QA REUNIAO - ARQUIVO SINTETICO, SEM DADOS PESSOAIS', { x: 30, y: 330, size: 14 });
    page.drawRectangle({ x: 50, y: 60, width: 500, height: 220, borderWidth: 2 });
    writeFileSync(join(directory, 'planta-qa.pdf'), await pdf.save());
    console.log(JSON.stringify({ ...state, statePath: join(directory, 'state.json'), pdfPath: join(directory, 'planta-qa.pdf') }));
    return;
  }
  if (!['cleanup', 'seed-photo'].includes(process.argv[2])) throw new Error('Use setup, seed-photo <state.json> <workId> ou cleanup <state.json>.');
  const file = process.argv[3];
  assert.match(file, /^\/tmp\/orcarede-meeting-e2e-[^/]+\/state\.json$/);
  const state: State = JSON.parse(readFileSync(file, 'utf8'));
  assert.equal(file, join(state.directory, 'state.json'));
  const user = await admin.auth.admin.getUserById(state.userId);
  check(user.error); assert.ok(user.data.user); assert.equal(user.data.user.email, state.email); assert.match(state.email, /^qa-reuniao-.*@example\.test$/);
  const org = await admin.from('organizations').select('name').eq('id', state.orgId).single();
  check(org.error); assert.equal(org.data?.name, 'QA reunião - tenant descartável');
  if (process.argv[2] === 'seed-photo') {
    const workId = process.argv[4];
    const work = await admin.from('works').select('id').eq('id', workId).eq('org_id', state.orgId).single();
    check(work.error); assert.ok(work.data);
    const installationId = randomUUID();
    const mediaId = randomUUID();
    const storagePath = `${workId}/qa/${mediaId}.png`;
    // Pixel sintético: não copia nem publica fotos de clientes.
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64');
    check((await admin.from('work_pole_installations').insert({ id: installationId, work_id: workId, created_by: state.userId, x_coord: 3000, y_coord: 3000, installed_at: new Date().toISOString(), client_event_id: randomUUID(), numbering: 'QA sintético' })).error);
    check((await admin.storage.from('andamento-obra').upload(storagePath, png, { contentType: 'image/png' })).error);
    check((await admin.from('work_pole_installation_media').insert({ id: mediaId, installation_id: installationId, work_id: workId, kind: 'image', storage_path: storagePath, mime_type: 'image/png', size_bytes: png.length })).error);
    console.log(JSON.stringify({ imageId: `campo-pole-${mediaId}` }));
    return;
  }
  const works = await admin.from('works').select('id').eq('org_id', state.orgId); check(works.error);
  for (const work of works.data ?? []) {
    const media = await admin.from('work_pole_installation_media').select('storage_path').eq('work_id', work.id); check(media.error);
    for (const item of media.data ?? []) {
      assert.ok(item.storage_path.startsWith(`${work.id}/qa/`));
      check((await admin.storage.from('andamento-obra').remove([item.storage_path])).error);
    }
    const snapshots = await admin.from('work_project_snapshot').select('pdf_storage_path').eq('work_id', work.id); check(snapshots.error);
    for (const snap of snapshots.data ?? []) if (snap.pdf_storage_path) {
      assert.ok(snap.pdf_storage_path.startsWith(`${work.id}/`));
      check((await admin.storage.from('andamento-obra').remove([snap.pdf_storage_path])).error);
    }
    check((await admin.from('work_trackings').delete().eq('work_id', work.id)).error);
    check((await admin.from('works').delete().eq('id', work.id).eq('org_id', state.orgId)).error);
  }
  const docs = await admin.from('crew_documents').select('storage_path').eq('owner_id', state.userId); check(docs.error);
  for (const doc of docs.data ?? []) {
    assert.ok(doc.storage_path.startsWith(`${state.userId}/`));
    check((await admin.storage.from('crew-documents').remove([doc.storage_path])).error);
  }
  check((await admin.from('crew_documents').delete().eq('owner_id', state.userId)).error);
  check((await admin.from('crew_members').delete().eq('owner_id', state.userId)).error);
  check((await admin.from('org_members').delete().eq('org_id', state.orgId).eq('user_id', state.userId)).error);
  check((await admin.auth.admin.deleteUser(state.userId)).error);
  check((await admin.from('organizations').delete().eq('id', state.orgId)).error);
  if (existsSync(join(state.directory, 'planta-qa.pdf'))) unlinkSync(join(state.directory, 'planta-qa.pdf'));
  unlinkSync(file);
  console.log('Fixture removida: somente tenant, conta, obra e arquivos sintéticos deste teste.');
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
