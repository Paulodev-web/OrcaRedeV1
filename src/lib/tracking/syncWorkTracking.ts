import type { SupabaseClient } from '@supabase/supabase-js';
import type { WorkTracking } from '@/types';
import {
  getDbPostId,
  getPostClientId,
  isPostTombstoned,
  toValidUuid,
} from './trackingUtils';

export type SyncWorkTrackingOptions = {
  deletedPostIds: ReadonlySet<string>;
  syncGeneration: number;
  getCurrentGeneration: () => number;
  onConnectionError?: (message: string) => void;
};

function isStaleSync(opts: SyncWorkTrackingOptions): boolean {
  return opts.syncGeneration !== opts.getCurrentGeneration();
}

/**
 * Progresso ponderado: Poste 50, BT 25, MT 15, Equip 8, Ilum 2.
 *
 * **Acompanhamento espelhado** divide pelo peso das metas que existem, não por
 * 100 fixo. Sem isso, obra só de postes trava em 50% com tudo levantado: os 25
 * pontos de BT e os 15 de MT ficam no chão porque a obra nunca teve meta de
 * metros, e o cliente lê "metade" numa obra pronta.
 *
 * **Acompanhamento legado** continua na conta antiga, de propósito. Esses links
 * já estão na mão de cliente há meses; trocar o divisor faria a barra pular
 * sozinha num dia qualquer, sem nada ter acontecido na obra. O Loteamento Sol
 * Poente, por exemplo, sairia de 11% para 22% sem um poste a mais no chão. A
 * regra nova vale para o que nasce espelhado.
 *
 * Gêmea de `refresh_work_tracking_progress` no banco, que é quem calcula o
 * número dos espelhados. As duas precisam concordar.
 */
export function calculateWeightedProgress(tracking: Partial<WorkTracking>): number {
  const goals: Array<{ weight: number; installed: number; planned: number }> = [
    { weight: 50, installed: tracking.poles_installed ?? 0, planned: tracking.planned_poles ?? 0 },
    { weight: 25, installed: (tracking.bt_extension_km ?? 0) * 1000, planned: tracking.planned_bt_meters ?? 0 },
    { weight: 15, installed: (tracking.mt_extension_km ?? 0) * 1000, planned: tracking.planned_mt_meters ?? 0 },
    { weight: 8, installed: tracking.equipment_installed ?? 0, planned: tracking.planned_equipment ?? 0 },
    { weight: 2, installed: tracking.public_lighting_installed ?? 0, planned: tracking.planned_public_lighting ?? 0 },
  ];

  const mirrored = Boolean(tracking.work_id);

  let totalWeight = 0;
  let achieved = 0;
  for (const goal of goals) {
    if (goal.planned <= 0) continue;
    totalWeight += goal.weight;
    achieved += goal.weight * Math.min(goal.installed / goal.planned, 1);
  }

  if (totalWeight === 0) return tracking.progress_percentage ?? 0;

  const divisor = mirrored ? totalWeight : 100;
  return Math.max(0, Math.min(100, Math.round((achieved / divisor) * 100)));
}

/**
 * Persiste uma obra e seus postes/conexões no Supabase (upsert only).
 * Respeita tombstones e aborta se a geração de sync mudou (evita race com delete).
 */
export async function syncWorkTrackingToSupabase(
  supabase: SupabaseClient,
  t: WorkTracking,
  opts: SyncWorkTrackingOptions
): Promise<boolean> {
  if (!t.budget_id) return false;
  if (isStaleSync(opts)) return false;

  // Acompanhamento espelhado tem um dono só: o Andamento de Obra. Postes,
  // conexões, contadores e progresso são escritos pelo banco quando o
  // engenheiro aprova o que o campo levantou. Se este sync também escrevesse,
  // o estado local (que pode estar velho na aba aberta desde ontem) apagaria
  // poste aceso em campo. Aqui só passam os campos de apresentação: descrição,
  // foco atual, fotos e responsável, que não existem do outro lado.
  const mirrored = Boolean(t.work_id);

  try {
    const syncProgress = calculateWeightedProgress(t);
    const workName = t.budget_data?.project_name ?? t.name;
    const clientName = t.budget_data?.client_name ?? null;

    // Campos de apresentação: existem só no Portal e o engenheiro continua
    // dono deles, espelhado ou não.
    const presentation = {
      public_id: t.id,
      budget_id: t.budget_id,
      network_extension_km: t.network_extension_km ?? 0,
      planned_network_meters: t.planned_network_meters ?? null,
      planned_mt_meters: t.planned_mt_meters ?? null,
      mt_extension_km: t.mt_extension_km ?? 0,
      planned_bt_meters: t.planned_bt_meters ?? null,
      bt_extension_km: t.bt_extension_km ?? 0,
      planned_equipment: t.planned_equipment ?? null,
      equipment_installed: t.equipment_installed ?? 0,
      planned_public_lighting: t.planned_public_lighting ?? null,
      public_lighting_installed: t.public_lighting_installed ?? 0,
      client_logo_url: t.budget_data?.client_logo_url ?? null,
      current_focus_title: t.current_focus_title ?? null,
      current_focus_description: t.current_focus_description ?? null,
      project_description: t.project_description ?? null,
      responsible_person: t.responsible_person ?? null,
      updated_at: new Date().toISOString(),
    };

    // Estes o Andamento de Obra escreve por conta própria quando é espelho.
    const derived = {
      name: workName,
      status: t.status,
      progress_percentage: syncProgress,
      start_date: t.start_date || null,
      estimated_completion: t.estimated_completion || null,
      actual_completion: t.actual_completion || null,
      planned_poles: t.planned_poles ?? null,
      poles_installed: t.poles_installed ?? 0,
      plan_image_url: t.budget_data?.plan_image_url ?? null,
      client_name: clientName,
      city: t.budget_data?.city ?? null,
    };

    const { data: workData, error: workError } = await supabase
      .from('work_trackings')
      .upsert(
        mirrored ? presentation : { ...presentation, ...derived },
        { onConflict: 'public_id' }
      )
      .select('id')
      .single();

    if (workError) throw workError;
    if (isStaleSync(opts)) return false;

    const trackingId = workData?.id;
    if (!trackingId) return false;

    // Espelho: o poste tem dono do outro lado, a linha de rede não.
    //
    // A rede do mapa do cliente sempre foi desenhada à mão aqui, e continua
    // sendo: não existe nada no Andamento de Obra que a produza (o que o campo
    // registra são `work_network_spans`, outra coisa, ainda não ligada a este
    // mapa). Se este sync pulasse as conexões junto com os postes, o mapa do
    // cliente ficaria com poste solto e nenhuma linha, para sempre.
    if (mirrored) {
      // Equipamento e metros ainda são digitados aqui e entram na conta do
      // progresso. Quem sabe fazer essa conta do lado espelhado é o banco, que
      // também tem a contagem de postes atualizada. Uma chamada, e o número
      // que o cliente lê volta a bater.
      const { error: mirrorError } = await supabase.rpc('sync_work_tracking_from_work', {
        p_work_id: t.work_id,
      });
      if (mirrorError) {
        console.warn('Ressincronia do acompanhamento espelhado:', mirrorError.message);
      }
    }

    const activePosts = (t.tracked_posts || []).filter(
      (p) => p.is_visible !== false && !isPostTombstoned(p, opts.deletedPostIds)
    );

    // O mapa de ids é montado nos dois casos, porque as conexões precisam dele
    // para traduzir poste local em linha do banco. Só a escrita dos postes é
    // que não acontece no espelho.
    const postIdMap = new Map<string, string>();
    activePosts.forEach((p) => postIdMap.set(p.id, getDbPostId(p)));

    if (!mirrored && activePosts.length > 0) {
      const postsToUpsert = activePosts.map((post) => ({
        id: postIdMap.get(post.id)!,
        client_id: getPostClientId(post),
        tracking_id: trackingId,
        original_post_id: toValidUuid(post.original_post_id || getPostClientId(post)),
        name: post.name,
        custom_name: post.custom_name || null,
        x_coord: post.x_coord,
        y_coord: post.y_coord,
        status: post.status,
        installation_date: post.installation_date || null,
        completion_date: post.completion_date || null,
        notes: post.notes || null,
        is_visible: true,
        updated_at: new Date().toISOString(),
      }));

      const { error: postsError } = await supabase
        .from('tracked_posts')
        .upsert(postsToUpsert, { onConflict: 'id' });

      if (postsError) throw postsError;
    }

    if (isStaleSync(opts)) return false;

    if (t.post_connections?.length > 0) {
      const pairKey = (a: string, b: string, type: string) => `${[a, b].sort().join('|')}|${type}`;
      const seenPairs = new Set<string>();
      const deduped = t.post_connections.filter((conn) => {
        const key = pairKey(conn.from_post_id, conn.to_post_id, conn.connection_type ?? 'blue');
        if (seenPairs.has(key)) return false;
        seenPairs.add(key);
        return true;
      });

      const connectionsToUpsert = deduped.map((conn) => {
        const fromId = postIdMap.get(conn.from_post_id) ?? toValidUuid(conn.from_post_id);
        const toId = postIdMap.get(conn.to_post_id) ?? toValidUuid(conn.to_post_id);
        return {
          id: toValidUuid(conn.id),
          client_id: `${conn.connection_type ?? 'blue'}:${conn.id}`,
          tracking_id: trackingId,
          from_post_id: fromId,
          to_post_id: toId,
          connection_type: (conn.connection_type ?? 'blue') as 'blue' | 'green',
          status: 'Pendente',
        };
      });

      const seen = new Set<string>();
      connectionsToUpsert.forEach((c) => {
        if (seen.has(c.id)) {
          (c as { id: string }).id = crypto.randomUUID();
        }
        seen.add(c.id);
      });

      const { error: connError } = await supabase
        .from('post_connections')
        .upsert(connectionsToUpsert, { onConflict: 'id' });

      if (connError) {
        console.error('Erro ao salvar conexões de rede:', connError);
        opts.onConnectionError?.(connError.message);
      }
    }

    return !isStaleSync(opts);
  } catch (e) {
    console.warn('Sync obra/postes para Supabase:', e);
    return false;
  }
}
