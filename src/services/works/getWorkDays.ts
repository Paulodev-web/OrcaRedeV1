import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

/** Teto por origem. Uma obra grande não devolve o histórico inteiro de uma vez. */
const LIMITE_POR_ORIGEM = 300;

/**
 * O fuso da obra.
 *
 * O corte do dia é meia-noite local, não UTC. Sem isto, todo registro feito
 * depois das 21h cai no dia seguinte, e o diário de terça apareceria com o
 * trabalho de segunda à noite.
 */
const FUSO_DA_OBRA = 'America/Sao_Paulo';

const diaFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: FUSO_DA_OBRA,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

function diaDaObra(iso: string): string {
  return diaFormatter.format(new Date(iso));
}

export type DayEntryKind = 'pole' | 'equipment';

export interface DayEntry {
  id: string;
  kind: DayEntryKind;
  /** Hora do APARELHO. É ela que decide a que dia o registro pertence. */
  at: string;
  /** Hora em que chegou ao servidor. Diferente de `at` quando passou pela fila. */
  arrivedAt: string;
  title: string;
  detail: string | null;
  mediaPaths: string[];
}

export interface WorkDay {
  /** `YYYY-MM-DD` no fuso da obra. */
  date: string;
  poles: number;
  /** Quantos registros de equipamento — não há mais quantidade por item, sem catálogo. */
  structures: number;
  photos: number;
  entries: DayEntry[];
}

/**
 * O diário que ninguém escreve.
 *
 * Lê as duas origens de execução e agrupa por dia. Não existe tabela de
 * "diário": o dia é uma leitura do que já foi registrado, e por isso não tem
 * aprovação, não tem revisão e não pode divergir do que aconteceu.
 *
 * Duas regras que não são óbvias:
 *
 *  - agrupa por `installed_at`, a hora do aparelho, nunca por `created_at`. Um
 *    poste levantado às 16h38 sem sinal e sincronizado às 19h12 pertence ao dia
 *    de quem o levantou, não ao de quem o recebeu.
 *  - o corte do dia é meia-noite em `America/Sao_Paulo`.
 */
export async function getWorkDays(
  supabase: SupabaseClient,
  workId: string,
): Promise<WorkDay[]> {
  const [polesRes, equipRes] = await Promise.all([
    supabase
      .from('work_pole_installations')
      .select(
        `id, numbering, pole_type, installed_at, created_at,
         work_pole_installation_media (storage_path)`,
      )
      .eq('work_id', workId)
      .eq('status', 'installed')
      .order('installed_at', { ascending: false })
      .limit(LIMITE_POR_ORIGEM),
    supabase
      .from('work_pole_equipment')
      .select(
        `id, installed_at, created_at, notes,
         work_pole_installations:installation_id (numbering),
         work_pole_equipment_media (storage_path)`,
      )
      .eq('work_id', workId)
      .order('installed_at', { ascending: false })
      .limit(LIMITE_POR_ORIGEM),
  ]);

  if (polesRes.error || equipRes.error) {
    // Falha de leitura não pode virar "dia sem trabalho". Melhor a tela dizer
    // que não conseguiu ler do que afirmar com confiança que o campo parou.
    throw new Error(
      polesRes.error?.message ??
        equipRes.error?.message ??
        'Falha ao ler a execução da obra.',
    );
  }

  const dias = new Map<string, WorkDay>();
  const garante = (date: string): WorkDay => {
    let dia = dias.get(date);
    if (!dia) {
      dia = { date, poles: 0, structures: 0, photos: 0, entries: [] };
      dias.set(date, dia);
    }
    return dia;
  };

  const caminhos = (m: Array<{ storage_path: string }> | null | undefined): string[] =>
    (m ?? []).map((x) => x.storage_path).filter(Boolean);

  /**
   * O PostgREST devolve relação para-um ora como objeto, ora como array de um.
   * Normalizar aqui evita `numbering` sumir sem erro nenhum aparecer.
   */
  const um = <T,>(v: T | T[] | null | undefined): T | null => {
    if (Array.isArray(v)) return v[0] ?? null;
    return v ?? null;
  };

  for (const row of (polesRes.data ?? []) as unknown as Array<{
    id: string;
    numbering: string | null;
    pole_type: string | null;
    installed_at: string;
    created_at: string;
    work_pole_installation_media: Array<{ storage_path: string }> | null;
  }>) {
    const dia = garante(diaDaObra(row.installed_at));
    const midia = caminhos(row.work_pole_installation_media);
    dia.poles += 1;
    dia.photos += midia.length;
    dia.entries.push({
      id: row.id,
      kind: 'pole',
      at: row.installed_at,
      arrivedAt: row.created_at,
      title: row.numbering ? `Poste ${row.numbering} levantado` : 'Poste levantado',
      detail: row.pole_type,
      mediaPaths: midia,
    });
  }

  for (const row of (equipRes.data ?? []) as unknown as Array<{
    id: string;
    installed_at: string;
    created_at: string;
    notes: string | null;
    work_pole_installations: { numbering: string | null } | Array<{ numbering: string | null }> | null;
    work_pole_equipment_media: Array<{ storage_path: string }> | null;
  }>) {
    const dia = garante(diaDaObra(row.installed_at));
    const midia = caminhos(row.work_pole_equipment_media);
    const poste = um(row.work_pole_installations)?.numbering;

    dia.structures += 1;
    dia.photos += midia.length;
    dia.entries.push({
      id: row.id,
      kind: 'equipment',
      at: row.installed_at,
      arrivedAt: row.created_at,
      title: poste ? `Equipamento no poste ${poste}` : 'Equipamento montado',
      detail: row.notes,
      mediaPaths: midia,
    });
  }

  const ordenados = Array.from(dias.values()).sort((a, b) => b.date.localeCompare(a.date));
  for (const dia of ordenados) {
    dia.entries.sort((a, b) => b.at.localeCompare(a.at));
  }
  return ordenados;
}
