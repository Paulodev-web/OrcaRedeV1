-- Marcos da obra eram fixos: 6 por obra, criados so pelo trigger
-- seed_work_defaults, sem policy de INSERT/DELETE, e o trigger
-- work_milestones_protect_fields travava qualquer alteracao de name/order_index.
-- Isso impedia o engenheiro de adicionar, renomear ou excluir marcos.
--
-- Regras adotadas (escopo: so o engineer membro da obra gerencia a lista):
--   - INSERT: so engineer, e so com status inicial 'pending'.
--   - DELETE: so engineer, e so quando status='pending' (marco nunca
--     reportado) -- work_milestone_events tem FK ON DELETE CASCADE em
--     milestone_id, entao apagar um marco com historico destruiria a
--     trilha de auditoria de aprovacao/rejeicao.
--   - UPDATE de name/order_index: liberado para engineer via trigger,
--     desde que a mesma operacao nao mude o status (mantem separado do
--     fluxo de transicao reportar/aprovar/rejeitar). Manager continua sem
--     poder tocar em name/order_index.

-- -----------------------------------------------------------------------------
-- 1. INSERT — engineer membro da obra
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "work_milestones_insert" ON public.work_milestones;
CREATE POLICY "work_milestones_insert" ON public.work_milestones
  FOR INSERT
  WITH CHECK (
    status = 'pending'
    AND EXISTS (
      SELECT 1 FROM public.work_members wm
      WHERE wm.work_id = work_milestones.work_id
        AND wm.user_id = auth.uid()
        AND wm.role = 'engineer'
    )
  );

-- -----------------------------------------------------------------------------
-- 2. DELETE — engineer membro da obra, so marco nunca reportado
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "work_milestones_delete" ON public.work_milestones;
CREATE POLICY "work_milestones_delete" ON public.work_milestones
  FOR DELETE
  USING (
    status = 'pending'
    AND EXISTS (
      SELECT 1 FROM public.work_members wm
      WHERE wm.work_id = work_milestones.work_id
        AND wm.user_id = auth.uid()
        AND wm.role = 'engineer'
    )
  );

-- -----------------------------------------------------------------------------
-- 3. work_milestones_protect_fields — libera rename/reorder para engineer
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.work_milestones_protect_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_role TEXT;
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.work_id IS DISTINCT FROM OLD.work_id
     OR NEW.code IS DISTINCT FROM OLD.code
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'Colunas imutaveis nao podem ser alteradas em work_milestones';
  END IF;

  SELECT role INTO v_role
    FROM public.work_members
   WHERE work_id = NEW.work_id
     AND user_id = auth.uid();

  IF v_role IS NULL THEN
    RAISE EXCEPTION 'Usuario nao e membro da obra';
  END IF;

  -- Rename/reorder: operacao separada do fluxo de status, so engineer.
  IF NEW.name IS DISTINCT FROM OLD.name OR NEW.order_index IS DISTINCT FROM OLD.order_index THEN
    IF v_role <> 'engineer' THEN
      RAISE EXCEPTION 'Apenas o engenheiro pode renomear ou reordenar marcos';
    END IF;
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      RAISE EXCEPTION 'Nao e possivel alterar nome/ordem e status na mesma operacao';
    END IF;
    RETURN NEW;
  END IF;

  IF v_role = 'engineer' THEN
    IF OLD.status = 'awaiting_approval' AND NEW.status = 'approved' THEN
      IF NEW.approved_by IS DISTINCT FROM auth.uid() THEN
        RAISE EXCEPTION 'approved_by deve ser o engenheiro que aprovou';
      END IF;
      IF NEW.approved_at IS NULL THEN
        RAISE EXCEPTION 'approved_at obrigatorio na aprovacao do marco';
      END IF;
    ELSIF OLD.status = 'awaiting_approval' AND NEW.status = 'rejected' THEN
      IF NEW.rejected_at IS NULL THEN
        RAISE EXCEPTION 'rejected_at obrigatorio na rejeicao do marco';
      END IF;
    ELSIF OLD.status = NEW.status THEN
      NULL;
    ELSE
      RAISE EXCEPTION 'Engineer so pode aprovar/rejeitar marcos em awaiting_approval (atual %, novo %)',
        OLD.status, NEW.status;
    END IF;
  ELSIF v_role = 'manager' THEN
    IF OLD.status IN ('pending','in_progress','rejected') AND NEW.status = 'awaiting_approval' THEN
      IF NEW.reported_by IS DISTINCT FROM auth.uid() THEN
        RAISE EXCEPTION 'reported_by deve ser o gerente que reportou';
      END IF;
      IF NEW.reported_at IS NULL THEN
        RAISE EXCEPTION 'reported_at obrigatorio ao reportar marco';
      END IF;
      -- Limpar campos de aprovacao previa, se vinha de rejected.
      IF NEW.approved_by IS DISTINCT FROM NULL OR NEW.approved_at IS DISTINCT FROM NULL THEN
        RAISE EXCEPTION 'approved_by e approved_at devem ser nulos ao re-reportar';
      END IF;
    ELSIF OLD.status = 'pending' AND NEW.status = 'in_progress' THEN
      -- Transicao opcional para visibilidade. Sem campos de approval mexidos.
      NULL;
    ELSIF OLD.status = NEW.status THEN
      NULL;
    ELSE
      RAISE EXCEPTION 'Manager nao pode transicionar marco de % para %', OLD.status, NEW.status;
    END IF;
  ELSE
    RAISE EXCEPTION 'Papel invalido em work_milestones_protect_fields: %', v_role;
  END IF;

  RETURN NEW;
END;
$$;

ALTER FUNCTION public.work_milestones_protect_fields()
  SET search_path = public, auth;
