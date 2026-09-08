// Paridade do BOM consolidado: caminho antigo (embed + agregacao em JS) contra
// a RPC nova `budget_consolidated_materials`.
//
// Roda os dois para TODOS os orcamentos da base e compara material a material.
// Existe para autorizar a troca feita em
// src/services/supplies/budgetMaterialQuantities.ts sem depender de fe.
//
// Divergencia esperada e aceita: `unit_price` quando o mesmo material aparece
// com price_at_addition diferente em postes diferentes. No caminho antigo quem
// vencia dependia da ordem em que o PostgREST devolvia os niveis aninhados, que
// nao e deterministica. A RPC fixa a regra (menor counter, grupo antes de
// avulso). Quantidade nao pode divergir NUNCA.
//
// Uso:
//   node scripts/check-bom-parity.mjs
//   node scripts/check-bom-parity.mjs --limit=5

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

function loadEnvFile(path) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf-8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadEnvFile(join(ROOT, '.env.local'));

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Faltam NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

const limitArg = process.argv.find((a) => a.startsWith('--limit='));
const LIMIT = limitArg ? Number(limitArg.split('=')[1]) : Infinity;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// Mesmo select de BUDGET_POSTS_WITH_MATERIALS_SELECT, sem os campos que a
// consolidacao ignora.
const SELECT_ANTIGO = `
  id, counter,
  post_item_groups (
    id,
    post_item_group_materials (
      material_id, quantity, price_at_addition,
      materials ( id, code, name, unit, price )
    )
  ),
  post_materials (
    id, material_id, quantity, price_at_addition,
    materials ( id, code, name, unit, price )
  )
`;

/** Reproduz consolidateMaterialsFromBudgetDetails (src/services/budgetMaterialAggregation.ts). */
function consolidarComoOJs(posts) {
  const mapa = new Map();

  for (const post of posts) {
    for (const grupo of post.post_item_groups ?? []) {
      for (const material of grupo.post_item_group_materials ?? []) {
        const id = material.material_id;
        const dados = material.materials;
        if (mapa.has(id)) {
          mapa.get(id).quantidade += Number(material.quantity);
          continue;
        }
        mapa.set(id, {
          quantidade: Number(material.quantity),
          precoUnit: Number(material.price_at_addition) || Number(dados?.price) || 0,
        });
      }
    }
    for (const material of post.post_materials ?? []) {
      const id = material.material_id;
      if (mapa.has(id)) {
        mapa.get(id).quantidade += Number(material.quantity);
        continue;
      }
      mapa.set(id, {
        quantidade: Number(material.quantity),
        precoUnit: Number(material.price_at_addition) || 0,
      });
    }
  }

  return mapa;
}

const quase = (a, b) => Math.abs(Number(a) - Number(b)) < 0.000001;

async function main() {
  const { data: budgets, error } = await supabase
    .from('budgets')
    .select('id, project_name')
    .order('updated_at', { ascending: false });

  if (error) {
    console.error('Erro ao listar orcamentos:', error.message);
    process.exit(1);
  }

  const alvos = budgets.slice(0, LIMIT);
  console.log(`Comparando ${alvos.length} orcamento(s).\n`);

  let orcamentosOk = 0;
  let divergenciasQtd = 0;
  let divergenciasPreco = 0;
  let divergenciasPresenca = 0;

  for (const budget of alvos) {
    const [{ data: posts, error: erroPosts }, { data: rpc, error: erroRpc }] = await Promise.all([
      supabase.from('budget_posts').select(SELECT_ANTIGO).eq('budget_id', budget.id).order('counter', { ascending: true }).limit(2000),
      supabase.rpc('budget_consolidated_materials', { p_budget_id: budget.id }),
    ]);

    if (erroPosts || erroRpc) {
      console.log(`✗ ${budget.project_name}: erro (${erroPosts?.message ?? erroRpc?.message})`);
      continue;
    }

    const antigo = consolidarComoOJs(posts ?? []);
    const novo = new Map((rpc ?? []).map((r) => [r.material_id, r]));

    const problemas = [];

    for (const [id, velho] of antigo) {
      const atual = novo.get(id);
      if (!atual) {
        problemas.push(`  presenca: ${id} existe no antigo e sumiu na RPC`);
        divergenciasPresenca++;
        continue;
      }
      if (!quase(velho.quantidade, atual.required_qty)) {
        problemas.push(`  QUANTIDADE: ${id} antigo=${velho.quantidade} rpc=${atual.required_qty}`);
        divergenciasQtd++;
      }
      if (!quase(velho.precoUnit, atual.unit_price)) {
        problemas.push(`  preco: ${id} antigo=${velho.precoUnit} rpc=${atual.unit_price}`);
        divergenciasPreco++;
      }
    }

    for (const id of novo.keys()) {
      if (!antigo.has(id)) {
        problemas.push(`  presenca: ${id} apareceu so na RPC`);
        divergenciasPresenca++;
      }
    }

    if (problemas.length === 0) {
      orcamentosOk++;
      console.log(`✓ ${budget.project_name} (${antigo.size} materiais)`);
    } else {
      console.log(`! ${budget.project_name} (${antigo.size} materiais)`);
      for (const p of problemas.slice(0, 10)) console.log(p);
      if (problemas.length > 10) console.log(`  ...e mais ${problemas.length - 10}`);
    }
  }

  console.log('\n--- resumo ---');
  console.log(`orcamentos identicos:       ${orcamentosOk}/${alvos.length}`);
  console.log(`divergencias de presenca:   ${divergenciasPresenca}  (tem que ser 0)`);
  console.log(`divergencias de quantidade: ${divergenciasQtd}  (tem que ser 0)`);
  console.log(`divergencias de preco:      ${divergenciasPreco}  (esperadas, ver cabecalho)`);

  const bloqueia = divergenciasPresenca > 0 || divergenciasQtd > 0;
  process.exit(bloqueia ? 1 : 0);
}

main();
