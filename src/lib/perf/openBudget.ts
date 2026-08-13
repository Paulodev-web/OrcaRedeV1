/**
 * Perfilador da abertura de orçamento — instrumentação temporária.
 *
 * Existe para responder UMA pergunta com número, não com palpite: dos
 * milissegundos entre clicar num orçamento e ver o canvas com os postes,
 * quantos são banco, quantos são rede, quantos são JSON.parse/map e quantos
 * são render do React.
 *
 * DESLIGADO POR PADRÃO. Toda função aqui vira no-op quando não está ligado,
 * então o custo em produção é uma leitura de booleano por chamada. Para ligar:
 *
 *   - `?perf=1` na URL (persiste na aba via sessionStorage), ou
 *   - `localStorage.setItem('orcarede:perf', '1')` (persiste entre reloads)
 *
 * Para ler o resultado, no console do navegador:
 *
 *   perfReport()
 *
 * `perfReport()` RETORNA o objeto (o DevTools imprime valor de retorno
 * sozinho), então funciona igual em `npm run dev` e em build de produção —
 * onde `compiler.removeConsole` do next.config.ts apaga os console.log.
 *
 * ⚠ Em dev o React roda em StrictMode: efeitos e renders acontecem DUAS vezes.
 * Os contadores de render vêm dobrados e alguns fetches aparecem repetidos.
 * Para número que vale, meça em `npm run build && npm start`.
 */

/**
 * Registros guardam o instante ABSOLUTO (`performance.now()`). O tempo relativo
 * à abertura só é calculado na hora do relatório — senão o que foi medido antes
 * do marco zero ficaria com origem errada. E há bastante coisa antes dele: o
 * portão de 100ms do AppProvider roda antes de o `BudgetWorkspaceChrome` sequer
 * montar. Esses eventos aparecem com `em_ms` NEGATIVO, que é a leitura certa —
 * "aconteceu tantos ms antes de a abertura começar".
 */
interface PhaseRecord {
  fase: string;
  ms: number;
  t: number;
  meta?: Record<string, unknown>;
}

interface EventRecord {
  evento: string;
  t: number;
  meta?: Record<string, unknown>;
}

interface PerfState {
  fases: PhaseRecord[];
  eventos: EventRecord[];
  renders: Map<string, number>;
  /** Instante do `open:inicio` mais recente, para medir a abertura corrente. */
  aberturaEm: number | null;
}

const STORAGE_KEY = 'orcarede:perf';

let enabledCache: boolean | null = null;

/** Estado global — sobrevive a hot reload e a navegações client-side. */
function getState(): PerfState {
  const w = window as unknown as { __orcaredePerfState?: PerfState };
  if (!w.__orcaredePerfState) {
    w.__orcaredePerfState = {
      fases: [],
      eventos: [],
      renders: new Map(),
      aberturaEm: null,
    };
  }
  return w.__orcaredePerfState;
}

export function perfEnabled(): boolean {
  if (enabledCache !== null) return enabledCache;
  if (typeof window === 'undefined') return false;

  try {
    const url = new URL(window.location.href);
    if (url.searchParams.get('perf') === '1') {
      window.sessionStorage.setItem(STORAGE_KEY, '1');
    }
    enabledCache =
      window.sessionStorage.getItem(STORAGE_KEY) === '1' ||
      window.localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    // Modo privado / storage bloqueado: simplesmente não perfila.
    enabledCache = false;
  }

  if (enabledCache) {
    installReporter();
  }
  return enabledCache;
}

/**
 * Abre uma fase cronometrada. Devolve a função que fecha e registra.
 *
 * `const fim = perfPhase('detalhes:query-postes'); ... fim({ postes: 280 });`
 *
 * Fechar é opcional em caminho de erro — uma fase não fechada simplesmente não
 * aparece no relatório, e não vaza nada.
 */
export function perfPhase(fase: string): (meta?: Record<string, unknown>) => void {
  if (!perfEnabled()) return () => {};

  const inicio = performance.now();
  const markInicio = `${fase}:inicio`;
  try {
    performance.mark(markInicio);
  } catch {
    /* User Timing indisponível: as fases continuam válidas via performance.now */
  }

  return (meta?: Record<string, unknown>) => {
    const ms = performance.now() - inicio;
    getState().fases.push({
      fase,
      ms: round(ms),
      t: inicio,
      ...(meta ? { meta } : {}),
    });
    try {
      // Aparece na aba Performance do DevTools junto do resto da timeline.
      performance.measure(fase, markInicio);
    } catch {
      /* idem */
    }
    agendarRelatorio();
  };
}

/** Marca instantânea (não tem duração, só "aconteceu neste momento"). */
export function perfEvent(evento: string, meta?: Record<string, unknown>): void {
  if (!perfEnabled()) return;

  const state = getState();
  const agora = performance.now();

  if (evento === 'open:inicio') {
    // Só zera se JÁ houve uma abertura nesta página (troca de orçamento) — aí o
    // que está guardado é da anterior e contaminaria a conta. Na primeira
    // abertura do carregamento, preserva: o portão do AppProvider, o
    // fetchAllCoreData e a hidratação vieram antes e são parte do custo real.
    if (state.aberturaEm !== null) {
      state.fases = [];
      state.eventos = [];
      state.renders = new Map();
    }
    state.aberturaEm = agora;
  }

  state.eventos.push({
    evento,
    t: agora,
    ...(meta ? { meta } : {}),
  });
  try {
    performance.mark(evento);
  } catch {
    /* idem */
  }
  agendarRelatorio();
}

/**
 * Conta um render. Chamar no CORPO do componente (não em efeito) — é só um
 * incremento de contador, sem setState, então não afeta o ciclo do React.
 */
export function perfRender(componente: string): void {
  if (!perfEnabled()) return;
  const renders = getState().renders;
  renders.set(componente, (renders.get(componente) ?? 0) + 1);
}

function round(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * Tamanho do JSON de uma resposta, em KB.
 *
 * Existe porque o Resource Timing devolve `transferSize`/`decodedBodySize`
 * ZERADOS para o Supabase: são recursos de outra origem e o servidor não manda
 * `Timing-Allow-Origin`, então o browser esconde esses campos. Aqui medimos do
 * lado de cá, já desserializado — é o número que interessa mesmo, porque é o
 * que o JS precisa parsear e guardar na memória.
 *
 * Custa um `stringify` do payload (dezenas de ms em 2 MB), por isso só roda com
 * o perfilador ligado. Conta caracteres, não bytes UTF-8: o dado é quase todo
 * ASCII (UUID, código, preço), então a diferença é desprezível.
 */
export function perfJsonKb(valor: unknown): number | null {
  if (!perfEnabled()) return null;
  try {
    return round(JSON.stringify(valor).length / 1024);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Relatório
// ---------------------------------------------------------------------------

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';

/** Nome curto e legível para uma URL de recurso. */
function rotularRecurso(url: string): string | null {
  if (SUPABASE_URL && url.startsWith(SUPABASE_URL)) {
    const resto = url.slice(SUPABASE_URL.length);
    const [caminho, query = ''] = resto.split('?');
    const tabela = caminho.replace('/rest/v1/', '').replace('/auth/v1/', 'auth/');
    // `select=` costuma ser gigante; o que interessa é qual tabela e qual filtro.
    const filtro = query
      .split('&')
      .filter((p) => !p.startsWith('select=') && !p.startsWith('apikey='))
      .join('&');
    return `supabase ${tabela}${filtro ? ` ?${filtro.slice(0, 80)}` : ''}`;
  }
  if (url.includes('/_next/static/chunks/')) return null; // ruído
  if (url.includes('_rsc=')) return 'next RSC (navegação)';
  return null;
}

function coletarRede() {
  const state = getState();
  const desde = state.aberturaEm ?? 0;

  return performance
    .getEntriesByType('resource')
    .filter((e): e is PerformanceResourceTiming => e.entryType === 'resource')
    // Janela de 15s ANTES do marco zero: pega o carregamento frio inteiro
    // (auth, chunks, RSC) sem arrastar um orçamento aberto minutos atrás.
    .filter((e) => e.startTime >= desde - 15000)
    .map((e) => {
      const rotulo = rotularRecurso(e.name);
      if (!rotulo) return null;
      // ⚠ ttfb/tamanhos vêm zerados para o Supabase: recurso de outra origem
      // sem `Timing-Allow-Origin`, o browser não expõe. O tamanho real vem das
      // fases (`perfJsonKb`), medido do lado de cá. `duration` continua válido.
      const opaco = !e.responseStart && !e.decodedBodySize;
      return {
        recurso: rotulo,
        inicio_ms: round(e.startTime - desde),
        ms: round(e.duration),
        ttfb_ms: e.responseStart ? round(e.responseStart - e.requestStart) : null,
        kb_rede: e.transferSize ? round(e.transferSize / 1024) : null,
        kb_json: e.decodedBodySize ? round(e.decodedBodySize / 1024) : null,
        ...(opaco ? { obs: 'sem Timing-Allow-Origin — ver KB nas fases' } : {}),
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .sort((a, b) => a.inicio_ms - b.inicio_ms);
}

export interface PerfReport {
  resumo: Record<string, unknown>;
  fases: { fase: string; inicio_ms: number; ms: number; meta?: Record<string, unknown> }[];
  eventos: { evento: string; em_ms: number; meta?: Record<string, unknown> }[];
  renders: { componente: string; renders: number }[];
  rede: ReturnType<typeof coletarRede>;
}

export function perfReport(): PerfReport | string {
  if (!perfEnabled()) {
    return 'Perfilador desligado. Ligue com localStorage.setItem("orcarede:perf","1") e recarregue.';
  }

  const state = getState();
  const zero = state.aberturaEm ?? 0;
  const rede = coletarRede();

  const fases = [...state.fases]
    .sort((a, b) => a.t - b.t)
    .map(({ fase, ms, t, meta }) => ({ fase, inicio_ms: round(t - zero), ms, ...(meta ? { meta } : {}) }));

  const eventos = [...state.eventos]
    .sort((a, b) => a.t - b.t)
    .map(({ evento, t, meta }) => ({ evento, em_ms: round(t - zero), ...(meta ? { meta } : {}) }));

  const canvasPintado = eventos.find((e) => e.evento === 'canvas:postes-pintados');
  const totalRede = rede.reduce((s, r) => s + (r.kb_json ?? 0), 0);
  const totalRenders = [...state.renders.values()].reduce((s, n) => s + n, 0);

  return {
    resumo: {
      abertura_ate_canvas_ms: canvasPintado?.em_ms ?? '(ainda não pintou)',
      requisicoes_supabase: rede.filter((r) => r.recurso.startsWith('supabase')).length,
      kb_json_baixados: round(totalRede),
      renders_totais: totalRenders,
      // Eventos com em_ms negativo aconteceram ANTES do marco zero da abertura.
      nota: 'em_ms negativo = antes de o orçamento começar a abrir (hidratação, portão do AppProvider)',
      aviso_strictmode:
        process.env.NODE_ENV === 'development'
          ? 'dev/StrictMode: renders e efeitos vêm DOBRADOS — meça em build de produção'
          : undefined,
    },
    fases,
    eventos,
    renders: [...state.renders.entries()]
      .map(([componente, n]) => ({ componente, renders: n }))
      .sort((a, b) => b.renders - a.renders),
    rede,
  };
}

let relatorioAgendado: ReturnType<typeof setTimeout> | null = null;

/**
 * Imprime sozinho quando a abertura "assenta" (1,5s sem nada novo). Só serve em
 * dev — em build de produção o `removeConsole` apaga estas chamadas, e aí o
 * caminho é digitar `perfReport()` no console.
 */
function agendarRelatorio() {
  if (relatorioAgendado) clearTimeout(relatorioAgendado);
  relatorioAgendado = setTimeout(() => {
    relatorioAgendado = null;
    const r = perfReport();
    if (typeof r === 'string') return;
    console.log('%c⏱ Abertura de orçamento — perfReport()', 'font-weight:bold');
    console.log(r.resumo);
    console.table(r.fases);
    console.table(r.rede);
    console.table(r.renders);
  }, 1500);
}

let reporterInstalado = false;

function installReporter() {
  if (reporterInstalado || typeof window === 'undefined') return;
  reporterInstalado = true;
  (window as unknown as { perfReport: typeof perfReport }).perfReport = perfReport;
}
