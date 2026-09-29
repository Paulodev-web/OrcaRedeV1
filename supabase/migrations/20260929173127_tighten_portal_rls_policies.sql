-- Remove policies herdadas com TO public, elimina avaliacoes de auth.uid() por
-- linha e deixa USING/WITH CHECK simetricos nas escritas.

DROP POLICY IF EXISTS "Users can insert own work trackings"
  ON public.work_trackings;
DROP POLICY IF EXISTS "Users can view own work trackings"
  ON public.work_trackings;
DROP POLICY IF EXISTS "Users can update own work trackings"
  ON public.work_trackings;
DROP POLICY IF EXISTS work_trackings_select_work_engineer
  ON public.work_trackings;
DROP POLICY IF EXISTS work_trackings_update_work_engineer
  ON public.work_trackings;

CREATE POLICY work_trackings_insert_budget_owner
  ON public.work_trackings
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
        FROM public.budgets b
       WHERE b.id = work_trackings.budget_id
         AND b.user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY work_trackings_select_authorized
  ON public.work_trackings
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
        FROM public.budgets b
       WHERE b.id = work_trackings.budget_id
         AND b.user_id = (SELECT auth.uid())
    )
    OR (
      work_id IS NOT NULL
      AND EXISTS (
        SELECT 1
          FROM public.work_members wm
         WHERE wm.work_id = work_trackings.work_id
           AND wm.user_id = (SELECT auth.uid())
           AND wm.role = 'engineer'
      )
    )
  );

CREATE POLICY work_trackings_update_authorized
  ON public.work_trackings
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
        FROM public.budgets b
       WHERE b.id = work_trackings.budget_id
         AND b.user_id = (SELECT auth.uid())
    )
    OR (
      work_id IS NOT NULL
      AND EXISTS (
        SELECT 1
          FROM public.work_members wm
         WHERE wm.work_id = work_trackings.work_id
           AND wm.user_id = (SELECT auth.uid())
           AND wm.role = 'engineer'
      )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
        FROM public.budgets b
       WHERE b.id = work_trackings.budget_id
         AND b.user_id = (SELECT auth.uid())
    )
    OR (
      work_id IS NOT NULL
      AND EXISTS (
        SELECT 1
          FROM public.work_members wm
         WHERE wm.work_id = work_trackings.work_id
           AND wm.user_id = (SELECT auth.uid())
           AND wm.role = 'engineer'
      )
    )
  );

DROP POLICY IF EXISTS "Users can manage own tracked posts"
  ON public.tracked_posts;
DROP POLICY IF EXISTS "Users can view own tracked posts"
  ON public.tracked_posts;

CREATE POLICY tracked_posts_manage_budget_owner
  ON public.tracked_posts
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
        FROM public.work_trackings wt
        JOIN public.budgets b ON b.id = wt.budget_id
       WHERE wt.id = tracked_posts.tracking_id
         AND b.user_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
        FROM public.work_trackings wt
        JOIN public.budgets b ON b.id = wt.budget_id
       WHERE wt.id = tracked_posts.tracking_id
         AND b.user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users can manage own post connections"
  ON public.post_connections;

CREATE POLICY post_connections_manage_budget_owner
  ON public.post_connections
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
        FROM public.work_trackings wt
        JOIN public.budgets b ON b.id = wt.budget_id
       WHERE wt.id = post_connections.tracking_id
         AND b.user_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
        FROM public.work_trackings wt
        JOIN public.budgets b ON b.id = wt.budget_id
       WHERE wt.id = post_connections.tracking_id
         AND b.user_id = (SELECT auth.uid())
    )
  );

CREATE INDEX IF NOT EXISTS idx_post_connections_to_post_id
  ON public.post_connections (to_post_id);
