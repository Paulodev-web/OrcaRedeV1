/**
 * Script de inspeção visual — NÃO faz parte do runtime de produção.
 *
 *   npm run pdf:proposta                 → tmp/proposta-fixture.pdf
 *   npm run pdf:proposta -- caminho.pdf  → caminho escolhido
 *
 * Gera o PDF a partir da fixture da Andora e, em seguida, roda a variante
 * propositalmente quebrada (Curva C com o valor da Curva B) para provar que a
 * validação barra o documento antes de desenhar qualquer página.
 */

import fs from 'node:fs';
import path from 'node:path';

import { ProposalValidationError, renderProposalPdf, validateProposalData } from '../index';
import { isUsingFallbackFonts } from '../fonts';
import { andoraProposalFixture, makeBrokenAbcFixture } from '../__fixtures__/andora';

async function main(): Promise<void> {
  const target = path.resolve(process.argv[2] ?? path.join('tmp', 'proposta-fixture.pdf'));
  fs.mkdirSync(path.dirname(target), { recursive: true });

  const issues = validateProposalData(andoraProposalFixture);
  if (issues.length > 0) {
    console.error('A fixture não passou na própria validação:');
    for (const issue of issues) console.error(`  • [${issue.code}] ${issue.path}: ${issue.message}`);
    process.exitCode = 1;
    return;
  }
  console.log('✓ Validação de coerência: fixture íntegra.');

  const startedAt = Date.now();
  const pdf = await renderProposalPdf(andoraProposalFixture);
  const elapsed = Date.now() - startedAt;

  fs.writeFileSync(target, pdf);
  console.log(
    `✓ PDF gerado em ${elapsed} ms — ${(pdf.length / 1024).toFixed(0)} KB\n  ${target}`,
  );
  if (isUsingFallbackFonts()) {
    console.warn('⚠ Fontes da marca não encontradas: o PDF saiu com o fallback Helvetica.');
  }

  // Contraprova: o erro real da Maxif4 tem de derrubar a geração.
  try {
    await renderProposalPdf(makeBrokenAbcFixture());
    console.error('✗ A curva ABC quebrada NÃO foi barrada pela validação.');
    process.exitCode = 1;
  } catch (error) {
    if (!(error instanceof ProposalValidationError)) throw error;
    console.log(`✓ Curva ABC incoerente barrada (${error.issues.length} problema(s)):`);
    for (const issue of error.issues) console.log(`  • [${issue.code}] ${issue.message}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
