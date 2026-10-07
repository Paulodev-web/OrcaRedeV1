-- R1: uma obra sem orçamento também tem identidade e portal próprios.
BEGIN;
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
COMMIT;
