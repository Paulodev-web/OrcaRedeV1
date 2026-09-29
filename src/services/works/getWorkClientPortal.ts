import 'server-only';
import { cache } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';

/** Uma foto da galeria que o cliente vê. Formato herdado do Portal antigo. */
export interface WorkPortalImage {
  id: string;
  name: string;
  /** URL pública no bucket `plans`, ou um data URI legado (ver nota abaixo). */
  url: string;
  uploadDate: string;
  description: string;
}

export interface WorkClientPortal {
  trackingId: string;
  /** Sufixo do link público: /obra/<publicId>. */
  publicId: string | null;
  /** A identidade continua estavel mesmo quando o acesso anonimo e desligado. */
  publicEnabled: boolean;

  // ---- O que o engenheiro escreve para o cliente.
  projectDescription: string | null;
  currentFocusTitle: string | null;
  currentFocusDescription: string | null;
  responsiblePerson: string | null;
  clientLogoUrl: string | null;
  images: WorkPortalImage[];

  // ---- Metas que a obra ainda não deriva, contadas à mão.
  plannedEquipment: number | null;
  equipmentInstalled: number | null;
  plannedPublicLighting: number | null;
  publicLightingInstalled: number | null;

  // ---- Derivados da obra. Só leitura nesta tela.
  polesPublished: number;
  polesPlanned: number;
  progressPercentage: number;
}

/**
 * O portal do cliente desta obra, inteiro, para a aba que o edita.
 *
 * Irmão de `getWorkTrackingLink`, que devolve só o link e a contagem para o
 * cartão da Visão Geral. Aqui vem o resto: o que o engenheiro escreve, a
 * galeria e os contadores manuais.
 *
 * **Sobre `work_images`.** O Portal do Engenheiro gravava cada foto como data
 * URI base64 dentro do próprio JSONB, com um comentário no código admitindo que
 * era provisório ("em produção usaria upload para servidor/storage"). A aba
 * nova sobe para o bucket `plans` e guarda a URL, que é o que sempre deveria
 * ter sido. O formato do JSON não muda, então foto antiga continua abrindo:
 * para quem lê, os dois são só uma string em `url`.
 */
export const getWorkClientPortal = cache(async (
  supabase: SupabaseClient,
  workId: string,
): Promise<WorkClientPortal | null> => {
  const { data } = await supabase
    .from('work_trackings')
    .select(
      `id, public_id, public_enabled, project_description, current_focus_title,
       current_focus_description, responsible_person, client_logo_url,
       work_images, planned_equipment, equipment_installed,
       planned_public_lighting, public_lighting_installed,
       poles_installed, planned_poles, progress_percentage`,
    )
    .eq('work_id', workId)
    .maybeSingle();

  if (!data) return null;

  const rawImages = Array.isArray(data.work_images) ? data.work_images : [];
  const images: WorkPortalImage[] = rawImages
    .filter((i): i is Record<string, unknown> => !!i && typeof i === 'object')
    .map((i) => ({
      id: String(i.id ?? ''),
      name: String(i.name ?? 'Foto'),
      url: String(i.url ?? ''),
      uploadDate: String(i.uploadDate ?? ''),
      description: String(i.description ?? ''),
    }))
    .filter((i) => i.id !== '' && i.url !== '');

  const num = (v: unknown): number | null =>
    v === null || v === undefined ? null : Number(v);

  return {
    trackingId: data.id as string,
    publicId: (data.public_id as string | null) ?? null,
    publicEnabled: data.public_enabled !== false,
    projectDescription: (data.project_description as string | null) ?? null,
    currentFocusTitle: (data.current_focus_title as string | null) ?? null,
    currentFocusDescription: (data.current_focus_description as string | null) ?? null,
    responsiblePerson: (data.responsible_person as string | null) ?? null,
    clientLogoUrl: (data.client_logo_url as string | null) ?? null,
    images,
    plannedEquipment: num(data.planned_equipment),
    equipmentInstalled: num(data.equipment_installed),
    plannedPublicLighting: num(data.planned_public_lighting),
    publicLightingInstalled: num(data.public_lighting_installed),
    polesPublished: Number(data.poles_installed ?? 0),
    polesPlanned: Number(data.planned_poles ?? 0),
    progressPercentage: Number(data.progress_percentage ?? 0),
  };
});
