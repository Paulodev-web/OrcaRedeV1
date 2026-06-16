-- Soft-hide para postes do Portal do Engenheiro (sem DELETE).
-- Postes ocultos permanecem no banco com is_visible = false.

ALTER TABLE public.tracked_posts
  ADD COLUMN IF NOT EXISTS is_visible boolean NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_tracked_posts_tracking_visible
  ON public.tracked_posts (tracking_id, is_visible)
  WHERE is_visible = true;

-- Ocultar duplicatas em todas as obras: mantém o registro mais antigo visível por (tracking_id, name).
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY tracking_id, name
      ORDER BY created_at ASC NULLS LAST, id ASC
    ) AS rn
  FROM public.tracked_posts
  WHERE is_visible = true
)
UPDATE public.tracked_posts tp
SET is_visible = false, updated_at = now()
FROM ranked r
WHERE tp.id = r.id
  AND r.rn > 1;
