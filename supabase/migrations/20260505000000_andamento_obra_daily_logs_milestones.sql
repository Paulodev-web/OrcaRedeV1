-- =============================================================================
-- Andamento de Obra - Diario + Marcos (Bloco 6)
--
-- Tabelas novas:
--   - work_daily_logs            (diario por work_id+log_date com fluxo de aprovacao)
--   - work_daily_log_revisions   (revisoes versionadas, imutaveis)
--   - work_daily_log_media       (midia anexa por revisao)
--   - work_milestone_events      (historico de transicoes de marcos)
--   - work_milestone_event_media (midia de evidencia de marcos)
--
-- Extensoes:
--   - work_milestones: colunas de fluxo de aprovacao (reported_by, approved_by,
--     rejected_at, rejection_reason, notes, evidence_media_ids)
--
-- Triggers:
--   - protect_fields (BEFORE UPDATE, estritos: RAISE EXCEPTION):
--       work_daily_logs_protect_fields
--       work_milestones_protect_fields
--   - notificacao (AFTER, tolerantes: RAISE WARNING + RETURN NEW):
--       on_new_daily_log_published_notify    (INSERT em revision com #1)
--       on_daily_log_republished_notify       (UPDATE rejected -> pending)
--       on_daily_log_decision_notify          (UPDATE para approved/rejected)
--       on_milestone_reported_notify          (UPDATE para awaiting_approval)
--       on_milestone_decision_notify          (UPDATE para approved/rejected)
--   - last_activity_at (AFTER, tolerantes):
--       update_work_last_activity_on_daily_log
--       update_work_last_activity_on_milestone
--
-- RLS: por papel (engineer/manager) com restricoes coluna a coluna.
-- Storage: policies para paths daily-logs/ e milestones/.
-- Realtime: publicacao supabase_realtime para tabelas chave.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. work_daily_logs - 1 diario ativo por (work_id, log_date)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.work_daily_logs (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  work_id              UUID        NOT NULL REFERENCES public.works(id) ON DELETE CASCADE,
  log_date             DATE        NOT NULL,
  published_by         UUID        NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  current_revision_id  UUID        NULL,
  status               TEXT        NOT NULL DEFAULT 'pending_approval'
                                   CHECK (status IN ('pending_approval','approved','rejected')),
  approved_by          UUID        NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at          TIMESTAMPTZ NULL,
  rejected_at          TIMESTAMPTZ NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(work_id, log_date)
);

CREATE INDEX IF NOT EXISTS idx_work_daily_logs_work_date
  ON public.work_daily_logs(work_id, log_date DESC);
CREATE INDEX IF NOT EXISTS idx_work_daily_logs_work_status
  ON public.work_daily_logs(work_id, status);

CREATE OR REPLACE FUNCTION public.update_work_daily_logs_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

ALTER FUNCTION public.update_work_daily_logs_updated_at()
  SET search_path = public, auth;

DROP TRIGGER IF EXISTS trg_work_daily_logs_updated_at ON public.work_daily_logs;
CREATE TRIGGER trg_work_daily_logs_updated_at
  BEFORE UPDATE ON public.work_daily_logs
  FOR EACH ROW EXECUTE FUNCTION public.update_work_daily_logs_updated_at();

-- -----------------------------------------------------------------------------
-- 2. work_daily_log_revisions - historico imutavel; revision_number incremental
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.work_daily_log_revisions (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  daily_log_id          UUID        NOT NULL REFERENCES public.work_daily_logs(id) ON DELETE CASCADE,
  revision_number       INT         NOT NULL,
  crew_present          JSONB       NOT NULL DEFAULT '[]'::jsonb,
  activities            TEXT        NOT NULL,
  posts_installed_count INT         NULL,
  meters_installed      JSONB       NOT NULL DEFAULT '{}'::jsonb,
  materials_consumed    JSONB       NOT NULL DEFAULT '[]'::jsonb,
  incidents             TEXT        NULL,
  rejection_reason      TEXT        NULL,
  client_event_id       UUID        NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(daily_log_id, revision_number)
);

CREATE INDEX IF NOT EXISTS idx_daily_log_revisions_log_rev
  ON public.work_daily_log_revisions(daily_log_id, revision_number DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_daily_log_revisions_client_event
  ON public.work_daily_log_revisions(client_event_id)
  WHERE client_event_id IS NOT NULL;

-- FK ciclica para current_revision_id, deferrable para permitir transacao
-- que cria revisao e atualiza ponteiro juntas.
ALTER TABLE public.work_daily_logs
  DROP CONSTRAINT IF EXISTS fk_current_revision;
ALTER TABLE public.work_daily_logs
  ADD CONSTRAINT fk_current_revision
  FOREIGN KEY (current_revision_id)
  REFERENCES public.work_daily_log_revisions(id)
  ON DELETE SET NULL
  DEFERRABLE INITIALLY DEFERRED;

-- -----------------------------------------------------------------------------
-- 3. work_daily_log_media - midias anexadas por revisao
--    work_id e daily_log_id denormalizados para Storage policies e queries.
--    Path: {work_id}/daily-logs/{daily_log_id}/{revision_id}/{uuid}.{ext}
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.work_daily_log_media (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  revision_id      UUID        NOT NULL REFERENCES public.work_daily_log_revisions(id) ON DELETE CASCADE,
  daily_log_id     UUID        NOT NULL REFERENCES public.work_daily_logs(id) ON DELETE CASCADE,
  work_id          UUID        NOT NULL REFERENCES public.works(id) ON DELETE CASCADE,
  kind             TEXT        NOT NULL CHECK (kind IN ('image','video')),
  storage_path     TEXT        NOT NULL,
  mime_type        TEXT        NULL,
  size_bytes       BIGINT      NULL,
  width            INT         NULL,
  height           INT         NULL,
  duration_seconds NUMERIC     NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_daily_log_media_revision
  ON public.work_daily_log_media(revision_id);
CREATE INDEX IF NOT EXISTS idx_daily_log_media_work
  ON public.work_daily_log_media(work_id);

-- -----------------------------------------------------------------------------
-- 4. Estender work_milestones com colunas de aprovacao
--    Cada coluna tem ADD COLUMN IF NOT EXISTS proprio (sintaxe Postgres correta).
-- -----------------------------------------------------------------------------
ALTER TABLE public.work_milestones
  ADD COLUMN IF NOT EXISTS reported_by UUID NULL REFERENCES auth.users(id);
ALTER TABLE public.work_milestones
  ADD COLUMN IF NOT EXISTS reported_at TIMESTAMPTZ NULL;
ALTER TABLE public.work_milestones
  ADD COLUMN IF NOT EXISTS approved_by UUID NULL REFERENCES auth.users(id);
ALTER TABLE public.work_milestones
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ NULL;
ALTER TABLE public.work_milestones
  ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMPTZ NULL;
ALTER TABLE public.work_milestones
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT NULL;
ALTER TABLE public.work_milestones
  ADD COLUMN IF NOT EXISTS notes TEXT NULL;
ALTER TABLE public.work_milestones
  ADD COLUMN IF NOT EXISTS evidence_media_ids JSONB NOT NULL DEFAULT '[]'::jsonb;

-- -----------------------------------------------------------------------------
-- 5. work_milestone_events - historico de transicoes (reported, approved,
--    rejected, reset). 'reset' nao e usado nesta fase mas reservado para
--    casos de retomada apos rejeicao quando manager registra ajuste.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.work_milestone_events (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  milestone_id    UUID        NOT NULL REFERENCES public.work_milestones(id) ON DELETE CASCADE,
  work_id         UUID        NOT NULL REFERENCES public.works(id) ON DELETE CASCADE,
  event_type      TEXT        NOT NULL CHECK (event_type IN ('reported','approved','rejected','reset')),
  actor_id        UUID        NOT NULL REFERENCES auth.users(id),
  actor_role      TEXT        NOT NULL CHECK (actor_role IN ('engineer','manager')),
  notes           TEXT        NULL,
  client_event_id UUID        NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_milestone_events_milestone_created
  ON public.work_milestone_events(milestone_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_milestone_events_client_event
  ON public.work_milestone_events(client_event_id)
  WHERE client_event_id IS NOT NULL;

-- -----------------------------------------------------------------------------
-- 6. work_milestone_event_media - midia de evidencia anexa a um evento
--    Path: {work_id}/milestones/{milestone_id}/{event_id}/{uuid}.{ext}
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.work_milestone_event_media (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id     UUID        NOT NULL REFERENCES public.work_milestone_events(id) ON DELETE CASCADE,
  work_id      UUID        NOT NULL REFERENCES public.works(id) ON DELETE CASCADE,
  milestone_id UUID        NOT NULL REFERENCES public.work_milestones(id) ON DELETE CASCADE,
  kind         TEXT        NOT NULL CHECK (kind IN ('image','video')),
  storage_path TEXT        NOT NULL,
  mime_type    TEXT        NULL,
  size_bytes   BIGINT      NULL,
  width        INT         NULL,
  height       INT         NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_milestone_event_media_event
  ON public.work_milestone_event_media(event_id);
CREATE INDEX IF NOT EXISTS idx_milestone_event_media_milestone
  ON public.work_milestone_event_media(milestone_id);

-- =============================================================================
-- TRIGGERS - protect_fields (BEFORE UPDATE, estritos: RAISE EXCEPTION)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 7. work_daily_logs_protect_fields
--    Engineer membro pode mudar: status (apenas pending_approval -> approved
--      ou pending_approval -> rejected), approved_by, approved_at, rejected_at,
--      current_revision_id (excepcionalmente, ao limpar ponteiro), updated_at
--    Manager membro pode mudar: current_revision_id, status (apenas
--      rejected -> pending_approval), updated_at
--    Demais alteracoes: RAISE EXCEPTION.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.work_daily_logs_protect_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_role TEXT;
BEGIN
  -- Campos imutaveis em qualquer caso.
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.work_id IS DISTINCT FROM OLD.work_id
     OR NEW.log_date IS DISTINCT FROM OLD.log_date
     OR NEW.published_by IS DISTINCT FROM OLD.published_by
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'Colunas imutaveis nao podem ser alteradas em work_daily_logs';
  END IF;

  SELECT role INTO v_role
    FROM public.work_members
   WHERE work_id = NEW.work_id
     AND user_id = auth.uid();

  IF v_role IS NULL THEN
    RAISE EXCEPTION 'Usuario nao e membro da obra';
  END IF;

  IF v_role = 'engineer' THEN
    -- Engineer: aprovar (pending -> approved) ou rejeitar (pending -> rejected).
    IF OLD.status = 'pending_approval' AND NEW.status = 'approved' THEN
      IF NEW.approved_by IS DISTINCT FROM auth.uid() THEN
        RAISE EXCEPTION 'approved_by deve ser o engenheiro que aprovou';
      END IF;
      IF NEW.approved_at IS NULL THEN
        RAISE EXCEPTION 'approved_at obrigatorio na aprovacao';
      END IF;
    ELSIF OLD.status = 'pending_approval' AND NEW.status = 'rejected' THEN
      IF NEW.rejected_at IS NULL THEN
        RAISE EXCEPTION 'rejected_at obrigatorio na rejeicao';
      END IF;
    ELSIF OLD.status = NEW.status THEN
      -- Permite atualizacoes que nao mexem no status (ex.: ajustes de updated_at).
      NULL;
    ELSE
      RAISE EXCEPTION 'Engineer pode aprovar ou rejeitar diarios em pending_approval (status atual %, novo %)',
        OLD.status, NEW.status;
    END IF;
  ELSIF v_role = 'manager' THEN
    -- Manager: republicacao (rejected -> pending_approval) atualizando current_revision_id.
    IF OLD.status = 'rejected' AND NEW.status = 'pending_approval' THEN
      IF NEW.current_revision_id IS NULL OR NEW.current_revision_id = OLD.current_revision_id THEN
        RAISE EXCEPTION 'Republicacao requer nova current_revision_id';
      END IF;
      IF NEW.rejected_at IS DISTINCT FROM NULL THEN
        RAISE EXCEPTION 'rejected_at deve ser limpo na republicacao';
      END IF;
      IF NEW.approved_by IS DISTINCT FROM NULL OR NEW.approved_at IS DISTINCT FROM NULL THEN
        RAISE EXCEPTION 'approved_by e approved_at devem ser nulos na republicacao';
      END IF;
    ELSIF OLD.status = NEW.status AND NEW.current_revision_id IS DISTINCT FROM OLD.current_revision_id THEN
      -- Manager nao deve atualizar current_revision_id sem mudar status.
      RAISE EXCEPTION 'Manager so pode atualizar current_revision_id ao republicar';
    ELSIF OLD.status = NEW.status THEN
      -- Sem mudanca relevante.
      NULL;
    ELSE
      RAISE EXCEPTION 'Manager so pode republicar diarios rejeitados (status atual %, novo %)',
        OLD.status, NEW.status;
    END IF;
  ELSE
    RAISE EXCEPTION 'Papel invalido em work_daily_logs_protect_fields: %', v_role;
  END IF;

  RETURN NEW;
END;
$$;

ALTER FUNCTION public.work_daily_logs_protect_fields()
  SET search_path = public, auth;

DROP TRIGGER IF EXISTS trg_work_daily_logs_protect ON public.work_daily_logs;
CREATE TRIGGER trg_work_daily_logs_protect
  BEFORE UPDATE ON public.work_daily_logs
  FOR EACH ROW EXECUTE FUNCTION public.work_daily_logs_protect_fields();

-- -----------------------------------------------------------------------------
-- 8. work_milestones_protect_fields
--    Engineer membro pode mudar: status (awaiting_approval -> approved|rejected),
--      approved_by, approved_at, rejected_at, rejection_reason, updated_at
--    Manager membro pode mudar: status (pending|in_progress|rejected ->
--      awaiting_approval), status (pending -> in_progress), reported_by,
--      reported_at, notes, evidence_media_ids, updated_at
--    Imutaveis: id, work_id, code, name, order_index, created_at
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.work_milestones_protect_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_role TEXT;
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.work_id IS DISTINCT FROM OLD.work_id
     OR NEW.code IS DISTINCT FROM OLD.code
     OR NEW.name IS DISTINCT FROM OLD.name
     OR NEW.order_index IS DISTINCT FROM OLD.order_index
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'Colunas imutaveis nao podem ser alteradas em work_milestones';
  END IF;

  SELECT role INTO v_role
    FROM public.work_members
   WHERE work_id = NEW.work_id
     AND user_id = auth.uid();

  IF v_role IS NULL THEN
    RAISE EXCEPTION 'Usuario nao e membro da obra';
  END IF;

  IF v_role = 'engineer' THEN
    IF OLD.status = 'awaiting_approval' AND NEW.status = 'approved' THEN
      IF NEW.approved_by IS DISTINCT FROM auth.uid() THEN
        RAISE EXCEPTION 'approved_by deve ser o engenheiro que aprovou';
      END IF;
      IF NEW.approved_at IS NULL THEN
        RAISE EXCEPTION 'approved_at obrigatorio na aprovacao do marco';
      END IF;
    ELSIF OLD.status = 'awaiting_approval' AND NEW.status = 'rejected' THEN
      IF NEW.rejected_at IS NULL THEN
        RAISE EXCEPTION 'rejected_at obrigatorio na rejeicao do marco';
      END IF;
    ELSIF OLD.status = NEW.status THEN
      NULL;
    ELSE
      RAISE EXCEPTION 'Engineer so pode aprovar/rejeitar marcos em awaiting_approval (atual %, novo %)',
        OLD.status, NEW.status;
    END IF;
  ELSIF v_role = 'manager' THEN
    IF OLD.status IN ('pending','in_progress','rejected') AND NEW.status = 'awaiting_approval' THEN
      IF NEW.reported_by IS DISTINCT FROM auth.uid() THEN
        RAISE EXCEPTION 'reported_by deve ser o gerente que reportou';
      END IF;
      IF NEW.reported_at IS NULL THEN
        RAISE EXCEPTION 'reported_at obrigatorio ao reportar marco';
      END IF;
      -- Limpar campos de aprovacao previa, se vinha de rejected.
      IF NEW.approved_by IS DISTINCT FROM NULL OR NEW.approved_at IS DISTINCT FROM NULL THEN
        RAISE EXCEPTION 'approved_by e approved_at devem ser nulos ao re-reportar';
      END IF;
    ELSIF OLD.status = 'pending' AND NEW.status = 'in_progress' THEN
      -- Transicao opcional para visibilidade. Sem campos de approval mexidos.
      NULL;
    ELSIF OLD.status = NEW.status THEN
      NULL;
    ELSE
      RAISE EXCEPTION 'Manager nao pode transicionar marco de % para %', OLD.status, NEW.status;
    END IF;
  ELSE
    RAISE EXCEPTION 'Papel invalido em work_milestones_protect_fields: %', v_role;
  END IF;

  RETURN NEW;
END;
$$;

ALTER FUNCTION public.work_milestones_protect_fields()
  SET search_path = public, auth;

DROP TRIGGER IF EXISTS trg_work_milestones_protect ON public.work_milestones;
CREATE TRIGGER trg_work_milestones_protect
  BEFORE UPDATE ON public.work_milestones
  FOR EACH ROW EXECUTE FUNCTION public.work_milestones_protect_fields();

-- =============================================================================
-- TRIGGERS - notificacao (AFTER, tolerantes: RAISE WARNING + RETURN NEW)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 9. on_new_daily_log_published_notify - AFTER INSERT em work_daily_log_revisions
--    Notifica engenheiro APENAS quando revision_number = 1 (primeira publicacao).
--    Republicacao apos rejeicao usa trigger 10 (UPDATE em work_daily_logs).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.on_new_daily_log_published_notify()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_log     RECORD;
  v_work    RECORD;
  v_preview TEXT;
BEGIN
  IF NEW.revision_number <> 1 THEN
    RETURN NEW;
  END IF;

  BEGIN
    SELECT id, work_id INTO v_log
      FROM public.work_daily_logs
     WHERE id = NEW.daily_log_id;

    IF NOT FOUND THEN
      RAISE WARNING 'Diario % nao encontrado para notificacao', NEW.daily_log_id;
      RETURN NEW;
    END IF;

    SELECT id, name, engineer_id INTO v_work
      FROM public.works
     WHERE id = v_log.work_id;

    IF NOT FOUND THEN
      RAISE WARNING 'Obra % nao encontrada para notificacao de diario', v_log.work_id;
      RETURN NEW;
    END IF;

    v_preview := left(coalesce(NEW.activities, ''), 80);
    IF length(coalesce(NEW.activities, '')) > 80 THEN
      v_preview := v_preview || '...';
    END IF;

    INSERT INTO public.notifications (user_id, work_id, kind, title, body, link_path)
    VALUES (
      v_work.engineer_id,
      v_work.id,
      'daily_log_published',
      'Diario publicado em ' || v_work.name,
      v_preview,
      '/tools/andamento-obra/obras/' || v_work.id::text || '/diario'
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Falha ao notificar publicacao de diario: %', SQLERRM;
  END;

  RETURN NEW;
END;
$$;

ALTER FUNCTION public.on_new_daily_log_published_notify()
  SET search_path = public, auth;

DROP TRIGGER IF EXISTS trg_daily_log_published_notify ON public.work_daily_log_revisions;
CREATE TRIGGER trg_daily_log_published_notify
  AFTER INSERT ON public.work_daily_log_revisions
  FOR EACH ROW EXECUTE FUNCTION public.on_new_daily_log_published_notify();

-- -----------------------------------------------------------------------------
-- 10. on_daily_log_republished_notify - AFTER UPDATE em work_daily_logs
--     quando status: rejected -> pending_approval (republicacao apos rejeicao).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.on_daily_log_republished_notify()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_work     RECORD;
  v_revision RECORD;
  v_preview  TEXT;
BEGIN
  IF NOT (OLD.status = 'rejected' AND NEW.status = 'pending_approval') THEN
    RETURN NEW;
  END IF;

  BEGIN
    SELECT id, name, engineer_id INTO v_work
      FROM public.works
     WHERE id = NEW.work_id;

    IF NOT FOUND THEN
      RAISE WARNING 'Obra % nao encontrada (republicacao)', NEW.work_id;
      RETURN NEW;
    END IF;

    SELECT activities INTO v_revision
      FROM public.work_daily_log_revisions
     WHERE id = NEW.current_revision_id;

    v_preview := left(coalesce(v_revision.activities, ''), 80);
    IF length(coalesce(v_revision.activities, '')) > 80 THEN
      v_preview := v_preview || '...';
    END IF;

    INSERT INTO public.notifications (user_id, work_id, kind, title, body, link_path)
    VALUES (
      v_work.engineer_id,
      v_work.id,
      'daily_log_published',
      'Diario republicado em ' || v_work.name,
      v_preview,
      '/tools/andamento-obra/obras/' || v_work.id::text || '/diario'
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Falha ao notificar republicacao de diario: %', SQLERRM;
  END;

  RETURN NEW;
END;
$$;

ALTER FUNCTION public.on_daily_log_republished_notify()
  SET search_path = public, auth;

DROP TRIGGER IF EXISTS trg_daily_log_republished_notify ON public.work_daily_logs;
CREATE TRIGGER trg_daily_log_republished_notify
  AFTER UPDATE ON public.work_daily_logs
  FOR EACH ROW EXECUTE FUNCTION public.on_daily_log_republished_notify();

-- -----------------------------------------------------------------------------
-- 11. on_daily_log_decision_notify - AFTER UPDATE em work_daily_logs
--     quando status: pending_approval -> approved|rejected. Notifica MANAGER.
--     Se obra nao tem manager (manager_id IS NULL), pula silenciosamente.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.on_daily_log_decision_notify()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_work     RECORD;
  v_revision RECORD;
  v_kind     TEXT;
  v_title    TEXT;
  v_body     TEXT;
BEGIN
  IF NOT (OLD.status = 'pending_approval' AND NEW.status IN ('approved','rejected')) THEN
    RETURN NEW;
  END IF;

  BEGIN
    SELECT id, name, manager_id INTO v_work
      FROM public.works
     WHERE id = NEW.work_id;

    IF NOT FOUND OR v_work.manager_id IS NULL THEN
      -- Obra sem gerente: nao gera notificacao.
      RETURN NEW;
    END IF;

    IF NEW.status = 'approved' THEN
      v_kind  := 'daily_log_approved';
      v_title := 'Diario aprovado em ' || v_work.name;
      v_body  := 'Seu diario foi aprovado pelo engenheiro.';
    ELSE
      v_kind  := 'daily_log_rejected';
      v_title := 'Diario rejeitado em ' || v_work.name;

      SELECT rejection_reason INTO v_revision
        FROM public.work_daily_log_revisions
       WHERE id = NEW.current_revision_id;

      IF v_revision.rejection_reason IS NOT NULL AND length(v_revision.rejection_reason) > 0 THEN
        v_body := left(v_revision.rejection_reason, 160);
        IF length(v_revision.rejection_reason) > 160 THEN
          v_body := v_body || '...';
        END IF;
      ELSE
        v_body := 'Seu diario foi rejeitado.';
      END IF;
    END IF;

    INSERT INTO public.notifications (user_id, work_id, kind, title, body, link_path)
    VALUES (
      v_work.manager_id,
      v_work.id,
      v_kind,
      v_title,
      v_body,
      '/tools/andamento-obra/obras/' || v_work.id::text || '/diario'
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Falha ao notificar decisao de diario: %', SQLERRM;
  END;

  RETURN NEW;
END;
$$;

ALTER FUNCTION public.on_daily_log_decision_notify()
  SET search_path = public, auth;

DROP TRIGGER IF EXISTS trg_daily_log_decision_notify ON public.work_daily_logs;
CREATE TRIGGER trg_daily_log_decision_notify
  AFTER UPDATE ON public.work_daily_logs
  FOR EACH ROW EXECUTE FUNCTION public.on_daily_log_decision_notify();

-- -----------------------------------------------------------------------------
-- 12. on_milestone_reported_notify - AFTER UPDATE em work_milestones
--     quando status -> awaiting_approval. Notifica engineer.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.on_milestone_reported_notify()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_work RECORD;
BEGIN
  IF NOT (OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'awaiting_approval') THEN
    RETURN NEW;
  END IF;

  BEGIN
    SELECT id, name, engineer_id INTO v_work
      FROM public.works
     WHERE id = NEW.work_id;

    IF NOT FOUND THEN
      RAISE WARNING 'Obra % nao encontrada (marco reportado)', NEW.work_id;
      RETURN NEW;
    END IF;

    INSERT INTO public.notifications (user_id, work_id, kind, title, body, link_path)
    VALUES (
      v_work.engineer_id,
      v_work.id,
      'milestone_reported',
      'Marco reportado em ' || v_work.name,
      NEW.name || ' aguarda aprovacao.',
      '/tools/andamento-obra/obras/' || v_work.id::text || '/progresso'
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Falha ao notificar reporte de marco: %', SQLERRM;
  END;

  RETURN NEW;
END;
$$;

ALTER FUNCTION public.on_milestone_reported_notify()
  SET search_path = public, auth;

DROP TRIGGER IF EXISTS trg_milestone_reported_notify ON public.work_milestones;
CREATE TRIGGER trg_milestone_reported_notify
  AFTER UPDATE ON public.work_milestones
  FOR EACH ROW EXECUTE FUNCTION public.on_milestone_reported_notify();

-- -----------------------------------------------------------------------------
-- 13. on_milestone_decision_notify - AFTER UPDATE em work_milestones
--     quando status -> approved|rejected. Notifica manager (se houver).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.on_milestone_decision_notify()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_work  RECORD;
  v_kind  TEXT;
  v_title TEXT;
  v_body  TEXT;
BEGIN
  IF NOT (OLD.status = 'awaiting_approval' AND NEW.status IN ('approved','rejected')) THEN
    RETURN NEW;
  END IF;

  BEGIN
    SELECT id, name, manager_id INTO v_work
      FROM public.works
     WHERE id = NEW.work_id;

    IF NOT FOUND OR v_work.manager_id IS NULL THEN
      RETURN NEW;
    END IF;

    IF NEW.status = 'approved' THEN
      v_kind  := 'milestone_approved';
      v_title := 'Marco aprovado em ' || v_work.name;
      v_body  := NEW.name || ' foi aprovado.';
    ELSE
      v_kind  := 'milestone_rejected';
      v_title := 'Marco rejeitado em ' || v_work.name;
      IF NEW.rejection_reason IS NOT NULL AND length(NEW.rejection_reason) > 0 THEN
        v_body := left(NEW.rejection_reason, 160);
        IF length(NEW.rejection_reason) > 160 THEN
          v_body := v_body || '...';
        END IF;
      ELSE
        v_body := NEW.name || ' foi rejeitado.';
      END IF;
    END IF;

    INSERT INTO public.notifications (user_id, work_id, kind, title, body, link_path)
    VALUES (
      v_work.manager_id,
      v_work.id,
      v_kind,
      v_title,
      v_body,
      '/tools/andamento-obra/obras/' || v_work.id::text || '/progresso'
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Falha ao notificar decisao de marco: %', SQLERRM;
  END;

  RETURN NEW;
END;
$$;

ALTER FUNCTION public.on_milestone_decision_notify()
  SET search_path = public, auth;

DROP TRIGGER IF EXISTS trg_milestone_decision_notify ON public.work_milestones;
CREATE TRIGGER trg_milestone_decision_notify
  AFTER UPDATE ON public.work_milestones
  FOR EACH ROW EXECUTE FUNCTION public.on_milestone_decision_notify();

-- =============================================================================
-- TRIGGERS - last_activity_at (AFTER, tolerantes)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 14. update_work_last_activity_on_daily_log - AFTER INSERT em revisoes.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_work_last_activity_on_daily_log()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  BEGIN
    UPDATE public.works
       SET last_activity_at = now()
     WHERE id = (
       SELECT work_id FROM public.work_daily_logs WHERE id = NEW.daily_log_id
     );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Falha em update_work_last_activity_on_daily_log: %', SQLERRM;
  END;
  RETURN NEW;
END;
$$;

ALTER FUNCTION public.update_work_last_activity_on_daily_log()
  SET search_path = public, auth;

DROP TRIGGER IF EXISTS trg_daily_log_last_activity ON public.work_daily_log_revisions;
CREATE TRIGGER trg_daily_log_last_activity
  AFTER INSERT ON public.work_daily_log_revisions
  FOR EACH ROW EXECUTE FUNCTION public.update_work_last_activity_on_daily_log();

-- -----------------------------------------------------------------------------
-- 15. update_work_last_activity_on_milestone - AFTER UPDATE em marcos
--     quando status mudou.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_work_last_activity_on_milestone()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    BEGIN
      UPDATE public.works
         SET last_activity_at = now()
       WHERE id = NEW.work_id;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Falha em update_work_last_activity_on_milestone: %', SQLERRM;
    END;
  END IF;
  RETURN NEW;
END;
$$;

ALTER FUNCTION public.update_work_last_activity_on_milestone()
  SET search_path = public, auth;

DROP TRIGGER IF EXISTS trg_milestone_last_activity ON public.work_milestones;
CREATE TRIGGER trg_milestone_last_activity
  AFTER UPDATE ON public.work_milestones
  FOR EACH ROW EXECUTE FUNCTION public.update_work_last_activity_on_milestone();

-- =============================================================================
-- HARDENING: revogar EXECUTE de funcoes SECURITY DEFINER (lints 0028/0029)
-- =============================================================================
REVOKE EXECUTE ON FUNCTION public.on_new_daily_log_published_notify()
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.on_daily_log_republished_notify()
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.on_daily_log_decision_notify()
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.on_milestone_reported_notify()
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.on_milestone_decision_notify()
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_work_last_activity_on_daily_log()
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_work_last_activity_on_milestone()
  FROM PUBLIC, anon, authenticated;

-- =============================================================================
-- RLS - work_daily_logs
-- =============================================================================
ALTER TABLE public.work_daily_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "work_daily_logs_select" ON public.work_daily_logs;
CREATE POLICY "work_daily_logs_select" ON public.work_daily_logs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.work_members wm
      WHERE wm.work_id = work_daily_logs.work_id
        AND wm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "work_daily_logs_insert" ON public.work_daily_logs;
CREATE POLICY "work_daily_logs_insert" ON public.work_daily_logs
  FOR INSERT
  WITH CHECK (
    auth.uid() = published_by
    AND EXISTS (
      SELECT 1 FROM public.work_members wm
      WHERE wm.work_id = work_daily_logs.work_id
        AND wm.user_id = auth.uid()
        AND wm.role = 'manager'
    )
  );

DROP POLICY IF EXISTS "work_daily_logs_update" ON public.work_daily_logs;
CREATE POLICY "work_daily_logs_update" ON public.work_daily_logs
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.work_members wm
      WHERE wm.work_id = work_daily_logs.work_id
        AND wm.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.work_members wm
      WHERE wm.work_id = work_daily_logs.work_id
        AND wm.user_id = auth.uid()
    )
  );

-- DELETE: sem policy = bloqueado.

-- =============================================================================
-- RLS - work_daily_log_revisions
-- =============================================================================
ALTER TABLE public.work_daily_log_revisions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "work_daily_log_revisions_select" ON public.work_daily_log_revisions;
CREATE POLICY "work_daily_log_revisions_select" ON public.work_daily_log_revisions
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.work_daily_logs dl
      JOIN public.work_members wm ON wm.work_id = dl.work_id
      WHERE dl.id = work_daily_log_revisions.daily_log_id
        AND wm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "work_daily_log_revisions_insert" ON public.work_daily_log_revisions;
CREATE POLICY "work_daily_log_revisions_insert" ON public.work_daily_log_revisions
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.work_daily_logs dl
      JOIN public.work_members wm ON wm.work_id = dl.work_id
      WHERE dl.id = work_daily_log_revisions.daily_log_id
        AND wm.user_id = auth.uid()
        AND wm.role = 'manager'
    )
  );

-- UPDATE/DELETE: sem policy = imutaveis apos criadas.

-- =============================================================================
-- RLS - work_daily_log_media
-- =============================================================================
ALTER TABLE public.work_daily_log_media ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "work_daily_log_media_select" ON public.work_daily_log_media;
CREATE POLICY "work_daily_log_media_select" ON public.work_daily_log_media
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.work_members wm
      WHERE wm.work_id = work_daily_log_media.work_id
        AND wm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "work_daily_log_media_insert" ON public.work_daily_log_media;
CREATE POLICY "work_daily_log_media_insert" ON public.work_daily_log_media
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.work_daily_logs dl
      JOIN public.work_members wm ON wm.work_id = dl.work_id
      WHERE dl.id = work_daily_log_media.daily_log_id
        AND dl.work_id = work_daily_log_media.work_id
        AND wm.user_id = auth.uid()
        AND wm.role = 'manager'
    )
  );

-- UPDATE/DELETE: bloqueados.

-- =============================================================================
-- RLS - estender work_milestones para UPDATE
-- =============================================================================
-- O Bloco 2 ja criou SELECT. Adicionar UPDATE permitindo membros mexerem;
-- as restricoes finas vem do trigger work_milestones_protect_fields.
DROP POLICY IF EXISTS "work_milestones_update" ON public.work_milestones;
CREATE POLICY "work_milestones_update" ON public.work_milestones
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.work_members wm
      WHERE wm.work_id = work_milestones.work_id
        AND wm.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.work_members wm
      WHERE wm.work_id = work_milestones.work_id
        AND wm.user_id = auth.uid()
    )
  );

-- INSERT/DELETE continuam bloqueados (criacao via trigger seed_work_defaults).

-- =============================================================================
-- RLS - work_milestone_events
-- =============================================================================
ALTER TABLE public.work_milestone_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "work_milestone_events_select" ON public.work_milestone_events;
CREATE POLICY "work_milestone_events_select" ON public.work_milestone_events
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.work_members wm
      WHERE wm.work_id = work_milestone_events.work_id
        AND wm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "work_milestone_events_insert" ON public.work_milestone_events;
CREATE POLICY "work_milestone_events_insert" ON public.work_milestone_events
  FOR INSERT
  WITH CHECK (
    auth.uid() = actor_id
    AND EXISTS (
      SELECT 1 FROM public.work_members wm
      WHERE wm.work_id = work_milestone_events.work_id
        AND wm.user_id = auth.uid()
        AND wm.role = work_milestone_events.actor_role
    )
  );

-- UPDATE/DELETE: bloqueados (eventos sao imutaveis).

-- =============================================================================
-- RLS - work_milestone_event_media
-- =============================================================================
ALTER TABLE public.work_milestone_event_media ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "work_milestone_event_media_select" ON public.work_milestone_event_media;
CREATE POLICY "work_milestone_event_media_select" ON public.work_milestone_event_media
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.work_members wm
      WHERE wm.work_id = work_milestone_event_media.work_id
        AND wm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "work_milestone_event_media_insert" ON public.work_milestone_event_media;
CREATE POLICY "work_milestone_event_media_insert" ON public.work_milestone_event_media
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.work_milestone_events e
      WHERE e.id = work_milestone_event_media.event_id
        AND e.work_id = work_milestone_event_media.work_id
        AND e.milestone_id = work_milestone_event_media.milestone_id
        AND e.actor_id = auth.uid()
    )
  );

-- UPDATE/DELETE: bloqueados.

-- =============================================================================
-- STORAGE POLICIES - daily-logs/ e milestones/
-- =============================================================================
-- Path layout:
--   {work_id}/daily-logs/{daily_log_id}/{revision_id}/{file}.{ext}
--   {work_id}/milestones/{milestone_id}/{event_id}/{file}.{ext}

DROP POLICY IF EXISTS "andamento_obra_storage_insert_daily_logs" ON storage.objects;
CREATE POLICY "andamento_obra_storage_insert_daily_logs" ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'andamento-obra'
    AND (storage.foldername(name))[2] = 'daily-logs'
    AND EXISTS (
      SELECT 1 FROM public.work_members wm
      WHERE wm.user_id = auth.uid()
        AND wm.role = 'manager'
        AND wm.work_id::text = (storage.foldername(name))[1]
    )
  );

DROP POLICY IF EXISTS "andamento_obra_storage_insert_milestones" ON storage.objects;
CREATE POLICY "andamento_obra_storage_insert_milestones" ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'andamento-obra'
    AND (storage.foldername(name))[2] = 'milestones'
    AND EXISTS (
      SELECT 1 FROM public.work_members wm
      WHERE wm.user_id = auth.uid()
        AND wm.role = 'manager'
        AND wm.work_id::text = (storage.foldername(name))[1]
    )
  );

-- =============================================================================
-- REALTIME - publicacao supabase_realtime
-- =============================================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime'
  ) THEN
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.work_daily_logs;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;

    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.work_daily_log_revisions;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;

    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.work_milestones;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;

    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.work_milestone_events;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END IF;
END $$;
