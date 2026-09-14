import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

export interface ExecutedSpan {
  id: string;
  fromPostId: string | null;
  toPostId: string | null;
  category: 'BT' | 'MT' | 'iluminacao';
  meters: number;
}

export interface MountedItem {
  label: string;
  quantity: number;
  fromProject: boolean;
}

export interface WorkExecutionOverlay {
  /** Trechos já lançados, para o canvas desenhar linha cheia sobre o tracejado. */
  spans: ExecutedSpan[];
  /** O que foi montado em cada poste, agrupado por instalação. */
  mountedByInstallation: Record<string, MountedItem[]>;
}

const VAZIO: WorkExecutionOverlay = { spans: [], mountedByInstallation: {} };

/**
 * O que o campo executou, na forma que o canvas precisa.
 *
 * Existe porque até aqui o engenheiro só via poste. Equipamento e trecho eram
 * registrados no aparelho e não apareciam em lugar nenhum do portal: o gerente
 * trabalhava e ninguém via.
 */
export async function getWorkExecutionOverlay(
  supabase: SupabaseClient,
  workId: string,
): Promise<WorkExecutionOverlay> {
  const [spansRes, itemsRes] = await Promise.all([
    supabase
      .from('work_network_spans')
      .select('id, from_post_id, to_post_id, category, meters')
      .eq('work_id', workId),
    supabase
      .from('work_pole_equipment_items')
      .select('label, quantity, from_project, work_pole_equipment:equipment_id (installation_id)')
      .eq('work_id', workId),
  ]);

  if (spansRes.error || itemsRes.error) {
    // Canvas sem a camada de execução ainda é um canvas útil. Zerar em silêncio
    // aqui é aceitável porque o dia a dia mostra os mesmos registros em texto.
    console.error('[getWorkExecutionOverlay] falha ao ler execução', {
      spans: spansRes.error?.message ?? 'ok',
      items: itemsRes.error?.message ?? 'ok',
    });
    return VAZIO;
  }

  const spans: ExecutedSpan[] = (
    (spansRes.data ?? []) as Array<{
      id: string;
      from_post_id: string | null;
      to_post_id: string | null;
      category: 'BT' | 'MT' | 'iluminacao';
      meters: number | string | null;
    }>
  ).map((row) => ({
    id: row.id,
    fromPostId: row.from_post_id,
    toPostId: row.to_post_id,
    category: row.category,
    meters: Number(row.meters ?? 0),
  }));

  const mountedByInstallation: Record<string, MountedItem[]> = {};
  for (const row of (itemsRes.data ?? []) as unknown as Array<{
    label: string;
    quantity: number | string | null;
    from_project: boolean;
    work_pole_equipment:
      | { installation_id: string }
      | Array<{ installation_id: string }>
      | null;
  }>) {
    const rel = Array.isArray(row.work_pole_equipment)
      ? row.work_pole_equipment[0]
      : row.work_pole_equipment;
    const installationId = rel?.installation_id;
    if (!installationId) continue;

    const lista = mountedByInstallation[installationId] ?? [];
    lista.push({
      label: row.label,
      quantity: Number(row.quantity ?? 1),
      fromProject: row.from_project !== false,
    });
    mountedByInstallation[installationId] = lista;
  }

  return { spans, mountedByInstallation };
}
