/** Somente leitura. Nunca execute os testes de homologação contra produção. */
import assert from 'node:assert/strict';
import { loadEnvConfig } from '@next/env';
import { createClient } from '@supabase/supabase-js';
import { getWorkProgressData } from '../src/services/works/getWorkProgressData';
import { executionPhotoPath, listExecutionPhotos } from '../src/services/works/workExecutionPhotos';

async function main() {
  loadEnvConfig(process.cwd(), true);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  assert.equal(new URL(url).hostname, 'cvumyonqcazhnwxpclms.supabase.co',
    'Teste recusado: o destino não é o projeto de desenvolvimento autorizado.');
  const options = { auth: { persistSession: false, autoRefreshToken: false } };
  const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, options);
  const anon = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, options);
  const { data: works, error } = await admin.from('works').select('id,budget_id,status');
  if (error) throw new Error(error.message);
  assert.ok(works?.length, 'Sem obras: resultado inconclusivo.');

  let polesChecked = 0;
  for (const work of works) {
    const progress = await getWorkProgressData(admin, work.id);
    const installations = await admin.from('work_pole_installations')
      .select('id,status').eq('work_id', work.id);
    if (installations.error) throw new Error(installations.error.message);
    const installed = installations.data.filter((row) => row.status === 'installed').length;
    assert.equal(progress.postsInstalled, installed, 'Contagem de postes divergente.');
    polesChecked += installed;
  }
  console.log(`PASS: progresso de ${works.length} obras; ${polesChecked} instalações conferidas.`);

  let photosChecked = 0;
  for (const work of works) {
    for (const kind of ['pole', 'equipment'] as const) {
      const page = await listExecutionPhotos(admin, work.id, kind, 0);
      for (const photo of page.photos) {
        assert.ok(await executionPhotoPath(admin, work.id, photo.id));
        const otherWork: { id: string } | undefined = works.find((other) => other.id !== work.id);
        if (otherWork) assert.equal(await executionPhotoPath(admin, otherWork.id, photo.id), null);
        photosChecked++;
      }
    }
  }
  console.log(`PASS: ${photosChecked} fotos verificadas; seleção rejeita foto de outra obra.`);

  // A chave pública não deve abrir os registros operacionais da equipe.
  for (const table of ['works', 'work_members', 'work_milestones',
    'work_pole_installations', 'work_daily_logs']) {
    const result = await anon.from(table).select(table === 'work_members' ? 'work_id' : 'id').limit(1);
    if (result.error && result.error.code !== '42501') {
      throw new Error(`Verificação inconclusiva de ${table}: ${result.error.message}`);
    }
    assert.equal(result.data?.length ?? 0, 0, `EXPOSIÇÃO ANÔNIMA: ${table}`);
    console.log(`PASS: leitura anônima bloqueada em ${table}.`);
  }

  const buckets = await admin.storage.listBuckets();
  if (buckets.error) throw new Error(buckets.error.message);
  const operational = buckets.data.find((bucket) => bucket.id === 'andamento-obra');
  assert.ok(operational, 'Bucket operacional não encontrado.');
  assert.equal(operational.public, false, 'Mídia operacional não deve ser pública.');
  console.log('PASS: bucket operacional privado.');
  console.log('LIMITAÇÃO: não verifica escrita, gatilhos SQL nem isolamento entre usuários autenticados.');
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Falha inesperada.');
  process.exitCode = 1;
});
