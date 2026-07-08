// Smoke test do motor calculateServicePricing e derivações por percentual sobre materiais.
// Mantenha em sync com src/lib/pricingMath.ts e resolveCostItemValue em
// src/components/precificacao/types.ts ao alterar o motor.

function toSafeNumber(v) {
  return Number.isFinite(v) ? v : 0;
}

function clampPercent(v, { min, max }) {
  if (!Number.isFinite(v)) return 0;
  if (v < min) return min;
  if (v > max) return max;
  return v;
}

function resolveCostItemValue(item, ctx) {
  const safe = (value) => (Number.isFinite(value) && value > 0 ? value : 0);

  switch (item.tipo) {
    case 'maoDeObra':
      return safe(item.pessoas) * safe(item.dias) * safe(item.valorUnitario);
    case 'percentual': {
      const base =
        item.percentualBase === 'servico'
          ? safe(ctx.valorServico)
          : safe(ctx.valorServico) + safe(ctx.valorMateriais);
      return (safe(item.percentual) / 100) * base;
    }
    case 'unitario':
    default:
      return safe(item.unidade) * safe(item.valorUnitario);
  }
}

function calculateServicePricing(valorServico, custos, impostoPercent, valorMateriais) {
  const vs = Math.max(toSafeNumber(valorServico), 0);
  const ip = clampPercent(impostoPercent, { min: 0, max: 100 });
  const materiais = Math.max(toSafeNumber(valorMateriais), 0);

  const custosDetalhados = custos.map((c) => {
    const valor = resolveCostItemValue(c, { valorServico: vs, valorMateriais: materiais });
    return { ...c, valor, percentualDoVS: vs > 0 ? (valor / vs) * 100 : 0 };
  });

  const totalCustos = custosDetalhados.reduce((a, b) => a + b.valor, 0);
  const totalCustosPercent = vs > 0 ? (totalCustos / vs) * 100 : 0;

  const lucroBruto = vs - totalCustos;
  const lucroBrutoPercent = vs > 0 ? (lucroBruto / vs) * 100 : 0;

  const impostoValor = vs * (ip / 100);

  const lucroLiquido = lucroBruto - impostoValor;
  const lucroLiquidoPercent = vs > 0 ? (lucroLiquido / vs) * 100 : 0;

  const precoTotalCliente = materiais + vs;

  return {
    valorServico: vs,
    totalCustos,
    totalCustosPercent,
    custosDetalhados,
    lucroBruto,
    lucroBrutoPercent,
    impostoPercent: ip,
    impostoValor,
    lucroLiquido,
    lucroLiquidoPercent,
    valorMateriais: materiais,
    precoTotalCliente,
  };
}

function calcularValorServicoPorPercentual(valorMateriais, percentMateriais) {
  const materiais = Math.max(toSafeNumber(valorMateriais), 0);
  const percent = Math.max(toSafeNumber(percentMateriais), 0);
  return materiais * (percent / 100);
}

function calcularPercentualPorValorServico(valorServico, valorMateriais) {
  const vs = Math.max(toSafeNumber(valorServico), 0);
  const materiais = Math.max(toSafeNumber(valorMateriais), 0);
  if (materiais <= 0) return 0;
  return (vs / materiais) * 100;
}

function approxEq(a, b, eps = 1e-6) {
  return Math.abs(a - b) <= eps;
}

// Cenário de referência do novo modelo:
// materiais = 100k, percentual = 40% → VS = 40k, total ao cliente = 140k.
// Custos: mão de obra 3 pessoas × 4 dias × R$70 = 840; comissão 3% do total = 4.2k.

const unitario = (id, descricao, unidade, valorUnitario) => ({
  id, descricao, tipo: 'unitario', unidade, valorUnitario,
  pessoas: 0, dias: 0, percentual: 0, percentualBase: 'total', valor: 0,
});
const maoDeObra = (id, descricao, pessoas, dias, diaria) => ({
  id, descricao, tipo: 'maoDeObra', unidade: 0, valorUnitario: diaria,
  pessoas, dias, percentual: 0, percentualBase: 'total', valor: 0,
});
const percentual = (id, descricao, pct, base) => ({
  id, descricao, tipo: 'percentual', unidade: 0, valorUnitario: 0,
  pessoas: 0, dias: 0, percentual: pct, percentualBase: base, valor: 0,
});

const cases = [
  {
    name: 'materiais=100k, 40% → VS=40k, comissão 3% do total=4.2k, mão de obra 3×4×70=840',
    vs: calcularValorServicoPorPercentual(100000, 40),
    custos: [
      maoDeObra('a', 'Equipe', 3, 4, 70),
      percentual('b', 'Comissão vendedor', 3, 'total'),
    ],
    imp: 0,
    materiais: 100000,
    expect: {
      valorServico: 40000,
      totalCustos: 840 + 4200,
      lucroBruto: 40000 - 5040,
      impostoValor: 0,
      lucroLiquido: 40000 - 5040,
      precoTotalCliente: 140000,
    },
  },
  {
    name: 'percentual base=servico: 10% de VS=40k → 4k',
    vs: 40000,
    custos: [percentual('a', 'Taxa', 10, 'servico')],
    imp: 0,
    materiais: 100000,
    expect: {
      valorServico: 40000,
      totalCustos: 4000,
      lucroBruto: 36000,
      impostoValor: 0,
      lucroLiquido: 36000,
      precoTotalCliente: 140000,
    },
  },
  {
    name: 'unitario 10 × R$50 = 500 com imposto 13% sobre VS=40k',
    vs: 40000,
    custos: [unitario('a', 'Diárias', 10, 50)],
    imp: 13,
    materiais: 10000,
    expect: {
      valorServico: 40000,
      totalCustos: 500,
      lucroBruto: 39500,
      impostoValor: 5200,
      lucroLiquido: 34300,
      precoTotalCliente: 50000,
    },
  },
  {
    name: 'VS=0 → percentuais = 0, sem NaN (custo % do total só conta materiais)',
    vs: 0,
    custos: [unitario('a', 'X', 1, 100), percentual('b', 'Comissão', 3, 'total')],
    imp: 10,
    materiais: 5000,
    expect: {
      valorServico: 0,
      totalCustos: 100 + 150,
      lucroBruto: -250,
      impostoValor: 0,
      lucroLiquido: -250,
      precoTotalCliente: 5000,
    },
  },
  {
    name: 'custos > VS → lucro negativo',
    vs: 10000,
    custos: [maoDeObra('a', 'Equipe grande', 5, 10, 300)],
    imp: 0,
    materiais: 0,
    expect: {
      valorServico: 10000,
      totalCustos: 15000,
      lucroBruto: -5000,
      impostoValor: 0,
      lucroLiquido: -5000,
      precoTotalCliente: 10000,
    },
  },
  {
    name: 'imposto=100% sobre VS (não sobre lucro)',
    vs: 10000,
    custos: [unitario('a', 'Custo', 1, 3000)],
    imp: 100,
    materiais: 0,
    expect: {
      valorServico: 10000,
      totalCustos: 3000,
      lucroBruto: 7000,
      impostoValor: 10000,
      lucroLiquido: -3000,
      precoTotalCliente: 10000,
    },
  },
];

let pass = 0;
let fail = 0;

console.log('=== Testes de calculateServicePricing (novo modelo) ===\n');

for (const c of cases) {
  const r = calculateServicePricing(c.vs, c.custos, c.imp, c.materiais);
  const ok =
    approxEq(r.valorServico, c.expect.valorServico) &&
    approxEq(r.totalCustos, c.expect.totalCustos) &&
    approxEq(r.lucroBruto, c.expect.lucroBruto) &&
    approxEq(r.impostoValor, c.expect.impostoValor) &&
    approxEq(r.lucroLiquido, c.expect.lucroLiquido) &&
    approxEq(r.precoTotalCliente, c.expect.precoTotalCliente) &&
    Number.isFinite(r.lucroBrutoPercent) &&
    Number.isFinite(r.lucroLiquidoPercent);

  const tag = ok ? 'PASS' : 'FAIL';
  if (ok) pass++;
  else fail++;

  console.log(`[${tag}] ${c.name}`);
  console.log(
    `       VS=${r.valorServico} | Custos=${r.totalCustos} | LucroBruto=${r.lucroBruto} | Imposto=${r.impostoValor} | LucroLiq=${r.lucroLiquido} | Total=${r.precoTotalCliente}`
  );
  if (!ok) {
    console.log(`       expected: ${JSON.stringify(c.expect)}`);
  }
}

console.log('\n=== Testes de derivação percentual ↔ valor ===\n');

const derivCases = [
  { name: 'materiais=100k, 40% → VS=40k', fn: () => calcularValorServicoPorPercentual(100000, 40), expect: 40000 },
  { name: 'materiais=0, 40% → VS=0', fn: () => calcularValorServicoPorPercentual(0, 40), expect: 0 },
  { name: 'VS=40k, materiais=100k → 40%', fn: () => calcularPercentualPorValorServico(40000, 100000), expect: 40 },
  { name: 'VS=40k, materiais=0 → 0% (sem divisão por zero)', fn: () => calcularPercentualPorValorServico(40000, 0), expect: 0 },
  { name: 'VS=140k, materiais=100k → 140%', fn: () => calcularPercentualPorValorServico(140000, 100000), expect: 140 },
];

for (const c of derivCases) {
  const r = c.fn();
  const ok = approxEq(r, c.expect);

  const tag = ok ? 'PASS' : 'FAIL';
  if (ok) pass++;
  else fail++;

  console.log(`[${tag}] ${c.name}`);
  console.log(`       resultado=${r} | esperado=${c.expect}`);
}

console.log(`\n=== Resumo: ${pass} pass / ${fail} fail ===`);
process.exit(fail === 0 ? 0 : 1);
