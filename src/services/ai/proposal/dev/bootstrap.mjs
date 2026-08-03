// Ponte entre os scripts de desenvolvimento em .mjs e o código TypeScript da
// camada de IA. Importado no topo dos scripts desta pasta, antes de qualquer
// import de módulo do projeto.
//
// POR QUE ISTO EXISTE
// O Node 24 remove tipos de arquivos .ts nativamente, mas o resolvedor dele
// exige especificador completo (`./x.ts`), enquanto o tsconfig do projeto usa
// `moduleResolution: bundler` — import sem extensão e alias `@/`. Escrever os
// imports com `.ts` faria `tsc --noEmit` falhar (TS5097, exige
// `allowImportingTsExtensions`). A saída é registrar um hook de resolução que
// replica o que o bundler do Next faz, a partir de um arquivo .mjs — que fica
// fora do programa do tsc, já que o `include` do tsconfig só casa `**/*.ts`.
//
// Assim o código TypeScript continua idiomático e os scripts rodam sem
// dependência de runner externo e sem tocar no package.json.

import { existsSync, readFileSync, statSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { dirname, join, resolve as resolvePath } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Raiz do repositório, a partir de src/services/ai/proposal/dev/. */
export const ROOT = resolvePath(__dirname, '../../../../..');
export const SRC = join(ROOT, 'src');

// ---------------------------------------------------------------------------
// .env.local
// ---------------------------------------------------------------------------

/** Mesmo leitor de `scripts/classify-materials-subgroups.mjs`. */
export function loadEnvFile(path = join(ROOT, '.env.local')) {
  if (!existsSync(path)) return;

  for (const line of readFileSync(path, 'utf-8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;

    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!(key in process.env)) process.env[key] = value;
  }
}

// ---------------------------------------------------------------------------
// Resolução ao estilo do bundler
// ---------------------------------------------------------------------------

const EXTENSION_CANDIDATES = ['', '.ts', '.tsx', '/index.ts', '/index.tsx'];

function isFile(path) {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

/** `../prompts` casa com um diretório antes de casar com `../prompts/index.ts` —
 * daí a checagem de arquivo, não só de existência. */
function firstExisting(basePath) {
  for (const suffix of EXTENSION_CANDIDATES) {
    const candidate = basePath + suffix;
    if (isFile(candidate)) return candidate;
  }
  return null;
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    let basePath = null;

    if (specifier.startsWith('@/')) {
      basePath = join(SRC, specifier.slice(2));
    } else if (
      (specifier.startsWith('./') || specifier.startsWith('../')) &&
      context.parentURL?.startsWith('file:')
    ) {
      basePath = resolvePath(dirname(fileURLToPath(context.parentURL)), specifier);
    }

    if (basePath) {
      const resolved = firstExisting(basePath);
      if (resolved) {
        const isTypeScript = resolved.endsWith('.ts') || resolved.endsWith('.tsx');
        return {
          url: pathToFileURL(resolved).href,
          // 'module-typescript' aciona o type-stripping nativo do Node 24. Sem
          // ele o arquivo .ts seria lido como JavaScript e as anotações de tipo
          // virariam erro de sintaxe.
          format: isTypeScript ? 'module-typescript' : 'module',
          shortCircuit: true,
        };
      }
    }

    return nextResolve(specifier, context);
  },
});

/** Importa um módulo do projeto por caminho relativo a `src/`. */
export function importFromSrc(relativePath) {
  const resolved = firstExisting(join(SRC, relativePath));
  if (!resolved) throw new Error(`Módulo não encontrado em src/: ${relativePath}`);
  return import(pathToFileURL(resolved).href);
}
