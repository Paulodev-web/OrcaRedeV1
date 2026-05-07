// Smoke test do motor calculateServicePricing e calcularValorServicoPorLucro
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

function calculateServicePricing(valorServico, custos, impostoPercent, valorMateriais) {
  const vs = Math.max(toSafeNumber(valorServico), 0);
  const ip = clampPercent(impostoPercent, { min: 0, max: 100 });
  const materiais = Math.max(toSafeNumber(valorMateriais), 0);

  const custosDetalhados = custos.map((c) => {
    const valor = toSafeNumber(c.valor);
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

function calcularValorServicoPorLucro(totalCustos, lucroPercentDesejado) {
  const custos = toSafeNumber(totalCustos);
  const lucroPercent = toSafeNumber(lucroPercentDesejado);

  if (lucroPercent >= 100) {
    return null;
  }

  if (custos <= 0) {
    return 0;
  }

  const divisor = 1 - lucroPercent / 100;
  if (divisor <= 0) {
    return null;
  }

  return custos / divisor;
}

function approxEq(a, b, eps = 1e-6) {
  return Math.abs(a - b) <= eps;
}

// Casos obrigatórios do plano:
// 1. VS = 40k, custos = 22k, imposto 13% → validar cada campo
// 2. VS = 0 → todos percentuais = 0, sem NaN
// 3. lucroPercent = 50%, custos = 20k → VS = 40k
// 4. lucroPercent = 100% → retornar null
// 5. custos > VS → lucro negativo, sem erro
// 6. imposto = 0% → impostoValor = 0

const cases = [
  {
    name: 'VS=40k, custos=22k, imposto=13%',
    vs: 40000,
    custos: [{ id: 'a', descricao: 'Mão de obra', valor: 22000 }],
    imp: 13,
    materiais: 10000,
    expect: {
      lucroBruto: 18000,
      lucroBrutoPercent: 45,
      impostoValor: 5200,
      lucroLiquido: 12800,
      lucroLiquidoPercent: 32,
      precoTotalCliente: 50000,
    },
  },
  {
    name: 'VS=0 → percentuais = 0, sem NaN',
    vs: 0,
    custos: [{ id: 'a', descricao: 'X', valor: 100 }],
    imp: 10,
    materiais: 5000,
    expect: {
      lucroBruto: -100,
      lucroBrutoPercent: 0,
      impostoValor: 0,
      lucroLiquido: -100,
      lucroLiquidoPercent: 0,
      precoTotalCliente: 5000,
    },
  },
  {
    name: 'custos > VS → lucro negativo',
    vs: 10000,
    custos: [{ id: 'a', descricao: 'Excesso', valor: 15000 }],
    imp: 0,
    materiais: 0,
    expect: {
      lucroBruto: -5000,
      lucroBrutoPercent: -50,
      impostoValor: 0,
      lucroLiquido: -5000,
      lucroLiquidoPercent: -50,
      precoTotalCliente: 10000,
    },
  },
  {
    name: 'imposto=0% → impostoValor=0',
    vs: 20000,
    custos: [{ id: 'a', descricao: 'Custo', valor: 8000 }],
    imp: 0,
    materiais: 3000,
    expect: {
      lucroBruto: 12000,
      lucroBrutoPercent: 60,
      impostoValor: 0,
      lucroLiquido: 12000,
      lucroLiquidoPercent: 60,
      precoTotalCliente: 23000,
    },
  },
  {
    name: 'imposto=100% sobre VS (não sobre lucro)',
    vs: 10000,
    custos: [{ id: 'a', descricao: 'Custo', valor: 3000 }],
    imp: 100,
    materiais: 0,
    expect: {
      lucroBruto: 7000,
      lucroBrutoPercent: 70,
      impostoValor: 10000,
      lucroLiquido: -3000,
      lucroLiquidoPercent: -30,
      precoTotalCliente: 10000,
    },
  },
];

let pass = 0;
let fail = 0;

console.log('=== Testes de calculateServicePricing ===\n');

for (const c of cases) {
  const r = calculateServicePricing(c.vs, c.custos, c.imp, c.materiais);
  const ok =
    approxEq(r.lucroBruto, c.expect.lucroBruto) &&
    approxEq(r.lucroBrutoPercent, c.expect.lucroBrutoPercent) &&
    approxEq(r.impostoValor, c.expect.impostoValor) &&
    approxEq(r.lucroLiquido, c.expect.lucroLiquido) &&
    approxEq(r.lucroLiquidoPercent, c.expect.lucroLiquidoPercent) &&
    approxEq(r.precoTotalCliente, c.expect.precoTotalCliente);

  const tag = ok ? 'PASS' : 'FAIL';
  if (ok) pass++;
  else fail++;

  console.log(`[${tag}] ${c.name}`);
  console.log(
    `       LucroBruto=${r.lucroBruto} (${r.lucroBrutoPercent.toFixed(2)}%) | Imposto=${r.impostoValor} | LucroLiq=${r.lucroLiquido} (${r.lucroLiquidoPercent.toFixed(2)}%) | Total=${r.precoTotalCliente}`
  );
  if (!ok) {
    console.log(`       expected: lucroBruto=${c.expect.lucroBruto} imposto=${c.expect.impostoValor} lucroLiq=${c.expect.lucroLiquido} total=${c.expect.precoTotalCliente}`);
  }
}

console.log('\n=== Testes de calcularValorServicoPorLucro ===\n');

const lucroCases = [
  {
    name: 'lucro%=50, custos=20k → VS=40k',
    custos: 20000,
    lucroPercent: 50,
    expect: 40000,
  },
  {
    name: 'lucro%=100 → null (inválido)',
    custos: 20000,
    lucroPercent: 100,
    expect: null,
  },
  {
    name: 'lucro%=0, custos=10k → VS=10k',
    custos: 10000,
    lucroPercent: 0,
    expect: 10000,
  },
  {
    name: 'custos=0 → VS=0',
    custos: 0,
    lucroPercent: 30,
    expect: 0,
  },
  {
    name: 'lucro%=25, custos=15k → VS=20k',
    custos: 15000,
    lucroPercent: 25,
    expect: 20000,
  },
];

for (const c of lucroCases) {
  const r = calcularValorServicoPorLucro(c.custos, c.lucroPercent);
  const ok = c.expect === null ? r === null : approxEq(r, c.expect);

  const tag = ok ? 'PASS' : 'FAIL';
  if (ok) pass++;
  else fail++;

  console.log(`[${tag}] ${c.name}`);
  console.log(`       VS calculado=${r} | esperado=${c.expect}`);
}

console.log(`\n=== Resumo: ${pass} pass / ${fail} fail ===`);
process.exit(fail === 0 ? 0 : 1);
