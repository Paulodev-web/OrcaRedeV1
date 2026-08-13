import 'server-only';

/**
 * Cronômetro do lado servidor — instrumentação temporária, irmã de
 * `src/lib/perf/openBudget.ts` (que só enxerga o navegador).
 *
 * Existe porque a lentidão da própria URL acontece ANTES de o browser receber
 * qualquer coisa: o layout do orçamento faz várias idas ao Supabase em série, e
 * nenhum profiler de cliente consegue ver dentro disso. Aqui cada etapa vira
 * uma linha no terminal onde o `next dev` está rodando.
 *
 * DESLIGADO POR PADRÃO. Para ligar:
 *
 *     PERF=1 npm run dev
 *
 * Com o flag desligado, `timeServer` devolve a própria promise sem envolver
 * nada — custo zero.
 */

const ENABLED = process.env.PERF === '1';

/**
 * Cronometra uma etapa e imprime `[perf] <etapa> 123.4ms`.
 *
 * Recebe uma FUNÇÃO, não uma promise, para o relógio começar junto com o
 * trabalho. Recebendo uma promise já criada, o tempo entre a criação e o
 * `await` ficaria de fora — que é exatamente o que se quer medir em código
 * cheio de `Promise.all`.
 */
export async function timeServer<T>(etapa: string, fn: () => Promise<T>): Promise<T> {
  if (!ENABLED) return fn();

  const inicio = performance.now();
  try {
    return await fn();
  } finally {
    const ms = (performance.now() - inicio).toFixed(1);
    console.log(`[perf] ${etapa.padEnd(46)} ${ms.padStart(8)}ms`);
  }
}

/**
 * Abre um bloco de etapas com um total no fim, para separar visualmente um
 * carregamento do próximo no terminal.
 */
export function startServerBlock(titulo: string): (extra?: string) => void {
  if (!ENABLED) return () => {};

  const inicio = performance.now();
  console.log(`\n[perf] ┌─ ${titulo}`);
  return (extra?: string) => {
    const ms = (performance.now() - inicio).toFixed(1);
    console.log(`[perf] └─ TOTAL ${ms}ms${extra ? ` — ${extra}` : ''}\n`);
  };
}
