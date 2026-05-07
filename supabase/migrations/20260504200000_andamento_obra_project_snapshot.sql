-- =============================================================================
-- Andamento de Obra — Snapshot de Projeto (Fase 3)
-- FK works.budget_id -> budgets, work_project_snapshot (1:1),
-- work_project_posts (postes do snapshot), work_project_connections (conexoes
-- remapeadas), bucket andamento-obra com policy de SELECT por work_member.
-- Snapshot e imutavel por design: writes via service role apenas.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. FK em works.budget_id (coluna ja existe desde Bloco 2 sem FK)
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'works_budget_id_fkey'
      AND conrelid = 'public.works'::regclass
  ) THEN
    ALTER TABLE public.works
      ADD CONSTRAINT works_budget_id_fkey
      FOREIGN KEY (budget_id) REFERENCES public.budgets(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS works_budget_id_idx ON public.works(budget_id);

-- -----------------------------------------------------------------------------
-- 2. work_project_snapshot — 1:1 com works
-- Armazena rastreabilidade do PDF importado e metadados globais do snapshot.
-- materials_planned: array [{ material_id, code, name, unit, quantity }]
-- meters_planned: objeto { BT: number, MT: number, rede: number } (sempre presentes)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.work_project_snapshot (
  work_id            UUID        PRIMARY KEY REFERENCES public.works(id) ON DELETE CASCADE,
  source_budget_id   UUID        NULL REFERENCES public.budgets(id) ON DELETE SET NULL,
  pdf_storage_path   TEXT        NULL,
  original_pdf_path  TEXT        NULL,
  render_version     INT         NULL,
  pdf_num_pages      INT         NULL,
  materials_planned  JSONB       NOT NULL DEFAULT '[]'::jsonb,
  meters_planned     JSONB       NOT NULL DEFAULT '{}'::jsonb,
  imported_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  imported_by        UUID        NOT NULL REFERENCES auth.users(id),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_work_project_snapshot_source_budget
  ON public.work_project_snapshot(source_budget_id);

CREATE OR REPLACE FUNCTION public.update_work_project_snapshot_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

ALTER FUNCTION public.update_work_project_snapshot_updated_at()
  SET search_path = public, auth;

DROP TRIGGER IF EXISTS trg_work_project_snapshot_updated_at ON public.work_project_snapshot;
CREATE TRIGGER trg_work_project_snapshot_updated_at
  BEFORE UPDATE ON public.work_project_snapshot
  FOR EACH ROW EXECUTE FUNCTION public.update_work_project_snapshot_updated_at();

-- -----------------------------------------------------------------------------
-- 3. work_project_posts — postes planejados copiados do orcamento
-- source_post_id: id original em budget_posts (sem FK; rastreabilidade)
-- metadata: { counter, custom_name, name, post_type_id, post_type_name,
--             post_type_code, post_type_height_m }
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.work_project_posts (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  work_id         UUID        NOT NULL REFERENCES public.works(id) ON DELETE CASCADE,
  source_post_id  UUID        NULL,
  numbering       TEXT        NULL,
  post_type       TEXT        NULL,
  x_coord         NUMERIC     NOT NULL,
  y_coord         NUMERIC     NOT NULL,
  metadata        JSONB       NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_work_project_posts_work
  ON public.work_project_posts(work_id);
CREATE INDEX IF NOT EXISTS idx_work_project_posts_source
  ON public.work_project_posts(work_id, source_post_id);

-- -----------------------------------------------------------------------------
-- 4. work_project_connections — conexoes/redes planejadas
-- color: 'blue' | 'green' (mapeado de connection_type do legado post_connections)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.work_project_connections (
  id                     UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  work_id                UUID        NOT NULL REFERENCES public.works(id) ON DELETE CASCADE,
  source_connection_id   UUID        NULL,
  from_post_id           UUID        NOT NULL REFERENCES public.work_project_posts(id) ON DELETE CASCADE,
  to_post_id             UUID        NOT NULL REFERENCES public.work_project_posts(id) ON DELETE CASCADE,
  color                  TEXT        NULL CHECK (color IS NULL OR color IN ('blue','green')),
  metadata               JSONB       NOT NULL DEFAULT '{}'::jsonb,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_work_project_connections_work
  ON public.work_project_connections(work_id);
CREATE INDEX IF NOT EXISTS idx_work_project_connections_from
  ON public.work_project_connections(from_post_id);
CREATE INDEX IF NOT EXISTS idx_work_project_connections_to
  ON public.work_project_connections(to_post_id);

-- -----------------------------------------------------------------------------
-- 5. RLS — somente leitura para membros da obra (writes via service role)
-- -----------------------------------------------------------------------------
ALTER TABLE public.work_project_snapshot    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_project_posts       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_project_connections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "work_project_snapshot_select" ON public.work_project_snapshot;
CREATE POLICY "work_project_snapshot_select" ON public.work_project_snapshot
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.work_members wm
      WHERE wm.work_id = work_project_snapshot.work_id
        AND wm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "work_project_posts_select" ON public.work_project_posts;
CREATE POLICY "work_project_posts_select" ON public.work_project_posts
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.work_members wm
      WHERE wm.work_id = work_project_posts.work_id
        AND wm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "work_project_connections_select" ON public.work_project_connections;
CREATE POLICY "work_project_connections_select" ON public.work_project_connections
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.work_members wm
      WHERE wm.work_id = work_project_connections.work_id
        AND wm.user_id = auth.uid()
    )
  );

-- INSERT/UPDATE/DELETE: sem policy = bloqueado para authenticated.
-- Snapshot e imutavel apos importacao; mutacoes apenas via service role.

-- -----------------------------------------------------------------------------
-- 6. Storage — bucket privado andamento-obra
-- Path pattern: {work_id}/project/projeto.pdf, {work_id}/<feature>/...
-- SELECT permitido para qualquer membro da obra (work_members).
-- INSERT/UPDATE/DELETE: bloqueado para authenticated nesta fase
-- (uploads de PDF de projeto fluem via service role na Server Action de import;
-- buckets de outros recursos -- chat, diario, alertas -- ganharao policies
-- proprias nos blocos correspondentes).
-- -----------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('andamento-obra', 'andamento-obra', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "andamento_obra_storage_select" ON storage.objects;
CREATE POLICY "andamento_obra_storage_select" ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'andamento-obra'
    AND EXISTS (
      SELECT 1 FROM public.work_members wm
      WHERE wm.user_id = auth.uid()
        AND wm.work_id::text = (storage.foldername(name))[1]
    )
  );
