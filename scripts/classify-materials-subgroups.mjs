// Backfill: classifica por IA (Gemini) os materiais existentes sem subgrupo definido.
// Mantenha o prompt/schema em sync com src/services/ai/materialSubgroupClassifier.ts.
//
// Uso:
//   node scripts/classify-materials-subgroups.mjs
//
// Lê GEMINI_API_KEY, SUPABASE_SERVICE_ROLE_KEY e NEXT_PUBLIC_SUPABASE_URL de .env.local
// (ou do ambiente, se já exportadas). Idempotente: só toca materiais com subgroup IS NULL,
// então pode ser reexecutado com segurança em caso de falha parcial.

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';

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
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !GEMINI_API_KEY) {
  console.error('Faltam variáveis de ambiente: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GEMINI_API_KEY.');
  process.exit(1);
}

const BATCH_SIZE = Number.parseInt(process.env.MATERIAL_SUBGROUP_BATCH_SIZE ?? '30', 10);
const CONFIDENCE_THRESHOLD = Number.parseInt(process.env.MATERIAL_SUBGROUP_CONFIDENCE_THRESHOLD ?? '70', 10);
const GEMINI_MODEL = process.env.MATERIAL_SUBGROUP_GEMINI_MODEL ?? 'gemini-2.5-flash';
const BATCH_DELAY_MS = Number.parseInt(process.env.MATERIAL_SUBGROUP_BATCH_DELAY_MS ?? '4000', 10);
const RATE_LIMIT_RETRY_DELAY_MS = 45000;
const UPDATE_CONCURRENCY = 10;

const MATERIAL_SUBGROUPS = [
  'POSTE',
  'AMARRAÇÃO',
  'PRÉ FORMADO',
  'CIVIL',
  'FERRAGEM',
  'POLIMÉRICO',
  'ILUMINAÇÃO',
  'CONDUTOR',
  'ATERRAMENTO',
  'PROTEÇÃO',
  'CONEXÃO',
  'CABO DE AÇO',
  'CRUZETA',
  'ISOLAÇÃO',
  'OUTROS',
];

const SYSTEM_PROMPT = `Você é um engenheiro eletricista especialista em materiais de redes de distribuição de energia elétrica (postes, cabos, ferragens, isoladores). Sua tarefa é classificar cada material do catálogo em exatamente um dos subgrupos abaixo, com base no código, nome/descrição e unidade.

Subgrupos disponíveis e seus critérios:
- POSTE: postes de concreto, madeira, fibra ou aço, e acessórios exclusivos de poste (ex: sapata de poste).
- AMARRAÇÃO: arames de amarração, fitas/cintas de amarração de cabo em isolador ou cruzeta.
- PRÉ FORMADO: conjuntos pré-formados de ancoragem, suspensão ou derivação para cabos (alça pré-formada, distanciador pré-formado).
- CIVIL: materiais de obra civil - concreto, cimento, brita, areia, tubos de PVC/concreto, blocos, guias, calçada.
- FERRAGEM: ferragens genéricas de fixação e sustentação - parafusos, porcas, arruelas, cantoneiras, suportes metálicos, mão-francesa, olhal, sextavado. Use FERRAGEM quando não houver categoria mais específica.
- POLIMÉRICO: isoladores e espaçadores POLIMÉRICOS (material polimérico/resina), inclusive itens de rede compacta protegida.
- ILUMINAÇÃO: luminárias, lâmpadas, relés fotoelétricos, braços e projetores de iluminação pública.
- CONDUTOR: cabos e fios condutores de energia - CA, CAA, cobre nu, multiplexado, XLPE, coberto.
- ATERRAMENTO: hastes de aterramento, conectores de aterramento, cabo de cobre nu para malha de terra, caixa de inspeção de aterramento.
- PROTEÇÃO: equipamentos de proteção elétrica - para-raios, chave fusível, elo fusível, disjuntor, religador.
- CONEXÃO: conectores e terminais de emenda ou derivação de cabo (conector cunha, terminal, luva de emenda, conector perfurante) - não confundir com CONDUTOR (o cabo em si) nem com ATERRAMENTO (conectores específicos de aterramento vão em ATERRAMENTO).
- CABO DE AÇO: cabo de aço mensageiro/sustentação (não é o condutor de energia).
- CRUZETA: cruzetas de madeira, concreto ou polimérica.
- ISOLAÇÃO: isoladores de porcelana ou vidro (isoladores poliméricos vão em POLIMÉRICO, não aqui).
- OUTROS: use apenas quando o material claramente não se encaixa em nenhum subgrupo acima.

Regras:
- Escolha exatamente um subgrupo por material da lista fornecida.
- Atribua confidence de 0 a 100 (inteiro) refletindo a certeza da classificação.
- Se houver dúvida entre dois subgrupos, escolha o mais específico e reduza o confidence.
- Nunca invente um subgrupo fora da lista fornecida.
- Classifique TODOS os materiais recebidos, um resultado por id.`;

function buildPrompt(materials) {
  const bloco = materials
    .map(
      (m) =>
        `- id: ${m.id} | código: ${m.code ?? ''} | "${m.name}"${m.description ? ` | descrição: "${m.description}"` : ''} | unidade: ${m.unit ?? ''}`
    )
    .join('\n');
  return `${SYSTEM_PROMPT}\n\n---\n\n## Materiais a classificar:\n${bloco}`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const model = genAI.getGenerativeModel({
  model: GEMINI_MODEL,
  generationConfig: {
    responseMimeType: 'application/json',
    responseSchema: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          id: { type: SchemaType.STRING },
          subgroup: { type: SchemaType.STRING, format: 'enum', enum: MATERIAL_SUBGROUPS },
          confidence: { type: SchemaType.INTEGER },
        },
        required: ['id', 'subgroup', 'confidence'],
      },
    },
    temperature: 0.1,
  },
});

async function classifyBatch(materials, attempt = 0) {
  const prompt = buildPrompt(materials);
  try {
    const result = await model.generateContent(prompt);
    const text = result.response.text();
    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed)) return [];

    const validIds = new Set(materials.map((m) => m.id));
    const subgroupSet = new Set(MATERIAL_SUBGROUPS);
    const seen = new Set();
    const out = [];
    for (const entry of parsed) {
      if (typeof entry !== 'object' || entry === null) continue;
      const id = String(entry.id ?? '');
      const subgroup = String(entry.subgroup ?? '');
      const confidence = Math.round(Number(entry.confidence));
      if (!id || !validIds.has(id) || seen.has(id)) continue;
      if (!subgroupSet.has(subgroup)) continue;
      if (!Number.isFinite(confidence) || confidence < 0 || confidence > 100) continue;
      seen.add(id);
      out.push({ id, subgroup, confidence });
    }
    return out;
  } catch (err) {
    const isRateLimit = /429|Too Many Requests|quota/i.test(err.message ?? '');
    const maxAttempts = isRateLimit ? 3 : 1;
    if (attempt < maxAttempts) {
      const delay = isRateLimit ? RATE_LIMIT_RETRY_DELAY_MS : 1000;
      console.warn(`  [aviso] lote falhou (${isRateLimit ? 'rate limit' : err.message}), aguardando ${Math.round(delay / 1000)}s e tentando novamente...`);
      await sleep(delay);
      return classifyBatch(materials, attempt + 1);
    }
    console.warn(`  [erro] lote falhou definitivamente (${err.message}); ficará pendente para revisão manual.`);
    return [];
  }
}

async function fetchUnclassifiedMaterials() {
  const all = [];
  const pageSize = 1000;
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from('materials')
      .select('id, code, name, description, unit')
      .is('subgroup', null)
      .order('created_at', { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) throw new Error(`Falha ao buscar materiais: ${error.message}`);
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return all;
}

function chunk(items, size) {
  const chunks = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

async function applyUpdates(updates) {
  const groups = chunk(updates, UPDATE_CONCURRENCY);
  for (const group of groups) {
    await Promise.all(
      group.map((u) => supabase.from('materials').update({ subgroup: u.subgroup }).eq('id', u.id))
    );
  }
}

async function main() {
  console.log(`Classificação de subgrupos de materiais — modelo: ${GEMINI_MODEL}, limiar de confiança: ${CONFIDENCE_THRESHOLD}\n`);

  const materials = await fetchUnclassifiedMaterials();
  console.log(`Materiais sem subgrupo: ${materials.length}\n`);

  if (materials.length === 0) {
    console.log('Nada a fazer — todos os materiais já têm subgrupo.');
    return;
  }

  const batches = chunk(materials, BATCH_SIZE);
  const perSubgroupCount = {};
  let classified = 0;
  let lowConfidence = 0;

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    const results = await classifyBatch(batch);

    const accepted = results.filter((r) => r.confidence >= CONFIDENCE_THRESHOLD);

    if (accepted.length > 0) {
      await applyUpdates(accepted);
      classified += accepted.length;
      for (const r of accepted) {
        perSubgroupCount[r.subgroup] = (perSubgroupCount[r.subgroup] ?? 0) + 1;
      }
    }

    const notClassifiedThisBatch = batch.length - accepted.length;
    lowConfidence += notClassifiedThisBatch;

    console.log(
      `Lote ${i + 1}/${batches.length}: ${accepted.length}/${batch.length} classificados (processado: ${(i + 1) * BATCH_SIZE > materials.length ? materials.length : (i + 1) * BATCH_SIZE}/${materials.length})`
    );

    if (i < batches.length - 1) {
      await sleep(BATCH_DELAY_MS);
    }
  }

  console.log('\n=== Resumo ===');
  console.log(`Total processado: ${materials.length}`);
  console.log(`Classificados: ${classified}`);
  console.log(`Sem classificação (baixa confiança / falha) — ficaram null para revisão manual: ${lowConfidence}`);
  console.log('\nPor subgrupo:');
  for (const sg of MATERIAL_SUBGROUPS) {
    if (perSubgroupCount[sg]) {
      console.log(`  ${sg}: ${perSubgroupCount[sg]}`);
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Falha no script:', err);
    process.exit(1);
  });
