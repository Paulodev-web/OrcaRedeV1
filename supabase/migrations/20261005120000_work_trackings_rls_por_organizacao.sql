-- O acompanhamento (work_trackings, tracked_posts, post_connections) ficou de
-- fora da virada para organizacao: as policies ainda exigiam
-- `budgets.user_id = auth.uid()`, ou seja, so quem CRIOU o orcamento gravava.
-- `budgets` ja libera qualquer membro da org (`org_id = current_org_id()`), entao
-- outro membro abria o Portal do Engenheiro, via a obra e, ao salvar, o upsert
-- era barrado pelo RLS e a tela mostrava "Nao foi possivel salvar no servidor".
--
-- Aqui o caminho "dono do orcamento" passa a ser "mesma organizacao do
-- orcamento", igual a `budgets`. O caminho do engenheiro da obra
-- (work_members) e a leitura publica ficam como estavam.

DROP POLICY IF EXISTS work_trackings_insert_budget_owner ON public.work_trackings;
CREATE POLICY work_trackings_insert_budget_owner
  ON public.work_trackings
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
        FROM public.budgets b
       WHERE b.id = work_trackings.budget_id
         AND b.org_id = (SELECT current_org_id())
    )
  );

DROP POLICY IF EXISTS work_trackings_select_authorized ON public.work_trackings;
CREATE POLICY work_trackings_select_authorized
  ON public.work_trackings
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
        FROM public.budgets b
       WHERE b.id = work_trackings.budget_id
         AND b.org_id = (SELECT current_org_id())
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

DROP POLICY IF EXISTS work_trackings_update_authorized ON public.work_trackings;
CREATE POLICY work_trackings_update_authorized
  ON public.work_trackings
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
        FROM public.budgets b
       WHERE b.id = work_trackings.budget_id
         AND b.org_id = (SELECT current_org_id())
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
         AND b.org_id = (SELECT current_org_id())
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

DROP POLICY IF EXISTS work_trackings_delete_legacy_owner ON public.work_trackings;
CREATE POLICY work_trackings_delete_legacy_owner
  ON public.work_trackings
  FOR DELETE
  TO authenticated
  USING (
    work_id IS NULL
    AND budget_id IN (
      SELECT b.id
        FROM public.budgets b
       WHERE b.org_id = (SELECT current_org_id())
    )
  );

DROP POLICY IF EXISTS tracked_posts_manage_budget_owner ON public.tracked_posts;
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
         AND b.org_id = (SELECT current_org_id())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
        FROM public.work_trackings wt
        JOIN public.budgets b ON b.id = wt.budget_id
       WHERE wt.id = tracked_posts.tracking_id
         AND b.org_id = (SELECT current_org_id())
    )
  );

DROP POLICY IF EXISTS post_connections_manage_budget_owner ON public.post_connections;
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
         AND b.org_id = (SELECT current_org_id())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
        FROM public.work_trackings wt
        JOIN public.budgets b ON b.id = wt.budget_id
       WHERE wt.id = post_connections.tracking_id
         AND b.org_id = (SELECT current_org_id())
    )
  );
