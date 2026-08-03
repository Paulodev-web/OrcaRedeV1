// [DEBT-014] Backfill das plantas (bucket `plans`) para o Storage do projeto atual.
//
// Contexto (docs/known-debt.md):
//   42 de 45 orcamentos no banco dev tem `budgets.plan_image_url` com host absoluto
//   apontando para o Supabase de PRODUCAO do cliente, porque o dump do prod foi
//   restaurado no dev sem migrar os arquivos do bucket `plans`. O bucket `plans` do
//   dev esta vazio, entao qualquer teste da esteira com planta real falha.
//
// O que o script faz, por registro:
//   1. le `budgets` com `plan_image_url` apontando para host DIFERENTE do projeto atual
//   2. extrai o path do Storage da URL (mesmo regex de src/lib/storage/publicUrl.ts)
//   3. faz fetch HTTP publico do arquivo no host de origem (whitelist obrigatoria)
//   4. sobe no bucket `plans` do projeto atual, PRESERVANDO o mesmo path
//   5. atualiza `plan_image_url` para a URL publica do projeto atual
//
// Preservar o path significa que so o host muda. Isso mantem a URL no formato que
// `parseSupabaseStoragePublicUrl` ja entende e faz orcamentos duplicados que
// compartilham o mesmo arquivo convergirem para o mesmo objeto.
//
// Uso:
//   node scripts/backfill-plans-to-dev.mjs                  # dry-run (padrao)
//   node scripts/backfill-plans-to-dev.mjs --limit=3        # dry-run de 3 registros
//   node scripts/backfill-plans-to-dev.mjs --apply          # grava (pede confirmacao)
//   node scripts/backfill-plans-to-dev.mjs --apply --overwrite
//   node scripts/backfill-plans-to-dev.mjs --report=out.jsonl
//
// Flags:
//   --apply        executa de verdade. Sem ela, NADA e escrito (nem Storage nem banco).
//   --limit=N      processa no maximo N registros.
//   --overwrite    sobrescreve objeto ja existente no bucket destino (padrao: preserva).
//   --report=PATH  grava o log estruturado (JSONL, 1 objeto por registro) tambem em arquivo.
//
// Le NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY de .env.local (ou do ambiente).
// Idempotente: registros ja normalizados para o host local sao ignorados, entao pode ser
// reexecutado com seguranca depois de uma falha parcial.
//
// ATENCAO: script one-shot de ambiente de desenvolvimento. Ele se recusa a rodar com
// --apply se o destino for o Supabase de producao do cliente (ver PROTECTED_HOSTS).

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

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Faltam variaveis de ambiente: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

// Hosts de onde o script aceita baixar. Mesmo conjunto usado no fallback HTTP de
// createWorkFromBudget (ALLOWED_PDF_HOSTS em src/actions/works.ts). Um host fora
// desta lista nunca e buscado: o registro e apenas logado como bloqueado.
const ALLOWED_SOURCE_HOSTS = [
  'qnmydwumaqoanorgspop.supabase.co', // Supabase de producao do cliente (origem dos arquivos)
  'ubqyjbtjkzxlexbuxoum.supabase.co', // Supabase de desenvolvimento
];

// O script NUNCA escreve nestes hosts. Guarda contra apontar o .env.local para
// producao e reescrever plan_image_url de 45 orcamentos reais por engano.
const PROTECTED_HOSTS = ['qnmydwumaqoanorgspop.supabase.co'];

const BUCKET = 'plans';
const PLANS_PUBLIC_URL_PATTERN = /\/storage\/v1\/object\/public\/plans\/(.+)$/;
const FETCH_TIMEOUT_MS = 60_000;
const MAX_BYTES = 10 * 1024 * 1024; // limite do bucket `plans` (ver AppContext.createBucket)

const args = process.argv.slice(2);
const hasFlag = (name) => args.includes(`--${name}`);
const flagValue = (name) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
};

const APPLY = hasFlag('apply');
const OVERWRITE = hasFlag('overwrite');
const REPORT_PATH = flagValue('report');
const LIMIT = (() => {
  const raw = flagValue('limit');
  if (!raw) return null;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
})();

const targetHost = new URL(SUPABASE_URL).hostname;

/** Log estruturado: 1 objeto JSON por registro, em stdout e (opcional) em arquivo. */
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

function parsePlansPath(url) {
  if (!url || typeof url !== 'string') return null;
  const match = url.match(PLANS_PUBLIC_URL_PATTERN);
  if (!match || !match[1]) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
}

function hostOf(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46]; // %PDF

/**
 * Confere que o corpo baixado e mesmo um PDF ou uma imagem. Sem isso, uma pagina
 * de erro HTML do Storage (que pode vir com status 200 em alguns proxies) seria
 * gravada por cima da planta.
 */
function sniffContentType(bytes, headerContentType, path) {
  if (bytes.length >= 4 && PDF_MAGIC.every((b, i) => bytes[i] === b)) {
    return { ok: true, contentType: 'application/pdf', kind: 'pdf' };
  }
  if (bytes[0] === 0x89 && bytes[1] === 0x50) return { ok: true, contentType: 'image/png', kind: 'png' };
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return { ok: true, contentType: 'image/jpeg', kind: 'jpeg' };
  if (bytes[0] === 0x47 && bytes[1] === 0x49) return { ok: true, contentType: 'image/gif', kind: 'gif' };
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) {
    return { ok: true, contentType: 'image/webp', kind: 'webp' };
  }
  return {
    ok: false,
    contentType: headerContentType ?? 'application/octet-stream',
    kind: 'desconhecido',
    detail: `magic bytes nao reconhecidos (header content-type=${headerContentType ?? 'n/a'}, path=${path})`,
  };
}

async function confirmOrExit(pending) {
  if (!stdin.isTTY) {
    console.error(
      '\n--apply exige confirmacao interativa e o stdin nao e um terminal.\n' +
      'Rode o script direto no terminal (sem pipe / sem CI).',
    );
    process.exit(1);
  }

  const projectRef = targetHost.split('.')[0];
  console.error(
    `\n=== CONFIRMACAO NECESSARIA ===\n` +
    `Destino     : ${SUPABASE_URL}\n` +
    `Bucket      : ${BUCKET}\n` +
    `Registros   : ${pending} orcamento(s) terao o arquivo copiado e plan_image_url reescrito\n` +
    `Sobrescrever: ${OVERWRITE ? 'SIM (objetos existentes serao substituidos)' : 'nao'}\n`,
  );

  const rl = createInterface({ input: stdin, output: stdout });
  const answer = await rl.question(`Digite o ref do projeto de destino (${projectRef}) para confirmar: `);
  rl.close();

  if (answer.trim() !== projectRef) {
    console.error('Confirmacao nao confere. Abortado — nada foi escrito.');
    process.exit(1);
  }
}

async function main() {
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  if (APPLY && PROTECTED_HOSTS.includes(targetHost)) {
    console.error(
      `Recusado: ${targetHost} esta em PROTECTED_HOSTS (Supabase de producao).\n` +
      'Este script so escreve em ambiente de desenvolvimento. Confira o NEXT_PUBLIC_SUPABASE_URL do .env.local.',
    );
    process.exit(1);
  }

  console.error(`Destino: ${SUPABASE_URL} (host ${targetHost})`);
  console.error(`Modo: ${APPLY ? 'APPLY (escreve)' : 'DRY-RUN (nao escreve nada)'}\n`);

  const { data: buckets, error: bucketsError } = await supabase.storage.listBuckets();
  if (bucketsError) {
    console.error(`Falha ao listar buckets: ${bucketsError.message}`);
    process.exit(1);
  }
  if (!buckets?.some((b) => b.name === BUCKET)) {
    console.error(`Bucket "${BUCKET}" nao existe no projeto de destino. Crie antes de rodar (public, 10MB, image/* + application/pdf).`);
    process.exit(1);
  }

  const { data: rows, error } = await supabase
    .from('budgets')
    .select('id, project_name, plan_image_url')
    .not('plan_image_url', 'is', null)
    .order('created_at', { ascending: true });

  if (error) {
    console.error(`Falha ao ler budgets: ${error.message}`);
    process.exit(1);
  }

  // Só interessam os que apontam para host diferente do projeto atual.
  const candidates = (rows ?? []).filter((row) => {
    const host = hostOf(row.plan_image_url);
    return host !== null && host !== targetHost;
  });

  const selected = LIMIT ? candidates.slice(0, LIMIT) : candidates;

  console.error(
    `budgets com plan_image_url: ${rows?.length ?? 0} | ` +
    `apontando para host externo: ${candidates.length} | ` +
    `selecionados nesta execucao: ${selected.length}${LIMIT ? ` (--limit=${LIMIT})` : ''}\n`,
  );

  if (selected.length === 0) {
    console.error('Nada a fazer.');
    return;
  }

  if (APPLY) {
    await confirmOrExit(selected.length);
    console.error('');
  }

  const summary = { ok: 0, skipped: 0, failed: 0, blocked: 0, dryRun: 0 };

  for (const [index, row] of selected.entries()) {
    const position = `${index + 1}/${selected.length}`;
    const sourceUrl = row.plan_image_url;
    const sourceHost = hostOf(sourceUrl);
    const base = {
      position,
      budgetId: row.id,
      projectName: row.project_name ?? null,
      sourceHost,
      sourceUrl,
    };

    if (!sourceHost || !ALLOWED_SOURCE_HOSTS.includes(sourceHost)) {
      summary.blocked += 1;
      logRecord({ ...base, status: 'blocked', reason: 'host fora da whitelist' });
      continue;
    }

    const storagePath = parsePlansPath(sourceUrl);
    if (!storagePath) {
      summary.skipped += 1;
      logRecord({ ...base, status: 'skipped', reason: 'URL nao segue o padrao /storage/v1/object/public/plans/<path>' });
      continue;
    }

    const { data: publicUrlData } = supabase.storage.from(BUCKET).getPublicUrl(storagePath);
    const targetUrl = publicUrlData.publicUrl;

    if (!APPLY) {
      summary.dryRun += 1;
      logRecord({ ...base, status: 'dry-run', storagePath, targetUrl, wouldUpload: true, wouldUpdateRow: true });
      continue;
    }

    // 1. download
    let bytes;
    let headerContentType = null;
    try {
      const response = await fetch(sourceUrl, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
      if (!response.ok) {
        summary.failed += 1;
        logRecord({ ...base, status: 'failed', stage: 'download', storagePath, httpStatus: response.status });
        continue;
      }
      headerContentType = response.headers.get('content-type');
      bytes = new Uint8Array(await response.arrayBuffer());
    } catch (e) {
      summary.failed += 1;
      logRecord({
        ...base,
        status: 'failed',
        stage: 'download',
        storagePath,
        error: e instanceof Error ? e.message : String(e),
      });
      continue;
    }

    if (bytes.length === 0) {
      summary.failed += 1;
      logRecord({ ...base, status: 'failed', stage: 'download', storagePath, error: 'arquivo vazio' });
      continue;
    }
    if (bytes.length > MAX_BYTES) {
      summary.failed += 1;
      logRecord({
        ...base,
        status: 'failed',
        stage: 'download',
        storagePath,
        bytes: bytes.length,
        error: `excede o limite de ${MAX_BYTES} bytes do bucket`,
      });
      continue;
    }

    const sniff = sniffContentType(bytes, headerContentType, storagePath);
    if (!sniff.ok) {
      summary.failed += 1;
      logRecord({
        ...base,
        status: 'failed',
        stage: 'validate',
        storagePath,
        bytes: bytes.length,
        error: sniff.detail,
      });
      continue;
    }

    // 2. upload
    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(storagePath, bytes, { contentType: sniff.contentType, upsert: OVERWRITE });

    let uploadOutcome = 'uploaded';
    if (uploadError) {
      const alreadyExists =
        uploadError.message?.toLowerCase().includes('already exists') ||
        String(uploadError.statusCode ?? '') === '409';
      if (alreadyExists && !OVERWRITE) {
        // Objeto ja estava la (execucao anterior interrompida). Segue para normalizar a URL.
        uploadOutcome = 'already-present';
      } else {
        summary.failed += 1;
        logRecord({
          ...base,
          status: 'failed',
          stage: 'upload',
          storagePath,
          bytes: bytes.length,
          contentType: sniff.contentType,
          error: uploadError.message,
        });
        continue;
      }
    }

    // 3. update da linha
    const { error: updateError } = await supabase
      .from('budgets')
      .update({ plan_image_url: targetUrl })
      .eq('id', row.id);

    if (updateError) {
      summary.failed += 1;
      logRecord({
        ...base,
        status: 'failed',
        stage: 'update',
        storagePath,
        targetUrl,
        upload: uploadOutcome,
        error: updateError.message,
      });
      continue;
    }

    summary.ok += 1;
    logRecord({
      ...base,
      status: 'ok',
      storagePath,
      targetUrl,
      upload: uploadOutcome,
      bytes: bytes.length,
      contentType: sniff.contentType,
      kind: sniff.kind,
    });
  }

  console.error(
    `\nResumo: ok=${summary.ok} dry-run=${summary.dryRun} pulados=${summary.skipped} ` +
    `bloqueados=${summary.blocked} falhas=${summary.failed}`,
  );
  if (!APPLY) {
    console.error('Dry-run: nenhum arquivo foi enviado e nenhuma linha foi alterada. Use --apply para executar.');
  }
  if (summary.failed > 0) {
    console.error('Houve falhas. O script e idempotente — corrija a causa e rode de novo.');
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.stack ?? e.message : String(e));
  process.exit(1);
});
