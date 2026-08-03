import fs from 'node:fs';
import path from 'node:path';
import { Font } from '@react-pdf/renderer';

import { FONTS } from './theme';

/**
 * Registro das fontes da marca.
 *
 * As fontes são EMBUTIDAS a partir de arquivos `.ttf` versionados nesta pasta
 * (Montserrat + Inter, ambas OFL). Nada de fonte do sistema: se o arquivo não
 * for encontrado, o fallback é Helvetica — que é uma das 14 fontes-padrão do
 * próprio formato PDF, não do sistema operacional.
 *
 * Montserrat (geométrica) reproduz o display em caixa alta espaçada da peça
 * atual; Inter sustenta a leitura do corpo em 9pt.
 */

type FaceSpec = { file: string; fontWeight: 400 | 600 | 700 };

const DISPLAY_FACES: FaceSpec[] = [
  { file: 'Montserrat-Regular.ttf', fontWeight: 400 },
  { file: 'Montserrat-SemiBold.ttf', fontWeight: 600 },
  { file: 'Montserrat-Bold.ttf', fontWeight: 700 },
];

const TEXT_FACES: FaceSpec[] = [
  { file: 'Inter-Regular.ttf', fontWeight: 400 },
  { file: 'Inter-SemiBold.ttf', fontWeight: 600 },
  { file: 'Inter-Bold.ttf', fontWeight: 700 },
];

/**
 * Onde procurar os `.ttf`. O primeiro candidato resolve em runtime normal; os
 * demais cobrem bundling do Next, onde `__dirname` pode apontar para `.next/`.
 */
function candidateDirs(): string[] {
  const dirs: string[] = [];
  try {
    // `__dirname` existe no bundle CJS do Next; em ESM puro cai no catch.
    if (typeof __dirname === 'string') dirs.push(path.join(__dirname, 'fonts'));
  } catch {
    /* ambiente ESM — segue para os fallbacks abaixo */
  }
  dirs.push(path.join(process.cwd(), 'src', 'services', 'pdf', 'proposal', 'fonts'));
  return dirs;
}

/**
 * Lê o `.ttf` e devolve como data URI.
 *
 * O react-pdf aceita caminho de arquivo, URL ou data URI. Optamos por ler nós
 * mesmos e entregar os bytes embutidos: assim a resolução de caminho fica sob
 * nosso controle (importante em bundle do Next, onde o cwd do processo não é o
 * da pasta do módulo) e não há I/O extra dentro do renderer.
 */
function readFace(file: string): string | null {
  for (const dir of candidateDirs()) {
    const full = path.join(dir, file);
    try {
      if (!fs.existsSync(full)) continue;
      return `data:font/truetype;base64,${fs.readFileSync(full).toString('base64')}`;
    } catch {
      /* tenta o próximo candidato */
    }
  }
  return null;
}

let registered = false;
let usingFallback = false;

/**
 * `true` quando os `.ttf` da marca não foram encontrados e o documento saiu em
 * Helvetica. Útil para o chamador logar/alertar sem quebrar a geração.
 */
export function isUsingFallbackFonts(): boolean {
  return usingFallback;
}

/**
 * Registra as famílias `ONDisplay` e `ONText`. Idempotente — pode ser chamada a
 * cada render sem custo (o `Font` do react-pdf mantém cache interno).
 */
export function registerProposalFonts(): void {
  if (registered) return;
  registered = true;

  // O hifenizador padrão do react-pdf quebra palavra em português de forma
  // errada ("infraestru-tura"). Desligamos: a quebra passa a ser só por espaço.
  Font.registerHyphenationCallback((word) => [word]);

  const families: Array<{ family: string; faces: FaceSpec[] }> = [
    { family: FONTS.display, faces: DISPLAY_FACES },
    { family: FONTS.text, faces: TEXT_FACES },
  ];

  for (const { family, faces } of families) {
    const loaded = faces
      .map((face) => {
        const src = readFace(face.file);
        return src ? { src, fontWeight: face.fontWeight } : null;
      })
      .filter((face): face is { src: string; fontWeight: 400 | 600 | 700 } => face !== null);

    if (loaded.length !== faces.length) {
      usingFallback = true;
      continue;
    }

    Font.register({ family, fonts: loaded });
  }

  if (usingFallback) {
    // Fallback seguro: as famílias passam a apontar para Helvetica, que é
    // built-in do PDF (não depende de fonte instalada na máquina).
    for (const family of [FONTS.display, FONTS.text]) {
      Font.register({
        family,
        fonts: [
          { src: 'Helvetica', fontWeight: 400 },
          { src: 'Helvetica-Bold', fontWeight: 600 },
          { src: 'Helvetica-Bold', fontWeight: 700 },
        ],
      });
    }
  }
}
