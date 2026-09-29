import 'server-only';
import { cache } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';

export interface WorkTrackingLink {
  trackingId: string;
  /** Sufixo do link público: /obra/<publicId>. Null = tracking sem link. */
  publicId: string | null;
  /** False quando a obra foi cancelada/excluida e o link esta despublicado. */
  publicEnabled: boolean;
  /** Quantos postes do orçamento já acenderam para o cliente. */
  polesPublished: number;
  /** Quantos postes o orçamento prevê. */
  polesPlanned: number;
  progressPercentage: number;
}

/**
 * O acompanhamento que o cliente abre, quando ele é espelho desta obra.
 *
 * Devolve null em dois casos: a obra ainda não tem portal espelhado (nasceu
 * antes desta versão, ou foi criada do zero sem orçamento), e a obra cujo
 * orçamento tem um acompanhamento legado marcado à mão, que o espelho não
 * adota de propósito.
 *
 * A leitura passa pela RLS de `work_trackings`, que exige ser dono do
 * orçamento. O engenheiro que importou a obra é quem abre esta tela, então na
 * prática enxerga; se não enxergar, o card simplesmente não aparece.
 */
export const getWorkTrackingLink = cache(async (
  supabase: SupabaseClient,
  workId: string,
): Promise<WorkTrackingLink | null> => {
  const { data } = await supabase
    .from('work_trackings')
    .select(
      'id, public_id, public_enabled, poles_installed, planned_poles, progress_percentage',
    )
    .eq('work_id', workId)
    .maybeSingle();

  if (!data) return null;

  return {
    trackingId: data.id as string,
    publicId: (data.public_id as string | null) ?? null,
    publicEnabled: data.public_enabled !== false,
    polesPublished: Number(data.poles_installed ?? 0),
    polesPlanned: Number(data.planned_poles ?? 0),
    progressPercentage: Number(data.progress_percentage ?? 0),
  };
});
