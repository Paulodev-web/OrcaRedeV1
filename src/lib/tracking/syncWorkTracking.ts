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

/** Progresso ponderado: Poste 50%, BT 25%, MT 15%, Equip 8%, Ilum 2% */
export function calculateWeightedProgress(tracking: Partial<WorkTracking>): number {
  const ratio = (installed: number, planned?: number) => {
    if (!planned || planned <= 0) return 0;
    return Math.min(installed / planned, 1);
  };

  const plannedMt = tracking.planned_mt_meters ?? 0;
  const plannedBt = tracking.planned_bt_meters ?? 0;
  const plannedPoles = tracking.planned_poles ?? 0;
  const plannedEquip = tracking.planned_equipment ?? 0;
  const plannedLighting = tracking.planned_public_lighting ?? 0;

  const hasAnyGoal = [plannedMt, plannedBt, plannedPoles, plannedEquip, plannedLighting].some((v) => v > 0);
  if (!hasAnyGoal) return tracking.progress_percentage ?? 0;

  const mtInstalledMeters = (tracking.mt_extension_km ?? 0) * 1000;
  const btInstalledMeters = (tracking.bt_extension_km ?? 0) * 1000;
  const polesInstalled = tracking.poles_installed ?? 0;
  const equipInstalled = tracking.equipment_installed ?? 0;
  const lightingInstalled = tracking.public_lighting_installed ?? 0;

  const progress =
    ratio(polesInstalled, plannedPoles) * 50 +
    ratio(btInstalledMeters, plannedBt) * 25 +
    ratio(mtInstalledMeters, plannedMt) * 15 +
    ratio(equipInstalled, plannedEquip) * 8 +
    ratio(lightingInstalled, plannedLighting) * 2;

  return Math.max(0, Math.min(100, Math.round(progress)));
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

  try {
    const syncProgress = calculateWeightedProgress(t);
    const workName = t.budget_data?.project_name ?? t.name;
    const clientName = t.budget_data?.client_name ?? null;

    const { data: workData, error: workError } = await supabase
      .from('work_trackings')
      .upsert(
        {
          public_id: t.id,
          budget_id: t.budget_id,
          name: workName,
          status: t.status,
          network_extension_km: t.network_extension_km ?? 0,
          progress_percentage: syncProgress,
          start_date: t.start_date || null,
          estimated_completion: t.estimated_completion || null,
          actual_completion: t.actual_completion || null,
          planned_network_meters: t.planned_network_meters ?? null,
          planned_mt_meters: t.planned_mt_meters ?? null,
          mt_extension_km: t.mt_extension_km ?? 0,
          planned_bt_meters: t.planned_bt_meters ?? null,
          bt_extension_km: t.bt_extension_km ?? 0,
          planned_poles: t.planned_poles ?? null,
          poles_installed: t.poles_installed ?? 0,
          planned_equipment: t.planned_equipment ?? null,
          equipment_installed: t.equipment_installed ?? 0,
          planned_public_lighting: t.planned_public_lighting ?? null,
          public_lighting_installed: t.public_lighting_installed ?? 0,
          plan_image_url: t.budget_data?.plan_image_url ?? null,
          client_logo_url: t.budget_data?.client_logo_url ?? null,
          client_name: clientName,
          city: t.budget_data?.city ?? null,
          current_focus_title: t.current_focus_title ?? null,
          current_focus_description: t.current_focus_description ?? null,
          project_description: t.project_description ?? null,
          responsible_person: t.responsible_person ?? null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'public_id' }
      )
      .select('id')
      .single();

    if (workError) throw workError;
    if (isStaleSync(opts)) return false;

    const trackingId = workData?.id;
    if (!trackingId) return false;

    const activePosts = (t.tracked_posts || []).filter(
      (p) => p.is_visible !== false && !isPostTombstoned(p, opts.deletedPostIds)
    );

    const postIdMap = new Map<string, string>();
    activePosts.forEach((p) => postIdMap.set(p.id, getDbPostId(p)));

    if (activePosts.length > 0) {
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
