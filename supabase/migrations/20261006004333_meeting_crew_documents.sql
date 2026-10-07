BEGIN;
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
COMMIT;
