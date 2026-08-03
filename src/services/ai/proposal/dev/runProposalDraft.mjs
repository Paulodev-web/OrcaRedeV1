// Script de desenvolvimento: roda a geração do rascunho da proposta contra a
// fixture e imprime o resultado para inspeção manual.
//
// Uso:
//   node src/services/ai/proposal/dev/runProposalDraft.mjs                 rascunho completo
//   node src/services/ai/proposal/dev/runProposalDraft.mjs --minimal       só um grupo de atividades
//   node src/services/ai/proposal/dev/runProposalDraft.mjs --dry           sem chamar a API
//   node src/services/ai/proposal/dev/runProposalDraft.mjs --json          despeja o JSON cru
//   node src/services/ai/proposal/dev/runProposalDraft.mjs --refine=formal testa uma ação de bloco
//   node src/services/ai/proposal/dev/runProposalDraft.mjs --tags          testa a sugestão de mídia
//
// Lê GEMINI_API_KEY de .env.local (ou do ambiente). Para checar o guardrail sem
// gastar token, use `dev/checkNumberGuard.mjs`.

import { importFromSrc, loadEnvFile } from './bootstrap.mjs';

loadEnvFile();

// --- Módulos do projeto ----------------------------------------------------

const BASE = 'services/ai/proposal';
const { generateProposalDraft, planProposalDraftSteps } = await importFromSrc(
  `${BASE}/generateProposalDraft`
);
const { validateProposalDraft } = await importFromSrc(`${BASE}/validateProposalDraft`);
const { refineProposalBlock } = await importFromSrc(`${BASE}/refineProposalBlock`);
const { suggestProposalMediaTags } = await importFromSrc(`${BASE}/suggestProposalMediaTags`);
const { ANDORA_DRAFT_INPUT, ANDORA_DRAFT_INPUT_MINIMAL } = await importFromSrc(
  `${BASE}/fixtures/andoraDraftInput`
);
const { getProposalAiModel } = await importFromSrc(`${BASE}/config`);
const prompts = await importFromSrc('services/ai/prompts');

// --- Argumentos ------------------------------------------------------------

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const option = (name) => {
  const found = args.find((a) => a.startsWith(`--${name}=`));
  return found ? found.slice(name.length + 3) : null;
};

const input = flag('minimal') ? ANDORA_DRAFT_INPUT_MINIMAL : ANDORA_DRAFT_INPUT;
const dumpJson = flag('json');
const dryRun = flag('dry');
const refineAction = option('refine');
const testTags = flag('tags');

/** Vocabulário de exemplo da biblioteca de mídia, no formato que a frente de
 * Configurações vai cadastrar em `media_library`. */
const SAMPLE_MEDIA_TAGS = [
  'poste de concreto',
  'transformador aéreo',
  'subestação transformadora',
  'rede de média tensão',
  'rede de baixa tensão',
  'luminária LED',
  'braço de iluminação',
  'caixa de passagem',
  'vala aberta',
  'envelopamento de dutos',
  'eletroduto PVC',
  'aterramento',
  'equipe em campo',
  'içamento de poste',
  'planta baixa',
  'mapa do empreendimento',
  'obra concluída',
  'ensaio elétrico',
];

// --- Impressão -------------------------------------------------------------

const line = (char = '─') => console.log(char.repeat(78));

function printBlock(label, block) {
  if (!block) {
    console.log(`\n### ${label}\n(vazio)`);
    return;
  }
  console.log(`\n### ${label}`);
  if (block.heading) console.log(`[${block.heading}]`);
  for (const paragraph of block.paragraphs) console.log(`\n${paragraph}`);
  for (const bullet of block.bullets) console.log(`  • ${bullet}`);
}

function printDraft(draft) {
  line('═');
  console.log('CAPA');
  line();
  console.log(`Título:    ${draft.header.projectTitle}`);
  console.log(`Subtítulo: ${draft.header.projectSubtitle ?? '(nenhum)'}`);

  line('═');
  console.log('INSTITUCIONAL');
  line();
  printBlock('Quem Somos', draft.institutional.quemSomos);
  printBlock('Identidade', draft.institutional.identidade);
  printBlock('Compromisso', draft.institutional.compromisso);
  printBlock('Diferencial OrçaRede', draft.institutional.diferencialOrcaRede);

  line('═');
  console.log('DESCRIÇÃO DAS ATIVIDADES');
  for (const group of draft.activities) {
    line();
    console.log(`\n${group.order}. ${group.title}`);
    console.log(`\n${group.intro}`);
    for (const item of group.items) console.log(`  • ${item}`);
    if (group.note) printBlock('Observação técnica', group.note);

    console.log('\n   ── conferência de quantitativo ──');
    for (const fact of group.facts) {
      const text = [group.intro, ...group.items].join(' ');
      const digits = fact.quantity.toLocaleString('pt-BR');
      const padded = fact.quantity < 10 ? `0${fact.quantity}` : digits;
      const found = text.includes(digits) || text.includes(padded);
      console.log(
        `   ${found ? '✓' : '✗'} ${padded} ${fact.unit} — ${fact.label.slice(0, 60)}${
          fact.isApproximate ? '  [estimado]' : ''
        }`
      );
    }
  }

  line('═');
  console.log('COMERCIAL');
  printBlock('Condições de faturamento', draft.billingConditions);
  console.log(`\n### Rodapé do cronograma\n${draft.scheduleFootnote ?? '(vazio)'}`);
  console.log(`\n### Fechamento do termo de aceite\n${draft.acceptanceClosingText}`);

  line('═');
  console.log('CONSIDERAÇÕES FINAIS');
  draft.finalConsiderations.forEach((block, i) => printBlock(`Bloco ${i + 1}`, block));
}

function printViolations(violations) {
  if (violations.length === 0) {
    console.log('Nenhuma violação. ✓');
    return;
  }
  for (const v of violations) {
    console.log(`  ✗ [${v.kind}] ${v.path}`);
    console.log(`     ${v.message}`);
    if (v.excerpt) console.log(`     trecho: "${v.excerpt}"`);
  }
}

// --- Modo seco: só monta os prompts ---------------------------------------

if (dryRun) {
  const steps = planProposalDraftSteps(input);
  console.log(`Plano: ${steps.length} etapa(s)\n`);
  for (const step of steps) console.log(`  ${step.index + 1}. [${step.key}] ${step.label}`);

  line('═');
  console.log('USER PROMPT — primeiro grupo de atividades');
  line();
  console.log(prompts.buildActivityGroupUserPrompt(input, input.activityGroups[0]));

  line('═');
  console.log('SYSTEM PROMPT — atividades');
  line();
  console.log(prompts.PROPOSAL_DRAFT_ACTIVITIES_SYSTEM);
  process.exit(0);
}

if (!process.env.GEMINI_API_KEY) {
  console.error('GEMINI_API_KEY ausente. Defina em .env.local ou no ambiente.');
  console.error('Para inspecionar os prompts sem chamar a API, use --dry.');
  process.exit(1);
}

// --- Geração ---------------------------------------------------------------

const model = getProposalAiModel();
console.log(`Modelo: ${model}`);
console.log(`Fixture: ${input.project.clientName} — ${input.project.city}/${input.project.state}`);
console.log(`Grupos de atividade: ${input.activityGroups.length}\n`);

const startedAt = Date.now();
const result = await generateProposalDraft(input, {
  onProgress: (message) => console.log(message),
});
const wallClockMs = Date.now() - startedAt;

if (!result.success) {
  console.error(`\nFALHA: ${result.error}`);
  for (const step of result.steps) {
    console.error(`  etapa "${step.step.label}": ${step.violations.length} violação(ões)`);
  }
  process.exit(1);
}

if (dumpJson) {
  console.log(JSON.stringify(result.draft, null, 2));
} else {
  printDraft(result.draft);
}

// --- Validação pós-geração -------------------------------------------------

line('═');
console.log('VALIDAÇÃO PÓS-GERAÇÃO');
line();
const report = validateProposalDraft(result.draft, input);
console.log(`Trechos inspecionados: ${report.inspectedFields}`);
console.log(`Resultado: ${report.ok ? 'APROVADO ✓' : 'REPROVADO ✗'}`);
if (!report.ok) {
  console.log(`Por categoria: ${JSON.stringify(report.countsByKind)}`);
  printViolations(report.violations);
}

// --- Refinamento opcional --------------------------------------------------

if (refineAction) {
  const block = result.draft.finalConsiderations[0] ?? result.draft.institutional.compromisso;
  if (block) {
    line('═');
    console.log(`REFINAMENTO — ação "${refineAction}"`);
    line();
    printBlock('Antes', block);

    const refined = await refineProposalBlock({
      block,
      action: refineAction,
      sectionKey: 'consideracoes_finais',
      project: {
        workType: input.project.workType,
        city: input.project.city,
        state: input.project.state,
        utility: input.project.utility,
        clientName: input.project.clientName,
      },
      technicalReferences: input.technicalReferences,
    });

    if (refined.success) {
      printBlock('Depois', refined.block);
      console.log(
        `\nCusto do refinamento: ${refined.usage.calls} chamada(s), ${refined.usage.totalTokens} tokens, ${refined.usage.latencyMs} ms`
      );
    } else {
      console.log(`\nRefinamento recusado: ${refined.error}`);
      printViolations(refined.violations);
    }
  }
}

// --- Sugestão de mídia por tag --------------------------------------------

if (testTags) {
  line('═');
  console.log('SUGESTÃO DE MÍDIA POR TAG');
  line();

  for (const group of result.draft.activities) {
    const suggestion = await suggestProposalMediaTags({
      sectionKey: 'fotos_obra',
      sectionTitle: group.title,
      sectionSummary: group.intro,
      availableTags: SAMPLE_MEDIA_TAGS,
      project: { workType: input.project.workType, utility: input.project.utility },
    });

    console.log(`\n${group.order}. ${group.title}`);
    if (suggestion.success) {
      for (const s of suggestion.suggestions) {
        console.log(`   ${String(s.confidence).padStart(3)} — ${s.tag}: ${s.rationale}`);
      }
    } else {
      console.log(`   falhou: ${suggestion.error}`);
    }
  }
}

// --- Custo e latência ------------------------------------------------------

line('═');
console.log('CUSTO E LATÊNCIA');
line();
console.log(`Etapas:              ${result.steps.length}`);
console.log(`Chamadas ao Gemini:  ${result.usage.calls}`);
console.log(`Tokens de prompt:    ${result.usage.promptTokens.toLocaleString('pt-BR')}`);
console.log(`Tokens de saída:     ${result.usage.outputTokens.toLocaleString('pt-BR')}`);
console.log(`Tokens totais:       ${result.usage.totalTokens.toLocaleString('pt-BR')}`);
console.log(`Latência da API:     ${(result.usage.latencyMs / 1000).toFixed(1)} s`);
console.log(`Tempo total:         ${(wallClockMs / 1000).toFixed(1)} s`);

const slowest = result.steps.reduce((max, s) => (s.usage.latencyMs > max.usage.latencyMs ? s : max));
console.log(
  `Etapa mais lenta:    ${(slowest.usage.latencyMs / 1000).toFixed(1)} s — ${slowest.step.label}`
);
console.log(
  `Teto do Vercel Hobby: 60 s por invocação — ${
    slowest.usage.latencyMs < 50_000 ? 'folga confortável ✓' : 'ATENÇÃO: perto do limite ✗'
  }`
);
