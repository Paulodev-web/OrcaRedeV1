-- Read-only release gate for the Andamento de Obra -> Portal do Cliente link.
-- Run after migrations against dev/staging/prod. Any failed invariant raises.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'work_pole_installations'
       AND column_name = 'project_post_id'
  ) THEN
    RAISE EXCEPTION 'missing work_pole_installations.project_post_id';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'work_trackings'
       AND column_name = 'public_enabled'
       AND is_nullable = 'NO'
  ) THEN
    RAISE EXCEPTION 'missing required work_trackings.public_enabled';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.work_pole_installations'::regclass
       AND conname = 'work_pole_installations_project_post_id_fkey'
  ) THEN
    RAISE EXCEPTION 'missing project_post_id foreign key';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
     WHERE schemaname = 'public'
       AND tablename = 'tracked_posts'
       AND indexname = 'idx_tracked_posts_tracking_client'
       AND indexdef ILIKE '%UNIQUE%'
       AND indexdef ILIKE '%WHERE%client_id IS NOT NULL%'
  ) THEN
    RAISE EXCEPTION 'missing tracked_posts mirror idempotency index';
  END IF;
END $$;

DO $$
DECLARE
  v_name text;
BEGIN
  FOREACH v_name IN ARRAY ARRAY[
    'ensure_work_tracking',
    'refresh_work_tracking_progress',
    'sync_work_client_timeline',
    'build_work_client_timeline',
    'sync_work_tracking_from_work',
    'on_work_milestone_sync_timeline',
    'on_work_tracking_link_sync_timeline',
    'on_pole_installation_sync_tracking'
  ]
  LOOP
    IF EXISTS (
      SELECT 1
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public'
         AND p.proname = v_name
         AND (
           has_function_privilege('anon', p.oid, 'EXECUTE')
           OR has_function_privilege('authenticated', p.oid, 'EXECUTE')
         )
    ) THEN
      RAISE EXCEPTION 'internal function % is exposed to Data API roles', v_name;
    END IF;
  END LOOP;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT work_id
      FROM public.work_trackings
     WHERE work_id IS NOT NULL
     GROUP BY work_id
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'more than one portal linked to the same work';
  END IF;

  IF EXISTS (
    SELECT tracking_id, client_id
      FROM public.tracked_posts
     WHERE client_id IS NOT NULL
     GROUP BY tracking_id, client_id
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'duplicate mirrored post identity';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.work_trackings t
      JOIN public.works w ON w.id = t.work_id
     WHERE w.status = 'cancelled'
       AND t.public_enabled
  ) THEN
    RAISE EXCEPTION 'cancelled work still has a public portal';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.work_trackings t
     WHERE t.work_id IS NOT NULL
       AND t.public_id IS NULL
  ) THEN
    RAISE EXCEPTION 'mirrored portal without a public_id';
  END IF;
END $$;

SELECT
  count(*) FILTER (WHERE work_id IS NOT NULL) AS mirrored_portals,
  count(*) FILTER (WHERE work_id IS NULL) AS legacy_portals,
  count(*) FILTER (WHERE public_enabled) AS published_portals,
  count(*) FILTER (WHERE NOT public_enabled) AS unpublished_portals
FROM public.work_trackings;
