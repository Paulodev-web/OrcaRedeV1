-- Reunião 30/09: aplicar no SQL Editor antes de liberar o frontend.
-- Requer as migrations anteriores já presentes em main (base 79f6eaa).
-- Este pacote contém somente as quatro migrations desta entrega.
-- Não registra histórico supabase_migrations; reconciliar antes de usar db push.
-- Executar todo o arquivo de uma vez. Em erro, a transação inteira é desfeita.
BEGIN;

-- MIGRATION: 20261006003736_meeting_direct_milestone_completion.sql
-- Reunião 30/09, R5: conclusão direta pelo engenheiro, com auditoria atômica.

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


-- MIGRATION: 20261006003950_meeting_standalone_work_portal.sql
-- R1: uma obra sem orçamento também tem identidade e portal próprios.

ALTER TABLE public.work_trackings ALTER COLUMN budget_id DROP NOT NULL;

CREATE OR REPLACE FUNCTION public.ensure_work_tracking(p_work_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_work record; v_budget record; v_tracking_id uuid; v_legado integer; v_status text; v_public_id text;
BEGIN
  -- Serializa chamadas concorrentes antes de criar a identidade pública.
  SELECT id, name, client_name, budget_id, status, started_at, expected_end_at, completed_at
    INTO v_work FROM public.works WHERE id = p_work_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Obra % nao encontrada', p_work_id; END IF;
  SELECT id, project_name, client_name, city, plan_image_url INTO v_budget
    FROM public.budgets WHERE id = v_work.budget_id;
  IF v_work.budget_id IS NOT NULL AND NOT FOUND THEN RETURN NULL; END IF;

  SELECT id INTO v_tracking_id FROM public.work_trackings WHERE work_id = p_work_id;
  IF v_tracking_id IS NULL AND v_work.budget_id IS NOT NULL THEN
    SELECT id INTO v_tracking_id FROM public.work_trackings
      WHERE budget_id = v_work.budget_id AND work_id IS NULL ORDER BY created_at LIMIT 1;
    IF v_tracking_id IS NOT NULL THEN
      SELECT count(*) INTO v_legado FROM public.tracked_posts
        WHERE tracking_id = v_tracking_id AND (client_id IS NULL
          OR (client_id NOT LIKE 'orcamento:%' AND client_id NOT LIKE 'campo:%'));
      IF v_legado > 0 THEN RETURN NULL; END IF;
      UPDATE public.work_trackings SET work_id = p_work_id WHERE id = v_tracking_id;
    END IF;
  END IF;
  IF v_tracking_id IS NULL THEN
    INSERT INTO public.work_trackings (budget_id, work_id, name, status, public_id)
      VALUES (v_work.budget_id, p_work_id, v_work.name, 'Planejado', 'tracking-' || replace(gen_random_uuid()::text, '-', ''))
      RETURNING id INTO v_tracking_id;
  END IF;
  SELECT public_id INTO v_public_id FROM public.work_trackings WHERE id = v_tracking_id;
  v_status := CASE v_work.status WHEN 'planned' THEN 'Planejado' WHEN 'in_progress' THEN 'Em Andamento'
    WHEN 'paused' THEN 'Pausado' WHEN 'completed' THEN 'Concluído' ELSE NULL END;
  UPDATE public.work_trackings t SET
    name = COALESCE(NULLIF(btrim(v_work.name), ''), v_budget.project_name, t.name),
    client_name = COALESCE(v_work.client_name, v_budget.client_name),
    city = v_budget.city,
    plan_image_url = CASE WHEN v_work.budget_id IS NOT NULL THEN v_budget.plan_image_url
      WHEN EXISTS (SELECT 1 FROM public.work_project_snapshot WHERE work_id = p_work_id AND pdf_storage_path IS NOT NULL)
        THEN '/api/obra/' || v_public_id || '/planta.pdf' ELSE NULL END,
    start_date = v_work.started_at, estimated_completion = v_work.expected_end_at,
    actual_completion = (v_work.completed_at AT TIME ZONE 'America/Sao_Paulo')::date,
    status = COALESCE(v_status, t.status), updated_at = now()
    WHERE t.id = v_tracking_id;
  RETURN v_tracking_id;
END;
$$;
REVOKE ALL ON FUNCTION public.ensure_work_tracking(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_work_tracking(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.create_standalone_work_portal()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.sync_work_tracking_from_work(NEW.id);
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.create_standalone_work_portal() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS zz_create_standalone_work_portal ON public.works;
CREATE TRIGGER zz_create_standalone_work_portal AFTER INSERT ON public.works
  FOR EACH ROW WHEN (NEW.budget_id IS NULL) EXECUTE FUNCTION public.create_standalone_work_portal();

-- Só obras independentes: os acompanhamentos legados de orçamento permanecem intocados.
DO $$ DECLARE w record; BEGIN
  FOR w IN SELECT id FROM public.works WHERE budget_id IS NULL LOOP
    PERFORM public.sync_work_tracking_from_work(w.id);
  END LOOP;
END; $$;


-- MIGRATION: 20261006004333_meeting_crew_documents.sql

CREATE TABLE public.crew_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  crew_member_id uuid NOT NULL REFERENCES public.crew_members(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 120),
  document_kind text NOT NULL CHECK (document_kind IN ('NR','CNH','OTHER')),
  storage_path text NOT NULL UNIQUE,
  mime_type text NOT NULL CHECK (mime_type IN ('application/pdf','image/jpeg','image/png')),
  size_bytes bigint NOT NULL CHECK (size_bytes BETWEEN 1 AND 8388608),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (storage_path LIKE owner_id::text || '/' || crew_member_id::text || '/' || id::text || '.%')
);
CREATE INDEX crew_documents_owner_idx ON public.crew_documents(owner_id);
CREATE INDEX crew_documents_member_idx ON public.crew_documents(crew_member_id);
ALTER TABLE public.crew_documents ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.crew_documents FROM anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.crew_documents TO authenticated;
GRANT ALL ON public.crew_documents TO service_role;
CREATE POLICY crew_documents_read ON public.crew_documents FOR SELECT TO authenticated
  USING (owner_id = (SELECT auth.uid()));
CREATE POLICY crew_documents_add ON public.crew_documents FOR INSERT TO authenticated
  WITH CHECK (owner_id = (SELECT auth.uid()) AND EXISTS (
    SELECT 1 FROM public.crew_members c WHERE c.id = crew_documents.crew_member_id AND c.owner_id = (SELECT auth.uid()) AND c.is_active));
CREATE POLICY crew_documents_remove ON public.crew_documents FOR DELETE TO authenticated
  USING (owner_id = (SELECT auth.uid()));

CREATE TABLE public.work_document_publications (
  work_id uuid NOT NULL REFERENCES public.works(id) ON DELETE CASCADE,
  document_id uuid NOT NULL REFERENCES public.crew_documents(id) ON DELETE CASCADE,
  published_by uuid NOT NULL REFERENCES auth.users(id),
  published_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (work_id, document_id)
);
CREATE INDEX work_document_publications_document_idx ON public.work_document_publications(document_id);
CREATE INDEX work_document_publications_publisher_idx ON public.work_document_publications(published_by);
ALTER TABLE public.work_document_publications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.work_document_publications FROM anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.work_document_publications TO authenticated;
GRANT ALL ON public.work_document_publications TO service_role;
CREATE POLICY work_documents_read ON public.work_document_publications FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.work_members wm
    WHERE wm.work_id = work_document_publications.work_id AND wm.user_id = (SELECT auth.uid()) AND wm.role = 'engineer'));
CREATE POLICY work_documents_publish ON public.work_document_publications FOR INSERT TO authenticated
  WITH CHECK (published_by = (SELECT auth.uid()) AND EXISTS (
    SELECT 1 FROM public.work_members wm JOIN public.works w ON w.id = wm.work_id
    WHERE wm.work_id = work_document_publications.work_id AND wm.user_id = (SELECT auth.uid())
      AND wm.role = 'engineer' AND w.status <> 'cancelled')
    AND EXISTS (SELECT 1 FROM public.crew_documents d JOIN public.work_team t ON t.crew_member_id = d.crew_member_id
      JOIN public.crew_members c ON c.id = d.crew_member_id
      WHERE d.id = work_document_publications.document_id AND d.owner_id = (SELECT auth.uid()) AND c.is_active
        AND c.owner_id = d.owner_id AND t.work_id = work_document_publications.work_id AND t.deallocated_at IS NULL));
CREATE POLICY work_documents_unpublish ON public.work_document_publications FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.work_members wm
    WHERE wm.work_id = work_document_publications.work_id AND wm.user_id = (SELECT auth.uid()) AND wm.role = 'engineer'));

-- Sem policies de Storage para anon/authenticated. Upload e download só passam
-- pelas actions/rotas que conferem responsável e publicação explícita por obra.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  VALUES ('crew-documents', 'crew-documents', false, 8388608, ARRAY['application/pdf','image/jpeg','image/png']);


-- MIGRATION: 20261006005000_revoke_team_documents_on_deallocation.sql

-- Sair da equipe revoga a publicação; realocar não republica dados pessoais.
CREATE OR REPLACE FUNCTION public.revoke_departed_crew_documents()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_TABLE_NAME = 'work_team' THEN
    DELETE FROM public.work_document_publications p USING public.crew_documents d
      WHERE p.document_id = d.id AND p.work_id = OLD.work_id AND d.crew_member_id = OLD.crew_member_id;
  ELSE
    DELETE FROM public.work_document_publications p USING public.crew_documents d
      WHERE p.document_id = d.id AND d.crew_member_id = OLD.id;
  END IF;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.revoke_departed_crew_documents() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER revoke_documents_on_team_departure AFTER UPDATE OF deallocated_at ON public.work_team
  FOR EACH ROW WHEN (NEW.deallocated_at IS NOT NULL AND OLD.deallocated_at IS DISTINCT FROM NEW.deallocated_at)
  EXECUTE FUNCTION public.revoke_departed_crew_documents();
CREATE TRIGGER revoke_documents_on_team_delete AFTER DELETE ON public.work_team
  FOR EACH ROW EXECUTE FUNCTION public.revoke_departed_crew_documents();
CREATE TRIGGER revoke_documents_on_member_deactivation AFTER UPDATE OF is_active ON public.crew_members
  FOR EACH ROW WHEN (OLD.is_active AND NOT NEW.is_active)
  EXECUTE FUNCTION public.revoke_departed_crew_documents();

COMMIT;
