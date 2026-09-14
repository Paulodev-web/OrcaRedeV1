import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getAttachmentSignedUrls } from './getAttachmentSignedUrls';

export interface MountedEquipment {
  id: string;
  /** Descrição livre do que foi montado — não há mais catálogo por trás. */
  notes: string | null;
  installedAt: string;
  photoUrl: string | null;
}

export interface WorkExecutionOverlay {
  /** O que foi montado em cada poste, agrupado por instalação. */
  mountedByInstallation: Record<string, MountedEquipment[]>;
}

const VAZIO: WorkExecutionOverlay = { mountedByInstallation: {} };

interface EquipmentRow {
  id: string;
  installation_id: string;
  notes: string | null;
  installed_at: string;
  work_pole_equipment_media: Array<{ storage_path: string; is_primary: boolean }> | null;
}

/**
 * O que o campo executou, na forma que o canvas precisa.
 *
 * Existe porque até aqui o engenheiro só via poste. Equipamento era
 * registrado no aparelho e não aparecia em lugar nenhum do portal: o gerente
 * trabalhava e ninguém via.
 */
export async function getWorkExecutionOverlay(
  supabase: SupabaseClient,
  workId: string,
): Promise<WorkExecutionOverlay> {
  const { data, error } = await supabase
    .from('work_pole_equipment')
    .select('id, installation_id, notes, installed_at, work_pole_equipment_media(storage_path, is_primary)')
    .eq('work_id', workId)
    .order('installed_at', { ascending: false });

  if (error) {
    // Canvas sem a camada de execução ainda é um canvas útil. Zerar em silêncio
    // aqui é aceitável porque o dia a dia mostra os mesmos registros em texto.
    console.error('[getWorkExecutionOverlay] falha ao ler execução', { error: error.message });
    return VAZIO;
  }

  const rows = (data ?? []) as unknown as EquipmentRow[];
  const photoPaths = rows
    .map((row) => primaryPhotoPath(row.work_pole_equipment_media))
    .filter((p): p is string => Boolean(p));
  const signedUrls = await getAttachmentSignedUrls(photoPaths);

  const mountedByInstallation: Record<string, MountedEquipment[]> = {};
  for (const row of rows) {
    const photoPath = primaryPhotoPath(row.work_pole_equipment_media);
    const lista = mountedByInstallation[row.installation_id] ?? [];
    lista.push({
      id: row.id,
      notes: row.notes,
      installedAt: row.installed_at,
      photoUrl: photoPath ? (signedUrls[photoPath] ?? null) : null,
    });
    mountedByInstallation[row.installation_id] = lista;
  }

  return { mountedByInstallation };
}

function primaryPhotoPath(
  media: Array<{ storage_path: string; is_primary: boolean }> | null,
): string | null {
  if (!media || media.length === 0) return null;
  return media.find((m) => m.is_primary)?.storage_path ?? media[0].storage_path;
}
