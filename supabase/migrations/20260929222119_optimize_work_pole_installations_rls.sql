-- Consolida as politicas do fluxo campo/engenheiro e evita que auth.uid()
-- seja recalculado para cada linha. A semantica permanece a mesma:
-- gerente escreve apenas o proprio apontamento; engenheiro pode lancar e
-- aprovar apontamentos da obra da qual participa.

DROP POLICY IF EXISTS work_pole_installations_select
  ON public.work_pole_installations;
DROP POLICY IF EXISTS work_pole_installations_insert
  ON public.work_pole_installations;
DROP POLICY IF EXISTS work_pole_installations_insert_engineer
  ON public.work_pole_installations;
DROP POLICY IF EXISTS work_pole_installations_update
  ON public.work_pole_installations;
DROP POLICY IF EXISTS work_pole_installations_update_approval
  ON public.work_pole_installations;

CREATE POLICY work_pole_installations_select
  ON public.work_pole_installations
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
        FROM public.work_members wm
       WHERE wm.work_id = work_pole_installations.work_id
         AND wm.user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY work_pole_installations_insert_authorized
  ON public.work_pole_installations
  FOR INSERT
  TO authenticated
  WITH CHECK (
    created_by = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1
        FROM public.work_members wm
       WHERE wm.work_id = work_pole_installations.work_id
         AND wm.user_id = (SELECT auth.uid())
         AND wm.role IN ('manager', 'engineer')
    )
  );

CREATE POLICY work_pole_installations_update_authorized
  ON public.work_pole_installations
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
        FROM public.work_members wm
       WHERE wm.work_id = work_pole_installations.work_id
         AND wm.user_id = (SELECT auth.uid())
         AND (
           wm.role = 'engineer'
           OR (
             wm.role = 'manager'
             AND work_pole_installations.created_by = (SELECT auth.uid())
           )
         )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
        FROM public.work_members wm
       WHERE wm.work_id = work_pole_installations.work_id
         AND wm.user_id = (SELECT auth.uid())
         AND (
           wm.role = 'engineer'
           OR (
             wm.role = 'manager'
             AND work_pole_installations.created_by = (SELECT auth.uid())
           )
         )
    )
  );

CREATE INDEX IF NOT EXISTS idx_work_pole_installations_approved_by
  ON public.work_pole_installations (approved_by);
CREATE INDEX IF NOT EXISTS idx_work_pole_installations_created_by
  ON public.work_pole_installations (created_by);
CREATE INDEX IF NOT EXISTS idx_work_pole_installations_removed_by
  ON public.work_pole_installations (removed_by);
