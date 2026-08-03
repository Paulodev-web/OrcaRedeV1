// Copia os arquivos reais do Storage (prod -> dev novo) depois de um pg_dump/pg_restore.
//
// Contexto: o restore via pg_dump/pg_restore (docs/known-debt.md DEBT-014) traz só os
// METADADOS de storage.objects (nome, bucket, tamanho), não o conteúdo binário dos
// arquivos, que vive numa camada separada de blob storage. Este script baixa cada
// objeto do projeto de origem (via service role, funciona em bucket privado também) e
// sobe no mesmo path no projeto de destino.
//
// Depois de copiar o bucket `plans`, também normaliza `budgets.plan_image_url` que
// aponta para o host de origem, reescrevendo para o host de destino — os outros dois
// buckets (`fornecedores_pdfs`, `andamento-obra`) usam paths relativos + signed URL
// geradas na hora (ver src/services/works/*SignedUrl*.ts), então não precisam de
// reescrita de URL no banco.
//
// Uso:
//   node scripts/migrate-storage-to-dev.mjs                  # dry-run (padrão)
//   node scripts/migrate-storage-to-dev.mjs --bucket=plans    # só um bucket
//   node scripts/migrate-storage-to-dev.mjs --apply           # grava (pede confirmação)
//   node scripts/migrate-storage-to-dev.mjs --apply --overwrite
//   node scripts/migrate-storage-to-dev.mjs --report=out.jsonl
//
// Flags:
//   --apply        executa de verdade. Sem ela, nada é escrito.
//   --bucket=NOME  restringe a um bucket (plans | fornecedores_pdfs | andamento-obra).
//   --overwrite    sobrescreve objeto já existente no destino (padrão: preserva).
//   --report=PATH  grava o log estruturado (JSONL) também em arquivo.
//
// Credenciais:
//   Origem (prod): lidas de .env.local (NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY).
//   Destino (dev): lidas de .env.dev-migration (DEV_SUPABASE_URL, DEV_SERVICE_ROLE_KEY),
//                  arquivo local, nunca commitado (coberto por `.env*` no .gitignore).
//
// Idempotente: reexecutar pula objetos já presentes no destino (a menos que --overwrite).

import { readFileSync, existsSync, appendFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { createClient } from '@supabase/supabase-js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

function loadEnvFile(path) {
  if (!existsSync(path)) return;
  const content = readFileSync(path, 'utf-8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

loadEnvFile(join(ROOT, '.env.local'));
loadEnvFile(join(ROOT, '.env.dev-migration'));

const SOURCE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SOURCE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const TARGET_URL = process.env.DEV_SUPABASE_URL;
const TARGET_SERVICE_ROLE_KEY = process.env.DEV_SERVICE_ROLE_KEY;

if (!SOURCE_URL || !SOURCE_SERVICE_ROLE_KEY) {
  console.error('Faltam credenciais de ORIGEM: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY em .env.local.');
  process.exit(1);
}
if (!TARGET_URL || !TARGET_SERVICE_ROLE_KEY) {
  console.error('Faltam credenciais de DESTINO: DEV_SUPABASE_URL / DEV_SERVICE_ROLE_KEY em .env.dev-migration.');
  process.exit(1);
}

// Nunca escreve neste host, mesmo que alguém aponte DEV_SUPABASE_URL errado por engano.
const PROTECTED_HOSTS = [new URL(SOURCE_URL).hostname];

const BUCKETS = ['plans', 'fornecedores_pdfs', 'andamento-obra'];
const PLANS_PUBLIC_URL_PATTERN = /\/storage\/v1\/object\/public\/plans\/(.+)$/;
const MAX_BYTES = 50 * 1024 * 1024;

const args = process.argv.slice(2);
const hasFlag = (name) => args.includes(`--${name}`);
const flagValue = (name) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
};

const APPLY = hasFlag('apply');
const OVERWRITE = hasFlag('overwrite');
const REPORT_PATH = flagValue('report');
const ONLY_BUCKET = flagValue('bucket');

const sourceHost = new URL(SOURCE_URL).hostname;
const targetHost = new URL(TARGET_URL).hostname;

function logRecord(entry) {
  const line = JSON.stringify(entry);
  console.log(line);
  if (REPORT_PATH) {
    try {
      appendFileSync(REPORT_PATH, `${line}\n`, 'utf-8');
    } catch (e) {
      console.error(`[report] falha ao gravar em ${REPORT_PATH}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
}

async function confirmOrExit(pending) {
  const projectRef = targetHost.split('.')[0];
  console.error(
    `\n=== CONFIRMAÇÃO NECESSÁRIA ===\n` +
    `Origem      : ${SOURCE_URL}\n` +
    `Destino     : ${TARGET_URL}\n` +
    `Buckets     : ${ONLY_BUCKET ?? BUCKETS.join(', ')}\n` +
    `Objetos     : ${pending}\n` +
    `Sobrescrever: ${OVERWRITE ? 'SIM (objetos existentes serão substituídos)' : 'não'}\n`,
  );

  if (hasFlag('yes')) {
    console.error(`--yes: pulando prompt interativo (destino confirmado = ${projectRef}).\n`);
    return;
  }

  if (!stdin.isTTY) {
    console.error(
      '\n--apply exige confirmação interativa (ou --yes) e o stdin não é um terminal.\n' +
      'Rode o script direto no terminal, ou use --yes se já confirmou o destino por outro meio.',
    );
    process.exit(1);
  }

  const rl = createInterface({ input: stdin, output: stdout });
  const answer = await rl.question(`Digite o ref do projeto de DESTINO (${projectRef}) para confirmar: `);
  rl.close();

  if (answer.trim() !== projectRef) {
    console.error('Confirmação não confere. Abortado — nada foi escrito.');
    process.exit(1);
  }
}

/** Lista todos os objetos de um bucket recursivamente via storage.list().
 * Uma entrada sem `id` é uma "pasta" (prefixo) e precisa ser percorrida. */
async function listAllObjects(supabase, bucket, prefix = '') {
  const pageSize = 1000;
  const all = [];
  let offset = 0;
  for (;;) {
    const { data, error } = await supabase.storage
      .from(bucket)
      .list(prefix, { limit: pageSize, offset, sortBy: { column: 'name', order: 'asc' } });
    if (error) throw new Error(`listAllObjects(${bucket}/${prefix}): ${error.message}`);
    if (!data || data.length === 0) break;

    for (const entry of data) {
      const fullPath = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.id) {
        all.push({ name: fullPath, metadata: entry.metadata });
      } else {
        const nested = await listAllObjects(supabase, bucket, fullPath);
        all.push(...nested);
      }
    }

    if (data.length < pageSize) break;
    offset += pageSize;
  }
  return all;
}

async function migrateBucket(source, target, bucket, summary) {
  console.error(`\n--- Bucket: ${bucket} ---`);

  const objects = await listAllObjects(source, bucket);
  console.error(`${objects.length} objeto(s) na origem.`);

  const existing = APPLY && !OVERWRITE ? new Set((await listAllObjects(target, bucket)).map((o) => o.name)) : new Set();

  for (const [index, obj] of objects.entries()) {
    const position = `${index + 1}/${objects.length}`;
    const path = obj.name;
    const contentType = obj.metadata?.mimetype ?? 'application/octet-stream';
    const base = { position, bucket, path };

    if (!APPLY) {
      summary.dryRun += 1;
      logRecord({ ...base, status: 'dry-run', contentType });
      continue;
    }

    if (!OVERWRITE && existing.has(path)) {
      summary.skipped += 1;
      logRecord({ ...base, status: 'skipped', reason: 'já existe no destino' });
      continue;
    }

    const { data: blob, error: downloadError } = await source.storage.from(bucket).download(path);
    if (downloadError) {
      summary.failed += 1;
      logRecord({ ...base, status: 'failed', stage: 'download', error: downloadError.message });
      continue;
    }

    const bytes = new Uint8Array(await blob.arrayBuffer());
    if (bytes.length === 0) {
      summary.failed += 1;
      logRecord({ ...base, status: 'failed', stage: 'download', error: 'arquivo vazio' });
      continue;
    }
    if (bytes.length > MAX_BYTES) {
      summary.failed += 1;
      logRecord({ ...base, status: 'failed', stage: 'download', bytes: bytes.length, error: `excede ${MAX_BYTES} bytes` });
      continue;
    }

    const { error: uploadError } = await target.storage
      .from(bucket)
      .upload(path, bytes, { contentType: blob.type || contentType, upsert: OVERWRITE });

    if (uploadError) {
      const alreadyExists =
        uploadError.message?.toLowerCase().includes('already exists') || String(uploadError.statusCode ?? '') === '409';
      if (alreadyExists && !OVERWRITE) {
        summary.skipped += 1;
        logRecord({ ...base, status: 'skipped', reason: 'já existia no destino (upload 409)' });
        continue;
      }
      summary.failed += 1;
      logRecord({ ...base, status: 'failed', stage: 'upload', bytes: bytes.length, error: uploadError.message });
      continue;
    }

    summary.ok += 1;
    logRecord({ ...base, status: 'ok', bytes: bytes.length, contentType: blob.type || contentType });
  }
}

/** Normaliza budgets.plan_image_url que ainda aponta pro host de origem. */
async function normalizePlanImageUrls(target, summary) {
  console.error(`\n--- Normalizando budgets.plan_image_url (${sourceHost} -> ${targetHost}) ---`);

  const { data: rows, error } = await target
    .from('budgets')
    .select('id, plan_image_url')
    .not('plan_image_url', 'is', null);

  if (error) {
    console.error(`Falha ao ler budgets no destino: ${error.message}`);
    return;
  }

  const toFix = (rows ?? []).filter((r) => {
    try {
      return new URL(r.plan_image_url).hostname === sourceHost;
    } catch {
      return false;
    }
  });

  console.error(`${toFix.length} orçamento(s) com plan_image_url apontando para a origem.`);

  for (const row of toFix) {
    const match = row.plan_image_url.match(PLANS_PUBLIC_URL_PATTERN);
    if (!match) {
      logRecord({ stage: 'url-fix', budgetId: row.id, status: 'skipped', reason: 'URL fora do padrão /plans/<path>' });
      continue;
    }
    const path = decodeURIComponent(match[1]);
    const { data: publicUrlData } = target.storage.from('plans').getPublicUrl(path);
    const newUrl = publicUrlData.publicUrl;

    if (!APPLY) {
      summary.dryRun += 1;
      logRecord({ stage: 'url-fix', budgetId: row.id, status: 'dry-run', from: row.plan_image_url, to: newUrl });
      continue;
    }

    const { error: updateError } = await target.from('budgets').update({ plan_image_url: newUrl }).eq('id', row.id);
    if (updateError) {
      summary.failed += 1;
      logRecord({ stage: 'url-fix', budgetId: row.id, status: 'failed', error: updateError.message });
      continue;
    }
    summary.ok += 1;
    logRecord({ stage: 'url-fix', budgetId: row.id, status: 'ok', from: row.plan_image_url, to: newUrl });
  }
}

async function main() {
  if (APPLY && PROTECTED_HOSTS.includes(targetHost)) {
    console.error(`Recusado: destino (${targetHost}) é o mesmo host de origem/produção. Confira DEV_SUPABASE_URL.`);
    process.exit(1);
  }

  const source = createClient(SOURCE_URL, SOURCE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const target = createClient(TARGET_URL, TARGET_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

  console.error(`Origem : ${SOURCE_URL}`);
  console.error(`Destino: ${TARGET_URL}`);
  console.error(`Modo   : ${APPLY ? 'APPLY (escreve)' : 'DRY-RUN (não escreve nada)'}`);

  const bucketsToRun = ONLY_BUCKET ? [ONLY_BUCKET] : BUCKETS;
  for (const b of bucketsToRun) {
    if (!BUCKETS.includes(b)) {
      console.error(`Bucket desconhecido: ${b}. Válidos: ${BUCKETS.join(', ')}`);
      process.exit(1);
    }
  }

  if (APPLY) {
    // Estimativa rápida de quantos objetos serão processados, para a confirmação.
    let totalEstimate = 0;
    for (const b of bucketsToRun) {
      totalEstimate += (await listAllObjects(source, b)).length;
    }
    await confirmOrExit(totalEstimate);
  }

  const summary = { ok: 0, skipped: 0, failed: 0, dryRun: 0 };

  for (const bucket of bucketsToRun) {
    await migrateBucket(source, target, bucket, summary);
  }

  if (!ONLY_BUCKET || ONLY_BUCKET === 'plans') {
    await normalizePlanImageUrls(target, summary);
  }

  console.error(
    `\nResumo: ok=${summary.ok} dry-run=${summary.dryRun} pulados=${summary.skipped} falhas=${summary.failed}`,
  );
  if (!APPLY) {
    console.error('Dry-run: nenhum arquivo foi enviado e nenhuma linha foi alterada. Use --apply para executar.');
  }
  if (summary.failed > 0) {
    console.error('Houve falhas. O script é idempotente — corrija a causa e rode de novo.');
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.stack ?? e.message : String(e));
  process.exit(1);
});
