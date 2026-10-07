-- Homologação transacional: usa identidades de uma obra de dev e desfaz a fixture.
BEGIN;
SELECT set_config('meeting.engineer', engineer_id::text, true),
       set_config('meeting.manager', manager_id::text, true),
       set_config('meeting.org', org_id::text, true)
FROM public.works WHERE manager_id IS NOT NULL LIMIT 1;
SELECT set_config('request.jwt.claims', json_build_object('sub', current_setting('meeting.engineer'), 'role', 'authenticated')::text, true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE w uuid; m uuid; m2 uuid; denied boolean; n integer;
BEGIN
  INSERT INTO public.works (engineer_id, manager_id, org_id, name)
  VALUES (current_setting('meeting.engineer')::uuid, current_setting('meeting.manager')::uuid,
    current_setting('meeting.org')::uuid, 'TESTE TRANSACIONAL REUNIAO - NAO PERSISTIR') RETURNING id INTO w;
  SELECT id INTO STRICT m FROM public.work_milestones WHERE work_id = w AND code = 'survey';
  PERFORM public.complete_work_milestone(m, NULL);
  PERFORM public.complete_work_milestone(m, NULL);
  IF NOT EXISTS (SELECT 1 FROM public.work_milestones WHERE id = m AND status = 'approved' AND approved_by = auth.uid()) THEN
    RAISE EXCEPTION 'FAIL: conclusão direta não persistiu';
  END IF;
  SELECT count(*) INTO n FROM public.work_milestone_events WHERE milestone_id = m AND event_type = 'approved';
  IF n <> 1 THEN RAISE EXCEPTION 'FAIL: idempotência/auditoria: % eventos', n; END IF;

  SELECT id INTO STRICT m2 FROM public.work_milestones WHERE work_id = w AND code = 'poles';
  PERFORM set_config('request.jwt.claims', json_build_object('sub', current_setting('meeting.manager'), 'role', 'authenticated')::text, true);
  denied := false;
  BEGIN PERFORM public.complete_work_milestone(m2, NULL);
  EXCEPTION WHEN OTHERS THEN denied := true; END;
  IF NOT denied THEN RAISE EXCEPTION 'FAIL: gerente aprovou marco'; END IF;
  UPDATE public.work_milestones SET status = 'in_progress' WHERE id = m2;
  UPDATE public.work_milestones SET status = 'awaiting_approval', reported_at = now(), reported_by = auth.uid() WHERE id = m2;
  IF NOT EXISTS (SELECT 1 FROM public.work_milestones WHERE id = m2 AND status = 'awaiting_approval') THEN
    RAISE EXCEPTION 'FAIL: relatório do gerente não foi para aguardando';
  END IF;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', current_setting('meeting.engineer'), 'role', 'authenticated')::text, true);
  PERFORM public.complete_work_milestone(m2, 'Aprovação de relato da equipe');

  SELECT id INTO STRICT m2 FROM public.work_milestones WHERE work_id = w AND code = 'cabling_lv';
  denied := false;
  BEGIN PERFORM public.complete_work_milestone(m2, repeat('x', 1001));
  EXCEPTION WHEN OTHERS THEN denied := true; END;
  IF NOT denied THEN RAISE EXCEPTION 'FAIL: comentário acima do limite aceito'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.work_milestones WHERE id = m2 AND status = 'pending') THEN
    RAISE EXCEPTION 'FAIL: operação inválida alterou marco';
  END IF;
  UPDATE public.works SET status = 'cancelled' WHERE id = w;
  denied := false;
  BEGIN PERFORM public.complete_work_milestone(m2, NULL);
  EXCEPTION WHEN OTHERS THEN denied := true; END;
  IF NOT denied THEN RAISE EXCEPTION 'FAIL: conclusão em obra cancelada'; END IF;
  RAISE NOTICE 'PASS: conclusão direta, idempotência, auditoria, gerente, relato, limite e cancelamento';
END;
$$;
RESET ROLE;
DO $$ BEGIN
  IF has_function_privilege('anon', 'public.complete_work_milestone(uuid,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL: função pública para anon';
  END IF;
END; $$;
ROLLBACK;
SELECT 'PASS: conclusão direta, idempotência, auditoria, gerente, relato, limite e cancelamento' AS result;
