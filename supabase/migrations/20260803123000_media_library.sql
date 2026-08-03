-- =============================================================================
-- BIBLIOTECA DE MÍDIA — fotos reutilizáveis com tags
--
-- PROPÓSITO
--   Tela /configuracoes/midia (Escopo §6.4): fotos com tags, reutilizáveis em
--   qualquer proposta, com importação da galeria de obras executadas.
--   A camada de IA sugere TAGS por seção (§12.2) e o sistema filtra a biblioteca
--   — nunca visão computacional. Por isso a tag é entidade relacional própria,
--   e não um array de texto solto.
--
-- MODELO
--   media_tags        catálogo de tags por usuário
--   media_library     o arquivo em si (upload manual ou galeria de obra)
--   media_library_tags ligação N:N, PK composta
--
-- ADITIVA (§3.3): três tabelas novas + um bucket. Nada existente é tocado.
--   `work_id` referencia public.works apenas para rastrear a origem quando a
--   foto veio da galeria da obra; ON DELETE SET NULL preserva a foto na
--   biblioteca mesmo se a obra sumir.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. media_tags — catálogo de tags por usuário
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.media_tags (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  name       TEXT        NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT media_tags_name_not_blank CHECK (length(btrim(name)) > 0),
  CONSTRAINT media_tags_user_name_key UNIQUE (user_id, name)
);

COMMENT ON TABLE public.media_tags IS
  'Tags da biblioteca de mídia. A IA sugere nomes de tag por seção da proposta; '
  'o sistema filtra media_library por elas.';

CREATE INDEX IF NOT EXISTS idx_media_tags_user ON public.media_tags (user_id, name);

ALTER TABLE public.media_tags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "media_tags_select" ON public.media_tags;
CREATE POLICY "media_tags_select" ON public.media_tags
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "media_tags_insert" ON public.media_tags;
CREATE POLICY "media_tags_insert" ON public.media_tags
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "media_tags_update" ON public.media_tags;
CREATE POLICY "media_tags_update" ON public.media_tags
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "media_tags_delete" ON public.media_tags;
CREATE POLICY "media_tags_delete" ON public.media_tags
  FOR DELETE USING (auth.uid() = user_id);

-- -----------------------------------------------------------------------------
-- 2. media_library — o arquivo
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.media_library (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID        NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  url          TEXT        NOT NULL,
  storage_path TEXT        NULL,
  title        TEXT        NULL,
  caption      TEXT        NULL,
  source       TEXT        NOT NULL DEFAULT 'upload'
                           CHECK (source IN ('upload', 'work_gallery')),
  work_id      UUID        NULL REFERENCES public.works(id) ON DELETE SET NULL,
  mime_type    TEXT        NULL,
  file_size    BIGINT      NULL,
  width        INT         NULL,
  height       INT         NULL,
  taken_at     TIMESTAMPTZ NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT media_library_url_not_blank CHECK (length(btrim(url)) > 0)
);

COMMENT ON TABLE public.media_library IS
  'Fotos reutilizáveis em qualquer proposta. source=upload (tela de mídia) ou '
  'work_gallery (importada da galeria de uma obra do Andamento de Obra).';

COMMENT ON COLUMN public.media_library.storage_path IS
  'Caminho no bucket proposal-media quando o arquivo é nosso. NULL quando a '
  'foto foi importada apontando para uma URL já existente (galeria de obra).';

CREATE INDEX IF NOT EXISTS idx_media_library_user_created
  ON public.media_library (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_media_library_work
  ON public.media_library (work_id)
  WHERE work_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.update_media_library_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_media_library_updated_at ON public.media_library;
CREATE TRIGGER trg_media_library_updated_at
  BEFORE UPDATE ON public.media_library
  FOR EACH ROW EXECUTE FUNCTION public.update_media_library_updated_at();

ALTER TABLE public.media_library ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "media_library_select" ON public.media_library;
CREATE POLICY "media_library_select" ON public.media_library
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "media_library_insert" ON public.media_library;
CREATE POLICY "media_library_insert" ON public.media_library
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "media_library_update" ON public.media_library;
CREATE POLICY "media_library_update" ON public.media_library
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "media_library_delete" ON public.media_library;
CREATE POLICY "media_library_delete" ON public.media_library
  FOR DELETE USING (auth.uid() = user_id);

-- -----------------------------------------------------------------------------
-- 3. media_library_tags — ligação N:N
--    user_id denormalizado para que o RLS não precise de dois EXISTS.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.media_library_tags (
  media_id   UUID        NOT NULL REFERENCES public.media_library(id) ON DELETE CASCADE,
  tag_id     UUID        NOT NULL REFERENCES public.media_tags(id) ON DELETE CASCADE,
  user_id    UUID        NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (media_id, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_media_library_tags_tag
  ON public.media_library_tags (tag_id);

CREATE INDEX IF NOT EXISTS idx_media_library_tags_user
  ON public.media_library_tags (user_id);

ALTER TABLE public.media_library_tags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "media_library_tags_select" ON public.media_library_tags;
CREATE POLICY "media_library_tags_select" ON public.media_library_tags
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "media_library_tags_insert" ON public.media_library_tags;
CREATE POLICY "media_library_tags_insert" ON public.media_library_tags
  FOR INSERT WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.media_library m
      WHERE m.id = media_id AND m.user_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1 FROM public.media_tags t
      WHERE t.id = tag_id AND t.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "media_library_tags_delete" ON public.media_library_tags;
CREATE POLICY "media_library_tags_delete" ON public.media_library_tags
  FOR DELETE USING (auth.uid() = user_id);

-- UPDATE sem policy: a ligação é criada e removida, nunca editada.

-- -----------------------------------------------------------------------------
-- 4. Storage — bucket proposal-media
--
--    PÚBLICO de leitura pela mesma razão de company-assets: as fotos aparecem
--    na página pública /proposta/[token] e o gerador de PDF as baixa sem sessão.
--    Consequência aceita e registrada: quem tiver a URL exata vê a foto sem
--    precisar do token da proposta.
--    Escrita restrita ao dono via prefixo {user_id}/...
-- -----------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('proposal-media', 'proposal-media', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "proposal_media_storage_insert" ON storage.objects;
CREATE POLICY "proposal_media_storage_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'proposal-media'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "proposal_media_storage_update" ON storage.objects;
CREATE POLICY "proposal_media_storage_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'proposal-media'
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'proposal-media'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "proposal_media_storage_delete" ON storage.objects;
CREATE POLICY "proposal_media_storage_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'proposal-media'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
