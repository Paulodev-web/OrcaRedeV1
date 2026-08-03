// Verificação do guardrail de número, sem chamar a API.
//
//   node src/services/ai/proposal/dev/checkNumberGuard.mjs
//
// Cada caso abaixo é um erro real das duas propostas que a ON enviou ao cliente
// (287.1 Andora e 163.4 Maxif4) ou a versão correta do mesmo trecho. Rodar isto
// antes de mexer em `numberGuard.ts` ou `ptNumbers.ts` responde em segundos se
// a mudança afrouxou alguma das camadas.
//
// Roda offline e é determinístico — pode entrar em CI sem custo de token.

import { importFromSrc } from './bootstrap.mjs';

const { buildAllowedNumberUniverse, checkGeneratedText, checkNumbersPreserved } =
  await importFromSrc('services/ai/proposal/numberGuard');
const { integerToPtBrWords, formatIntegerPtBr, formatQuantityWithWords } =
  await importFromSrc('services/ai/proposal/ptNumbers');
const { ANDORA_DRAFT_INPUT } = await importFromSrc(
  'services/ai/proposal/fixtures/andoraDraftInput'
);

let pass = 0;
let fail = 0;

function check(name, actual, expected) {
  const ok = actual === expected;
  if (ok) {
    pass++;
    console.log(`  ok   ${name}`);
  } else {
    fail++;
    console.log(`  FALHA ${name}\n        esperado: ${expected}\n        obtido:   ${actual}`);
  }
}

// ---------------------------------------------------------------------------
console.log('\nEXTENSO E FORMATAÇÃO');
// ---------------------------------------------------------------------------

check('61 → sessenta e um', integerToPtBrWords(61), 'sessenta e um');
check('61 feminino → sessenta e uma', integerToPtBrWords(61, 'f'), 'sessenta e uma');
check('5 → cinco', integerToPtBrWords(5), 'cinco');
// A peça impressa trazia "cinqüenta e três", grafia anterior ao Acordo de 1990.
check('53 → cinquenta e três', integerToPtBrWords(53), 'cinquenta e três');
check('183 → cento e oitenta e três', integerToPtBrWords(183), 'cento e oitenta e três');
check('181 feminino → cento e oitenta e uma', integerToPtBrWords(181, 'f'), 'cento e oitenta e uma');
check('1240 → mil duzentos e quarenta', integerToPtBrWords(1240), 'mil duzentos e quarenta');
check('2150 → dois mil cento e cinquenta', integerToPtBrWords(2150), 'dois mil cento e cinquenta');
check('2000 → dois mil', integerToPtBrWords(2000), 'dois mil');
check('100 → cem', integerToPtBrWords(100), 'cem');
check('1100 → mil e cem', integerToPtBrWords(1100), 'mil e cem');
check('1005 → mil e cinco', integerToPtBrWords(1005), 'mil e cinco');
check('algarismo 5 → 05', formatIntegerPtBr(5), '05');
check('algarismo 1240 → 1.240', formatIntegerPtBr(1240), '1.240');
check('par pronto para o prompt', formatQuantityWithWords(5), '05 (cinco)');

// ---------------------------------------------------------------------------
console.log('\nCAMADAS DO GUARDRAIL (grupo 1 da fixture Andora)');
// ---------------------------------------------------------------------------

const group = ANDORA_DRAFT_INPUT.activityGroups[0];
const universe = buildAllowedNumberUniverse({
  sources: [ANDORA_DRAFT_INPUT],
  facts: group.facts,
  references: ANDORA_DRAFT_INPUT.technicalReferences,
});

const kinds = (text) =>
  checkGeneratedText(text, { path: 'teste', universe, facts: group.facts, strict: true }).map(
    (v) => v.kind
  );

function expectKinds(name, text, expected) {
  const got = kinds(text);
  const ok =
    expected.length === 0 ? got.length === 0 : expected.every((e) => got.includes(e));
  if (ok) {
    pass++;
    console.log(`  ok   ${name}${got.length ? ` → [${got.join(', ')}]` : ''}`);
  } else {
    fail++;
    console.log(`  FALHA ${name}\n        esperado conter: [${expected.join(', ')}]\n        obtido:          [${got.join(', ')}]`);
  }
}

// O erro impresso na Andora, pág. 6: "Instalação de 05 (seis) transformadores".
expectKinds(
  'L3 — "05 (seis)" é reprovado',
  'Instalação de 05 (seis) transformadores de distribuição trifásicos de 112,5 kVA.',
  ['extenso_divergente']
);
expectKinds(
  'L3 — "05 (cinco)" passa',
  'Instalação de 05 (cinco) transformadores de distribuição trifásicos de 112,5 kVA, tensão primária 13,8 kV e secundária 220/127 V.',
  []
);
expectKinds(
  'L1/L2 — metragem inventada é reprovada',
  'Execução de aproximadamente 1.500 metros de rede de média tensão trifásica em 13,8 kV.',
  ['numero_fora_dos_fatos', 'quantitativo_divergente']
);
expectKinds(
  'L4 — quantitativo estimado sem "aproximadamente" é reprovado',
  'Execução de 1.240 metros de rede de média tensão trifásica em 13,8 kV.',
  ['aproximacao_incoerente']
);
expectKinds(
  'L4 — quantitativo estimado com "aproximadamente" passa',
  'Execução de aproximadamente 1.240 metros de rede de média tensão trifásica em 13,8 kV, com cabo CA 155,4 MCM, 7 fios, tipo Anaheim.',
  []
);
expectKinds(
  'L4 — quantitativo exato tratado como estimativa é reprovado',
  'Instalação de aproximadamente 61 postes de concreto Duplo "T" tipo CAAA IV.',
  ['aproximacao_incoerente']
);
expectKinds(
  'L5 — valor monetário é reprovado',
  'O investimento total é de R$ 1.350.455,77 para o empreendimento.',
  ['valor_monetario']
);
expectKinds(
  'L6 — norma fora da lista é reprovada',
  'Conforme a Norma Técnica NT.00012 da concessionária Equatorial.',
  ['norma_nao_listada']
);
expectKinds(
  'L6 — norma da lista passa',
  'Conforme especificações do Desenho 20 da Norma Técnica NT.00004 – Equatorial.',
  []
);
// O placeholder impresso na Maxif4, pág. 9.
expectKinds('L7 — placeholder de template é reprovado', 'TEXTO DO SEU PARÁGRAFO', [
  'placeholder',
]);
expectKinds(
  'item completo e correto passa',
  'Instalação de 61 (sessenta e um) postes de concreto Duplo "T" tipo CAAA IV, adequados para aplicação em ambiente com risco de corrosão classe C5, conforme especificações técnicas e critérios estruturais definidos em projeto.',
  []
);

// ---------------------------------------------------------------------------
console.log('\nPRESERVAÇÃO DE NÚMERO NO REFINAMENTO');
// ---------------------------------------------------------------------------

const original =
  'Instalação de 61 (sessenta e um) postes e 05 (cinco) transformadores de 112,5 kVA.';

function expectPreserve(name, refined, allowDrop, expectedCount) {
  const got = checkNumbersPreserved(original, refined, { path: 'block', allowDrop });
  check(`${name} → ${expectedCount} violação(ões)`, got.length, expectedCount);
}

expectPreserve(
  'reescrita formal preservando tudo',
  'Procede-se à instalação de 61 (sessenta e um) postes e de 05 (cinco) transformadores de 112,5 kVA.',
  false,
  0
);
expectPreserve(
  'reescrita que troca 61 por 60',
  'Procede-se à instalação de 60 (sessenta) postes e de 05 (cinco) transformadores de 112,5 kVA.',
  false,
  2
);
expectPreserve(
  'encurtar pode eliminar a frase de um número',
  'Instalação de 61 (sessenta e um) postes.',
  true,
  0
);
expectPreserve(
  'encurtar não pode inventar número',
  'Instalação de 99 (noventa e nove) postes.',
  true,
  1
);

// ---------------------------------------------------------------------------
console.log('\nREFINAMENTO SEM FATOS INFORMADOS (L1/L2 desligadas)');
// ---------------------------------------------------------------------------

// Regressão: um bloco que já cita "61 (sessenta e um) postes" não pode ser
// reprovado só porque o chamador não passou `facts`. Sem universo de fatos,
// L1 e L2 ficam de fora — quem cuida do número ali é checkNumbersPreserved —
// mas as camadas que não dependem de fato continuam valendo.
const looseUniverse = buildAllowedNumberUniverse({
  sources: [original],
  facts: [],
  references: [],
});
const loose = (text) =>
  checkGeneratedText(text, {
    path: 'block',
    universe: looseUniverse,
    facts: [],
    strict: false,
  }).map((v) => v.kind);

check('bloco legítimo não é reprovado sem fatos', loose(original).length, 0);
check(
  'extenso divergente continua sendo pego',
  loose('Instalação de 05 (seis) transformadores.').includes('extenso_divergente'),
  true
);
check(
  'valor monetário continua sendo pego',
  loose('Investimento total de R$ 10,00.').includes('valor_monetario'),
  true
);
check(
  'placeholder continua sendo pego',
  loose('TEXTO DO SEU PARÁGRAFO').includes('placeholder'),
  true
);

// ---------------------------------------------------------------------------

console.log(`\n${pass} ok, ${fail} falha(s)\n`);
process.exit(fail > 0 ? 1 : 0);
