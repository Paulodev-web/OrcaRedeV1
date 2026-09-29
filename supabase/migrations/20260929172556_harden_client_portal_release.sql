-- =============================================================================
-- Gate de producao do Portal do Cliente.
--
-- Esta migration deliberadamente repete os pre-requisitos que chegaram primeiro
-- ao banco de desenvolvimento. Assim os ambientes atuais convergem mesmo quando
-- esses objetos ja existem, sem recriar ou duplicar dados.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Pre-requisitos estruturais do espelho
-- -----------------------------------------------------------------------------

ALTER TABLE public.work_pole_installations
  ADD COLUMN IF NOT EXISTS project_post_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conrelid = 'public.work_pole_installations'::regclass
       AND conname = 'work_pole_installations_project_post_id_fkey'
  ) THEN
    ALTER TABLE public.work_pole_installations
      ADD CONSTRAINT work_pole_installations_project_post_id_fkey
      FOREIGN KEY (project_post_id)
      REFERENCES public.work_project_posts(id)
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_work_pole_installations_project_post
  ON public.work_pole_installations (project_post_id);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_project_post_instalado
  ON public.work_pole_installations (project_post_id)
  WHERE project_post_id IS NOT NULL AND status = 'installed';

CREATE UNIQUE INDEX IF NOT EXISTS idx_tracked_posts_tracking_client
  ON public.tracked_posts (tracking_id, client_id)
  WHERE client_id IS NOT NULL;

-- -----------------------------------------------------------------------------
-- 2. Publicacao reversivel. O public_id nunca e apagado nem reciclado.
-- -----------------------------------------------------------------------------

ALTER TABLE public.work_trackings
  ADD COLUMN IF NOT EXISTS public_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS unpublished_at timestamptz;

COMMENT ON COLUMN public.work_trackings.public_enabled IS
  'Liga/desliga o acesso anonimo sem trocar o public_id. Em espelhos, segue o ciclo de vida da obra.';

COMMENT ON COLUMN public.work_trackings.unpublished_at IS
  'Quando o acesso publico foi desativado. NULL significa publicado.';

UPDATE public.work_trackings t
   SET public_enabled = false,
       unpublished_at = COALESCE(t.unpublished_at, now())
  FROM public.works w
 WHERE t.work_id = w.id
   AND w.status = 'cancelled'
   AND t.public_enabled;

CREATE OR REPLACE FUNCTION public.work_tracking_prepare_public_identity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  -- O formato antigo usava epoch em milissegundos e podia ser enumerado. A
  -- troca acontece apenas no INSERT: links que ja chegaram ao cliente ficam.
  IF NEW.work_id IS NOT NULL
     AND (
       NEW.public_id IS NULL
       OR NEW.public_id ~ '^tracking-[0-9]{10,}$'
     )
  THEN
    NEW.public_id := 'tracking-' || replace(gen_random_uuid()::text, '-', '');
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_work_tracking_prepare_public_identity
  ON public.work_trackings;
CREATE TRIGGER trg_work_tracking_prepare_public_identity
  BEFORE INSERT ON public.work_trackings
  FOR EACH ROW
  EXECUTE FUNCTION public.work_tracking_prepare_public_identity();

CREATE OR REPLACE FUNCTION public.work_tracking_set_publication_from_link()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_status text;
BEGIN
  IF NEW.work_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT w.status
    INTO v_status
    FROM public.works w
   WHERE w.id = NEW.work_id;

  IF FOUND THEN
    NEW.public_enabled := v_status <> 'cancelled';
    NEW.unpublished_at := CASE
      WHEN NEW.public_enabled THEN NULL
      ELSE COALESCE(NEW.unpublished_at, now())
    END;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_work_tracking_publication_on_insert
  ON public.work_trackings;
CREATE TRIGGER trg_work_tracking_publication_on_insert
  BEFORE INSERT ON public.work_trackings
  FOR EACH ROW
  EXECUTE FUNCTION public.work_tracking_set_publication_from_link();

DROP TRIGGER IF EXISTS trg_work_tracking_publication_on_link
  ON public.work_trackings;
CREATE TRIGGER trg_work_tracking_publication_on_link
  BEFORE UPDATE OF work_id ON public.work_trackings
  FOR EACH ROW
  EXECUTE FUNCTION public.work_tracking_set_publication_from_link();

CREATE OR REPLACE FUNCTION public.on_work_portal_publication_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    UPDATE public.work_trackings
       SET public_enabled = false,
           unpublished_at = COALESCE(unpublished_at, now()),
           updated_at = now()
     WHERE work_id = OLD.id;
    RETURN OLD;
  END IF;

  UPDATE public.work_trackings
     SET public_enabled = NEW.status <> 'cancelled',
         unpublished_at = CASE
           WHEN NEW.status <> 'cancelled' THEN NULL
           ELSE COALESCE(unpublished_at, now())
         END,
         updated_at = now()
   WHERE work_id = NEW.id;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_work_portal_publication_on_status
  ON public.works;
CREATE TRIGGER trg_work_portal_publication_on_status
  AFTER UPDATE OF status ON public.works
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION public.on_work_portal_publication_change();

DROP TRIGGER IF EXISTS trg_work_portal_unpublish_before_delete
  ON public.works;
CREATE TRIGGER trg_work_portal_unpublish_before_delete
  BEFORE DELETE ON public.works
  FOR EACH ROW
  EXECUTE FUNCTION public.on_work_portal_publication_change();

-- -----------------------------------------------------------------------------
-- 3. RLS: portal desligado nao vaza nem pelo pai nem pelos filhos.
-- -----------------------------------------------------------------------------

DROP POLICY IF EXISTS "Allow anon read shared work_trackings"
  ON public.work_trackings;
DROP POLICY IF EXISTS "Public read work_trackings by public_id"
  ON public.work_trackings;
CREATE POLICY work_trackings_public_read_enabled
  ON public.work_trackings
  FOR SELECT
  TO anon
  USING (public_id IS NOT NULL AND public_enabled);

DROP POLICY IF EXISTS "Allow anon read tracked_posts of shared works"
  ON public.tracked_posts;
DROP POLICY IF EXISTS "Public read tracked posts for public works"
  ON public.tracked_posts;
CREATE POLICY tracked_posts_public_read_enabled
  ON public.tracked_posts
  FOR SELECT
  TO anon
  USING (
    EXISTS (
      SELECT 1
        FROM public.work_trackings wt
       WHERE wt.id = tracked_posts.tracking_id
         AND wt.public_id IS NOT NULL
         AND wt.public_enabled
    )
  );

DROP POLICY IF EXISTS "Allow anon read post_connections of shared works"
  ON public.post_connections;
DROP POLICY IF EXISTS "Public read post connections for public works"
  ON public.post_connections;
CREATE POLICY post_connections_public_read_enabled
  ON public.post_connections
  FOR SELECT
  TO anon
  USING (
    EXISTS (
      SELECT 1
        FROM public.work_trackings wt
       WHERE wt.id = post_connections.tracking_id
         AND wt.public_id IS NOT NULL
         AND wt.public_enabled
    )
  );

-- RLS continua sendo a segunda barreira, mas anon nao precisa sequer receber
-- privilegios de escrita nessas tres tabelas.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.work_trackings, public.tracked_posts, public.post_connections
  FROM anon;
GRANT SELECT
  ON public.work_trackings, public.tracked_posts, public.post_connections
  TO anon;

-- O modulo antigo so apaga acompanhamento legado. Um portal ligado a uma obra
-- e derivado e nao pode perder o endereco publico por um clique antigo.
DROP POLICY IF EXISTS "Users can delete own work trackings"
  ON public.work_trackings;
CREATE POLICY work_trackings_delete_legacy_owner
  ON public.work_trackings
  FOR DELETE
  TO authenticated
  USING (
    work_id IS NULL
    AND budget_id IN (
      SELECT b.id
        FROM public.budgets b
       WHERE b.user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS work_trackings_select_work_engineer
  ON public.work_trackings;
CREATE POLICY work_trackings_select_work_engineer
  ON public.work_trackings
  FOR SELECT
  TO authenticated
  USING (
    work_id IS NOT NULL
    AND EXISTS (
      SELECT 1
        FROM public.work_members wm
       WHERE wm.work_id = work_trackings.work_id
         AND wm.user_id = (SELECT auth.uid())
         AND wm.role = 'engineer'
    )
  );

DROP POLICY IF EXISTS work_trackings_update_work_engineer
  ON public.work_trackings;
CREATE POLICY work_trackings_update_work_engineer
  ON public.work_trackings
  FOR UPDATE
  TO authenticated
  USING (
    work_id IS NOT NULL
    AND EXISTS (
      SELECT 1
        FROM public.work_members wm
       WHERE wm.work_id = work_trackings.work_id
         AND wm.user_id = (SELECT auth.uid())
         AND wm.role = 'engineer'
    )
  )
  WITH CHECK (
    work_id IS NOT NULL
    AND EXISTS (
      SELECT 1
        FROM public.work_members wm
       WHERE wm.work_id = work_trackings.work_id
         AND wm.user_id = (SELECT auth.uid())
         AND wm.role = 'engineer'
    )
  );

-- -----------------------------------------------------------------------------
-- 4. Campos derivados e identidade publica sao imutaveis pelo Data API.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.work_trackings_protect_derived()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'auth'
AS $function$
BEGIN
  -- Codigo privilegiado do banco (triggers e sincronizadores) pode convergir o
  -- espelho. Uma escrita direta pelo Data API nunca muda vinculo ou identidade.
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;

  IF OLD.work_id IS NULL AND NEW.work_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF OLD.work_id IS NULL AND NEW.work_id IS NOT NULL THEN
    RAISE EXCEPTION 'Apenas a sincronizacao interna pode vincular um portal a uma obra';
  END IF;

  IF NEW.work_id                  IS DISTINCT FROM OLD.work_id
     OR NEW.budget_id             IS DISTINCT FROM OLD.budget_id
     OR NEW.public_id             IS DISTINCT FROM OLD.public_id
     OR NEW.public_enabled        IS DISTINCT FROM OLD.public_enabled
     OR NEW.unpublished_at        IS DISTINCT FROM OLD.unpublished_at
     OR NEW.poles_installed       IS DISTINCT FROM OLD.poles_installed
     OR NEW.planned_poles         IS DISTINCT FROM OLD.planned_poles
     OR NEW.progress_percentage   IS DISTINCT FROM OLD.progress_percentage
     OR NEW.timeline_milestones   IS DISTINCT FROM OLD.timeline_milestones
  THEN
    RAISE EXCEPTION 'Campos derivados e identidade publica do portal nao podem ser editados';
  END IF;

  RETURN NEW;
END;
$function$;

-- -----------------------------------------------------------------------------
-- 5. Funcoes privilegiadas internas nao sao endpoints RPC.
-- -----------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.ensure_work_tracking(uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.refresh_work_tracking_progress(uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_work_client_timeline(uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.build_work_client_timeline(uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_work_tracking_from_work(uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.on_work_milestone_sync_timeline()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.on_work_tracking_link_sync_timeline()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.on_pole_installation_sync_tracking()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.on_work_portal_publication_change()
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.sync_work_tracking_from_work(uuid)
  TO service_role;

-- Trigger functions nao consultam EXECUTE, portanto podem e devem ficar
-- fechadas para chamadas RPC manuais.
REVOKE ALL ON FUNCTION public.work_tracking_prepare_public_identity()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.work_tracking_set_publication_from_link()
  FROM PUBLIC, anon, authenticated;
