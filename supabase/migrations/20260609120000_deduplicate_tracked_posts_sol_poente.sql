-- Remove postes duplicados no Portal do Engenheiro (mesmo nome na mesma obra).
-- Obra afetada: Loteamento Sol Poente (tracking-1772804692104).
-- Mantém o registro mais antigo por (tracking_id, name); remove conexões órfãs.

WITH affected_tracking AS (
  SELECT id
  FROM public.work_trackings
  WHERE public_id = 'tracking-1772804692104'
),
ranked_posts AS (
  SELECT
    tp.id,
    ROW_NUMBER() OVER (
      PARTITION BY tp.tracking_id, tp.name
      ORDER BY tp.created_at ASC NULLS LAST, tp.id ASC
    ) AS rn
  FROM public.tracked_posts tp
  INNER JOIN affected_tracking at ON at.id = tp.tracking_id
),
posts_to_delete AS (
  SELECT id FROM ranked_posts WHERE rn > 1
)
DELETE FROM public.post_connections pc
WHERE pc.from_post_id IN (SELECT id FROM posts_to_delete)
   OR pc.to_post_id IN (SELECT id FROM posts_to_delete);

WITH affected_tracking AS (
  SELECT id
  FROM public.work_trackings
  WHERE public_id = 'tracking-1772804692104'
),
ranked_posts AS (
  SELECT
    tp.id,
    ROW_NUMBER() OVER (
      PARTITION BY tp.tracking_id, tp.name
      ORDER BY tp.created_at ASC NULLS LAST, tp.id ASC
    ) AS rn
  FROM public.tracked_posts tp
  INNER JOIN affected_tracking at ON at.id = tp.tracking_id
)
DELETE FROM public.tracked_posts tp
USING ranked_posts rp
WHERE tp.id = rp.id
  AND rp.rn > 1;

-- Remove conexões cujos postes não existem mais nesta obra
DELETE FROM public.post_connections pc
USING public.work_trackings wt
WHERE wt.public_id = 'tracking-1772804692104'
  AND pc.tracking_id = wt.id
  AND (
    NOT EXISTS (SELECT 1 FROM public.tracked_posts tp WHERE tp.id = pc.from_post_id)
    OR NOT EXISTS (SELECT 1 FROM public.tracked_posts tp WHERE tp.id = pc.to_post_id)
  );
