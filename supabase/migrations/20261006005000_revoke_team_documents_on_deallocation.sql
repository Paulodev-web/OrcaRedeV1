BEGIN;
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
