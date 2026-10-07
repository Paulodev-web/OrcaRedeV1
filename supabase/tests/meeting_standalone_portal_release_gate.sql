BEGIN;
SELECT set_config('meeting.engineer', engineer_id::text, true), set_config('meeting.org', org_id::text, true)
FROM public.works LIMIT 1;
SELECT set_config('request.jwt.claims', json_build_object('sub', current_setting('meeting.engineer'), 'role', 'authenticated')::text, true);
SET LOCAL ROLE authenticated;
DO $$ DECLARE w uuid; t uuid; BEGIN
  INSERT INTO public.works (engineer_id, org_id, name) VALUES
    (current_setting('meeting.engineer')::uuid, current_setting('meeting.org')::uuid, 'TESTE PORTAL INDEPENDENTE - ROLLBACK') RETURNING id INTO w;
  SELECT id INTO STRICT t FROM public.work_trackings WHERE work_id = w AND budget_id IS NULL AND public_enabled;
  PERFORM set_config('meeting.work', w::text, true);
  PERFORM set_config('meeting.tracking', t::text, true);
  IF (SELECT public_id FROM public.work_trackings WHERE id = t) IS NULL THEN RAISE EXCEPTION 'FAIL: sem link'; END IF;
  UPDATE public.work_trackings SET planned_public_lighting = 12, public_lighting_installed = 4 WHERE id = t;
END; $$;
RESET ROLE;
DO $$ DECLARE t uuid; BEGIN
  t := public.ensure_work_tracking(current_setting('meeting.work')::uuid);
  IF t <> current_setting('meeting.tracking')::uuid THEN RAISE EXCEPTION 'FAIL: identidade não estável'; END IF;
  IF public.refresh_work_tracking_progress(t) <> 33 THEN RAISE EXCEPTION 'FAIL: contador de iluminação não recalculado'; END IF;
  INSERT INTO public.work_project_snapshot (work_id, pdf_storage_path, imported_by)
    VALUES (current_setting('meeting.work')::uuid, current_setting('meeting.work') || '/project/projeto.pdf', current_setting('meeting.engineer')::uuid);
  PERFORM public.ensure_work_tracking(current_setting('meeting.work')::uuid);
  IF NOT EXISTS (SELECT 1 FROM public.work_trackings WHERE id = t AND plan_image_url LIKE '/api/obra/%/planta.pdf') THEN
    RAISE EXCEPTION 'FAIL: planta independente não espelhada';
  END IF;
END; $$;
SET LOCAL ROLE anon;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.work_trackings WHERE id = current_setting('meeting.tracking')::uuid) THEN
    RAISE EXCEPTION 'FAIL: cliente não abre portal independente';
  END IF;
  IF has_function_privilege('anon', 'public.ensure_work_tracking(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL: sincronizador exposto';
  END IF;
END; $$;
SET LOCAL ROLE authenticated;
UPDATE public.works SET status = 'cancelled' WHERE id = current_setting('meeting.work')::uuid;
SET LOCAL ROLE anon;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.work_trackings WHERE id = current_setting('meeting.tracking')::uuid) THEN
    RAISE EXCEPTION 'FAIL: obra cancelada continua pública';
  END IF;
END; $$;
RESET ROLE;
ROLLBACK;
SELECT 'PASS: portal independente, identidade estável, planta, acesso público e cancelamento' AS result;
