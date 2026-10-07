BEGIN;
SELECT set_config('meeting.engineer', engineer_id::text, true), set_config('meeting.org', org_id::text, true),
  set_config('meeting.manager', manager_id::text, true)
FROM public.works WHERE manager_id IS NOT NULL LIMIT 1;
SELECT set_config('request.jwt.claims', json_build_object('sub', current_setting('meeting.engineer'), 'role', 'authenticated')::text, true);
SET LOCAL ROLE authenticated;
DO $$ DECLARE w uuid; c uuid; d uuid := gen_random_uuid(); denied boolean; BEGIN
  INSERT INTO public.works (engineer_id, manager_id, org_id, name) VALUES
    (current_setting('meeting.engineer')::uuid, current_setting('meeting.manager')::uuid, current_setting('meeting.org')::uuid, 'TESTE DOCUMENTOS - ROLLBACK') RETURNING id INTO w;
  INSERT INTO public.crew_members (owner_id, full_name) VALUES (auth.uid(), 'Pessoa sintética para teste') RETURNING id INTO c;
  INSERT INTO public.crew_documents (id,owner_id,crew_member_id,title,document_kind,storage_path,mime_type,size_bytes)
    VALUES (d,auth.uid(),c,'NR de teste','NR',auth.uid()::text || '/' || c || '/' || d || '.pdf','application/pdf',100);
  IF EXISTS (SELECT 1 FROM public.work_document_publications WHERE document_id = d) THEN
    RAISE EXCEPTION 'FAIL: upload publicou automaticamente';
  END IF;
  denied := false;
  BEGIN INSERT INTO public.work_document_publications (work_id,document_id,published_by) VALUES (w,d,auth.uid());
  EXCEPTION WHEN OTHERS THEN denied := true; END;
  IF NOT denied THEN RAISE EXCEPTION 'FAIL: documento publicado para pessoa não alocada'; END IF;
  INSERT INTO public.work_team (work_id,crew_member_id) VALUES (w,c);
  INSERT INTO public.work_document_publications (work_id,document_id,published_by) VALUES (w,d,auth.uid());
  IF NOT EXISTS (SELECT 1 FROM public.work_document_publications WHERE work_id=w AND document_id=d) THEN
    RAISE EXCEPTION 'FAIL: publicação válida falhou';
  END IF;
  PERFORM set_config('meeting.document', d::text, true);
  PERFORM set_config('meeting.work', w::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', current_setting('meeting.manager'), 'role', 'authenticated')::text, true);
  IF EXISTS (SELECT 1 FROM public.crew_documents WHERE id=d) THEN RAISE EXCEPTION 'FAIL: gerente vê documento privado'; END IF;
  IF EXISTS (SELECT 1 FROM public.work_document_publications WHERE work_id=w) THEN RAISE EXCEPTION 'FAIL: gerente vê publicação interna'; END IF;
  denied := false;
  BEGIN INSERT INTO public.work_document_publications (work_id,document_id,published_by) VALUES (w,d,auth.uid());
  EXCEPTION WHEN OTHERS THEN denied := true; END;
  IF NOT denied THEN RAISE EXCEPTION 'FAIL: gerente publicou documento'; END IF;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', current_setting('meeting.engineer'), 'role', 'authenticated')::text, true);
  DELETE FROM public.work_document_publications WHERE work_id=w AND document_id=d;
  IF EXISTS (SELECT 1 FROM public.work_document_publications WHERE work_id=w AND document_id=d) THEN
    RAISE EXCEPTION 'FAIL: revogação não persistiu';
  END IF;
  INSERT INTO public.work_document_publications (work_id,document_id,published_by) VALUES (w,d,auth.uid());
  UPDATE public.work_team SET deallocated_at=now() WHERE work_id=w AND crew_member_id=c;
  UPDATE public.work_team SET deallocated_at=NULL WHERE work_id=w AND crew_member_id=c;
  IF EXISTS (SELECT 1 FROM public.work_document_publications WHERE work_id=w AND document_id=d) THEN
    RAISE EXCEPTION 'FAIL: realocar republicou documento sem autorização';
  END IF;
  INSERT INTO public.work_document_publications (work_id,document_id,published_by) VALUES (w,d,auth.uid());
  UPDATE public.crew_members SET is_active=false WHERE id=c;
  IF EXISTS (SELECT 1 FROM public.work_document_publications WHERE work_id=w AND document_id=d) THEN
    RAISE EXCEPTION 'FAIL: desativação não revogou documento';
  END IF;
END; $$;
RESET ROLE;
DO $$ BEGIN
  IF has_table_privilege('anon', 'public.crew_documents', 'SELECT') OR has_table_privilege('anon', 'public.work_document_publications', 'SELECT') THEN
    RAISE EXCEPTION 'FAIL: tabela de documentos exposta a anon';
  END IF;
  IF (SELECT public FROM storage.buckets WHERE id='crew-documents') IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'FAIL: bucket de documentos não privado';
  END IF;
END; $$;
ROLLBACK;
SELECT 'PASS: documentos privados, publicação por alocação, gerente bloqueado, revogação, tabelas e bucket privados' AS result;
