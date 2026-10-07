-- Reunião 30/09, R5: conclusão direta pelo engenheiro, com auditoria atômica.
BEGIN;
CREATE OR REPLACE FUNCTION public.work_milestones_protect_fields()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, auth AS $$
DECLARE v_role text;
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.work_id IS DISTINCT FROM OLD.work_id
    OR NEW.code IS DISTINCT FROM OLD.code OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Colunas imutaveis nao podem ser alteradas em work_milestones';
  END IF;
  SELECT role INTO v_role FROM public.work_members
   WHERE work_id = NEW.work_id AND user_id = auth.uid();
  IF v_role IS NULL THEN RAISE EXCEPTION 'Usuario nao e membro da obra'; END IF;

  IF NEW.name IS DISTINCT FROM OLD.name OR NEW.order_index IS DISTINCT FROM OLD.order_index THEN
    IF v_role <> 'engineer' THEN RAISE EXCEPTION 'Apenas o engenheiro pode renomear ou reordenar marcos'; END IF;
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      RAISE EXCEPTION 'Nao e possivel alterar nome/ordem e status na mesma operacao';
    END IF;
    RETURN NEW;
  END IF;

  IF v_role = 'engineer' THEN
    IF OLD.status IN ('pending','in_progress','rejected','awaiting_approval') AND NEW.status = 'approved' THEN
      IF NEW.approved_by IS DISTINCT FROM auth.uid() THEN
        RAISE EXCEPTION 'approved_by deve ser o engenheiro que aprovou';
      END IF;
      IF NEW.approved_at IS NULL THEN RAISE EXCEPTION 'approved_at obrigatorio na aprovacao do marco'; END IF;
    ELSIF OLD.status = 'awaiting_approval' AND NEW.status = 'rejected' THEN
      IF NEW.rejected_at IS NULL THEN RAISE EXCEPTION 'rejected_at obrigatorio na rejeicao do marco'; END IF;
    ELSIF OLD.status = NEW.status THEN NULL;
    ELSE RAISE EXCEPTION 'Transicao de marco nao permitida para engenheiro: % para %', OLD.status, NEW.status;
    END IF;
  ELSIF v_role = 'manager' THEN
    IF OLD.status IN ('pending','in_progress','rejected') AND NEW.status = 'awaiting_approval' THEN
      IF NEW.reported_by IS DISTINCT FROM auth.uid() THEN
        RAISE EXCEPTION 'reported_by deve ser o gerente que reportou';
      END IF;
      IF NEW.reported_at IS NULL THEN RAISE EXCEPTION 'reported_at obrigatorio ao reportar marco'; END IF;
      IF NEW.approved_by IS NOT NULL OR NEW.approved_at IS NOT NULL THEN
        RAISE EXCEPTION 'approved_by e approved_at devem ser nulos ao re-reportar';
      END IF;
    ELSIF OLD.status = 'pending' AND NEW.status = 'in_progress' THEN NULL;
    ELSIF OLD.status = NEW.status THEN NULL;
    ELSE RAISE EXCEPTION 'Manager nao pode transicionar marco de % para %', OLD.status, NEW.status;
    END IF;
  ELSE RAISE EXCEPTION 'Papel invalido em work_milestones';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_work_milestone(p_milestone_id uuid, p_comment text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, auth AS $$
DECLARE v_milestone public.work_milestones%ROWTYPE; v_comment text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Usuario nao autenticado'; END IF;
  SELECT * INTO v_milestone FROM public.work_milestones WHERE id = p_milestone_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Marco nao encontrado'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.work_members
    WHERE work_id = v_milestone.work_id AND user_id = auth.uid() AND role = 'engineer') THEN
    RAISE EXCEPTION 'Apenas o engenheiro da obra pode concluir marcos';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.works WHERE id = v_milestone.work_id AND status <> 'cancelled') THEN
    RAISE EXCEPTION 'Obra cancelada ou indisponivel';
  END IF;
  -- Reenvio ou clique duplo não cria outra aprovação nem outro evento.
  IF v_milestone.status = 'approved' THEN RETURN v_milestone.work_id; END IF;
  v_comment := NULLIF(btrim(p_comment), '');
  IF length(v_comment) > 1000 THEN RAISE EXCEPTION 'Comentario muito longo'; END IF;
  IF v_comment IS NULL AND v_milestone.status <> 'awaiting_approval' THEN
    v_comment := 'Conclusão registrada diretamente pelo engenheiro.';
  END IF;
  UPDATE public.work_milestones SET status = 'approved', approved_by = auth.uid(), approved_at = now()
    WHERE id = p_milestone_id;
  INSERT INTO public.work_milestone_events (milestone_id, work_id, event_type, actor_id, actor_role, notes)
    VALUES (p_milestone_id, v_milestone.work_id, 'approved', auth.uid(), 'engineer', v_comment);
  RETURN v_milestone.work_id;
END;
$$;
REVOKE ALL ON FUNCTION public.complete_work_milestone(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_work_milestone(uuid, text) TO authenticated;
COMMIT;
