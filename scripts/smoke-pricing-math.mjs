// Smoke test do motor calculateContributionMargin (réplica isolada para evitar bundler).
// Mantenha em sync com src/lib/pricingMath.ts ao alterar o motor.
function toSafeNumber(v) {
  return Number.isFinite(v) ? v : 0;
}

function clampPercent(v, { min, max }) {
  if (!Number.isFinite(v)) return 0;
  if (v < min) return min;
  if (v > max) return max;
  return v;
}

function calculateContributionMargin(receitaBruta, custos, impostoPercent) {
  const rb = Math.max(toSafeNumber(receitaBruta), 0);
  const ip = clampPercent(impostoPercent, { min: 0, max: 100 });
  const breakdown = custos.map((c) => {
    const valor = toSafeNumber(c.valor);
    return { ...c, valor, percentualReceita: rb > 0 ? (valor / rb) * 100 : 0 };
  });
  const totalCustos = breakdown.reduce((a, b) => a + b.valor, 0);
  const totalCustosPercent = rb > 0 ? (totalCustos / rb) * 100 : 0;
  const mc = rb - totalCustos;
  const mcPercent = rb > 0 ? (mc / rb) * 100 : 0;
  const impostoValor = mc * (ip / 100);
  const impostoSobreReceitaPercent = rb > 0 ? (impostoValor / rb) * 100 : 0;
  const lucroLiquido = mc - impostoValor;
  const lucroLiquidoPercent = rb > 0 ? (lucroLiquido / rb) * 100 : 0;
  return {
    receitaBruta: rb,
    totalCustos,
    totalCustosPercent,
    margemContribuicao: mc,
    margemContribuicaoPercent: mcPercent,
    impostoPercent: ip,
    impostoValor,
    impostoSobreReceitaPercent,
    lucroLiquido,
    lucroLiquidoPercent,
    custos: breakdown,
  };
}

function approxEq(a, b, eps = 1e-6) {
  return Math.abs(a - b) <= eps;
}

const cases = [
  {
    name: 'zero custos, sem imposto',
    rb: 1000,
    custos: [],
    imp: 0,
    expect: { mc: 1000, imposto: 0, lucro: 1000, mcPct: 100, lucroPct: 100 },
  },
  {
    name: 'zero custos, imposto 10% incide na MC',
    rb: 1000,
    custos: [],
    imp: 10,
    expect: { mc: 1000, imposto: 100, lucro: 900, mcPct: 100, lucroPct: 90 },
  },
  {
    name: 'custos > receita -> MC negativa, imposto sobre MC negativa',
    rb: 1000,
    custos: [{ id: 'a', descricao: 'Gasto', valor: 1500 }],
    imp: 0,
    expect: { mc: -500, imposto: 0, lucro: -500, mcPct: -50, lucroPct: -50 },
  },
  {
    name: 'imposto 100% zera o lucro',
    rb: 1000,
    custos: [{ id: 'a', descricao: 'X', valor: 200 }],
    imp: 100,
    expect: { mc: 800, imposto: 800, lucro: 0, mcPct: 80, lucroPct: 0 },
  },
  {
    name: 'caso real: 3 custos + 5% imposto',
    rb: 10000,
    custos: [
      { id: 'a', descricao: 'Mão de obra', valor: 3000 },
      { id: 'b', descricao: 'Diária', valor: 500 },
      { id: 'c', descricao: 'Alimentação', valor: 300 },
    ],
    imp: 5,
    expect: { mc: 6200, imposto: 310, lucro: 5890, mcPct: 62, lucroPct: 58.9 },
  },
  {
    name: 'RB zero -> percentuais devem ser 0 sem NaN',
    rb: 0,
    custos: [{ id: 'a', descricao: 'X', valor: 100 }],
    imp: 10,
    expect: { mc: -100, imposto: -10, lucro: -90, mcPct: 0, lucroPct: 0 },
  },
  {
    name: 'imposto fora da faixa (300) deve clampar para 100',
    rb: 1000,
    custos: [],
    imp: 300,
    expect: { mc: 1000, imposto: 1000, lucro: 0, mcPct: 100, lucroPct: 0 },
  },
  {
    name: 'imposto negativo deve clampar para 0',
    rb: 1000,
    custos: [],
    imp: -50,
    expect: { mc: 1000, imposto: 0, lucro: 1000, mcPct: 100, lucroPct: 100 },
  },
];

let pass = 0;
let fail = 0;

for (const c of cases) {
  const r = calculateContributionMargin(c.rb, c.custos, c.imp);
  const ok =
    approxEq(r.margemContribuicao, c.expect.mc) &&
    approxEq(r.impostoValor, c.expect.imposto) &&
    approxEq(r.lucroLiquido, c.expect.lucro) &&
    approxEq(r.margemContribuicaoPercent, c.expect.mcPct) &&
    approxEq(r.lucroLiquidoPercent, c.expect.lucroPct);

  const tag = ok ? 'PASS' : 'FAIL';
  if (ok) pass++;
  else fail++;

  console.log(`[${tag}] ${c.name}`);
  console.log(
    `       MC=${r.margemContribuicao} (${r.margemContribuicaoPercent.toFixed(2)}%) | imposto=${r.impostoValor} | lucro=${r.lucroLiquido} (${r.lucroLiquidoPercent.toFixed(2)}%)`
  );
  if (!ok) {
    console.log(`       expected: mc=${c.expect.mc} imposto=${c.expect.imposto} lucro=${c.expect.lucro}`);
  }
}

console.log(`\nResumo: ${pass} pass / ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
