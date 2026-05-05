-- =============================================================================
-- Fix: works SELECT RLS — adicionar fallback para engineer_id
--
-- A policy anterior exigia apenas work_members, o que falhava quando
-- auth.uid() era NULL (sessao expirada/middleware nao refrescando tokens).
-- Agora o engenheiro dono da obra sempre consegue ve-la, mesmo que
-- work_members esteja inconsistente ou auth.uid() nao bata com work_members.
-- =============================================================================

DROP POLICY IF EXISTS "works_select" ON public.works;
CREATE POLICY "works_select" ON public.works
  FOR SELECT
  USING (
    auth.uid() = engineer_id
    OR EXISTS (
      SELECT 1 FROM public.work_members wm
      WHERE wm.work_id = works.id
        AND wm.user_id = auth.uid()
    )
  );
