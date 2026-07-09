-- Retroativo: todo poste visível no mapa é considerado instalado (ícone sempre
-- renderizado verde em EngineerPortal/PublicWorkView), mas postes antigos ficaram
-- com status != 'Concluído', então o contador "Postes" ficava atrasado em relação
-- ao mapa. Postes ocultos (is_visible = false, soft-delete) NÃO são tocados aqui —
-- eles já são excluídos do contador em qualquer lugar (loadWorkTrackings só carrega
-- is_visible = true), e não devem passar a contar como instalados.

update tracked_posts
set status = 'Concluído', updated_at = now()
where is_visible = true
  and status <> 'Concluído';

-- Recalcula poles_installed de work_trackings a partir da contagem real de postes
-- visíveis e concluídos (mesma regra de countCompletedPoles no app).
with counts as (
  select tracking_id, count(*) as total
  from tracked_posts
  where is_visible = true
    and status = 'Concluído'
  group by tracking_id
)
update work_trackings wt
set poles_installed = coalesce(counts.total, 0),
    updated_at = now()
from counts
where counts.tracking_id = wt.id
  and coalesce(wt.poles_installed, 0) <> coalesce(counts.total, 0);

-- Recalcula progress_percentage com a mesma fórmula ponderada do app
-- (calculateWeightedProgress: Poste 50% / BT 25% / MT 15% / Equip 8% / Ilum 2%),
-- só para obras que têm ao menos uma meta definida (mesma regra do app: sem meta,
-- mantém o valor manual existente).
with ratios as (
  select
    id,
    case when coalesce(planned_poles, 0) > 0
      then least(coalesce(poles_installed, 0)::numeric / planned_poles, 1) else 0 end as r_poles,
    case when coalesce(planned_bt_meters, 0) > 0
      then least((coalesce(bt_extension_km, 0) * 1000) / planned_bt_meters, 1) else 0 end as r_bt,
    case when coalesce(planned_mt_meters, 0) > 0
      then least((coalesce(mt_extension_km, 0) * 1000) / planned_mt_meters, 1) else 0 end as r_mt,
    case when coalesce(planned_equipment, 0) > 0
      then least(coalesce(equipment_installed, 0)::numeric / planned_equipment, 1) else 0 end as r_equip,
    case when coalesce(planned_public_lighting, 0) > 0
      then least(coalesce(public_lighting_installed, 0)::numeric / planned_public_lighting, 1) else 0 end as r_light,
    (coalesce(planned_poles, 0) > 0 or coalesce(planned_bt_meters, 0) > 0 or coalesce(planned_mt_meters, 0) > 0
      or coalesce(planned_equipment, 0) > 0 or coalesce(planned_public_lighting, 0) > 0) as has_goal
  from work_trackings
)
update work_trackings wt
set progress_percentage = greatest(0, least(100, round(
      ratios.r_poles * 50 + ratios.r_bt * 25 + ratios.r_mt * 15 + ratios.r_equip * 8 + ratios.r_light * 2
    )))::int,
    updated_at = now()
from ratios
where ratios.id = wt.id
  and ratios.has_goal;
