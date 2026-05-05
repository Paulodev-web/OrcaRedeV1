-- =============================================================================
-- Andamento de Obra - Checklists, Alertas e Equipe (Bloco 8)
--
-- Tabelas novas (9):
--   - checklist_templates          (modelos reutilizaveis do engineer)
--   - checklist_template_items     (itens dentro de um modelo)
--   - work_checklists              (instancia atribuida a uma obra)
--   - work_checklist_items         (estado de cada item da instancia)
--   - work_checklist_item_media    (fotos anexadas ao marcar item)
--   - work_alerts                  (alertas/emergencias em campo)
--   - work_alert_updates           (historico de tratativas)
--   - work_alert_media             (fotos do alerta e tratativas)
--   - work_team                    (alocacao de crew na obra)
--   - work_team_attendance         (presenca diaria via trigger)
--
-- Triggers:
--   - protect_fields (BEFORE UPDATE, estritos):
--       work_checklists_protect_fields
--       work_checklist_items_protect_fields
--       work_alerts_protect_fields
--   - instanciacao (AFTER INSERT, estrito):
--       on_work_checklist_assigned
--   - auto-completion (AFTER UPDATE, tolerante):
--       on_checklist_item_marked
--   - notificacao (AFTER, tolerantes):
--       on_checklist_decision_notify
--       on_alert_opened_notify
--       on_alert_status_change_notify
--   - presenca (AFTER UPDATE, tolerante):
--       on_daily_log_approved_attendance
--   - last_activity_at (AFTER, tolerantes):
--       update_work_last_activity_on_checklist
--       update_work_last_activity_on_alert
--
-- RLS: por papel (engineer/manager) com restricoes por trigger.
-- Storage: policies para paths checklists/ e alerts/.
-- Realtime: publicacao supabase_realtime para 6 tabelas.
-- =============================================================================

-- =============================================================================
-- 1. TABELAS - CHECKLISTS
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1.1 checklist_templates - modelos reutilizaveis criados pelo engineer
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.checklist_templates (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  engineer_id   UUID        NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  name          TEXT        NOT NULL,
  description   TEXT        NULL,
  is_default    BOOLEAN     NOT NULL DEFAULT false,
  is_active     BOOLEAN     NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_checklist_templates_engineer_active
  ON public.checklist_templates(engineer_id, is_active);
CREATE UNIQUE INDEX IF NOT EXISTS idx_checklist_templates_engineer_default
  ON public.checklist_templates(engineer_id) WHERE is_default = true AND is_active = true;

CREATE OR REPLACE FUNCTION public.update_checklist_templates_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

ALTER FUNCTION public.update_checklist_templates_updated_at()
  SET search_path = public, auth;

DROP TRIGGER IF EXISTS trg_checklist_templates_updated_at ON public.checklist_templates;
CREATE TRIGGER trg_checklist_templates_updated_at
  BEFORE UPDATE ON public.checklist_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_checklist_templates_updated_at();

-- -----------------------------------------------------------------------------
-- 1.2 checklist_template_items - itens dentro de um modelo
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.checklist_template_items (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id    UUID        NOT NULL REFERENCES public.checklist_templates(id) ON DELETE CASCADE,
  order_index    INT         NOT NULL,
  label          TEXT        NOT NULL,
  description    TEXT        NULL,
  requires_photo BOOLEAN     NOT NULL DEFAULT false,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(template_id, order_index)
);

CREATE INDEX IF NOT EXISTS idx_checklist_template_items_template
  ON public.checklist_template_items(template_id, order_index);

-- -----------------------------------------------------------------------------
-- 1.3 work_checklists - instancia de checklist atribuida a uma obra
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.work_checklists (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  work_id           UUID        NOT NULL REFERENCES public.works(id) ON DELETE CASCADE,
  template_id       UUID        NULL REFERENCES public.checklist_templates(id) ON DELETE SET NULL,
  template_snapshot JSONB       NOT NULL,
  name              TEXT        NOT NULL,
  description       TEXT        NULL,
  assigned_by       UUID        NOT NULL REFERENCES auth.users(id),
  assigned_to       UUID        NULL REFERENCES auth.users(id),
  due_date          DATE        NULL,
  status            TEXT        NOT NULL DEFAULT 'pending'
                                CHECK (status IN ('pending','in_progress','awaiting_validation','validated','returned')),
  validated_by      UUID        NULL REFERENCES auth.users(id),
  validated_at      TIMESTAMPTZ NULL,
  returned_at       TIMESTAMPTZ NULL,
  return_reason     TEXT        NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_work_checklists_work_status
  ON public.work_checklists(work_id, status);
CREATE INDEX IF NOT EXISTS idx_work_checklists_assigned
  ON public.work_checklists(assigned_to, status);

CREATE OR REPLACE FUNCTION public.update_work_checklists_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

ALTER FUNCTION public.update_work_checklists_updated_at()
  SET search_path = public, auth;

DROP TRIGGER IF EXISTS trg_work_checklists_updated_at ON public.work_checklists;
CREATE TRIGGER trg_work_checklists_updated_at
  BEFORE UPDATE ON public.work_checklists
  FOR EACH ROW EXECUTE FUNCTION public.update_work_checklists_updated_at();

-- -----------------------------------------------------------------------------
-- 1.4 work_checklist_items - estado de cada item da instancia
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.work_checklist_items (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  work_checklist_id  UUID        NOT NULL REFERENCES public.work_checklists(id) ON DELETE CASCADE,
  order_index        INT         NOT NULL,
  label              TEXT        NOT NULL,
  description        TEXT        NULL,
  requires_photo     BOOLEAN     NOT NULL DEFAULT false,
  is_completed       BOOLEAN     NOT NULL DEFAULT false,
  completed_at       TIMESTAMPTZ NULL,
  completed_by       UUID        NULL REFERENCES auth.users(id),
  notes              TEXT        NULL,
  client_event_id    UUID        NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(work_checklist_id, order_index)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_checklist_items_client_event
  ON public.work_checklist_items(client_event_id) WHERE client_event_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.update_work_checklist_items_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

ALTER FUNCTION public.update_work_checklist_items_updated_at()
  SET search_path = public, auth;

DROP TRIGGER IF EXISTS trg_work_checklist_items_updated_at ON public.work_checklist_items;
CREATE TRIGGER trg_work_checklist_items_updated_at
  BEFORE UPDATE ON public.work_checklist_items
  FOR EACH ROW EXECUTE FUNCTION public.update_work_checklist_items_updated_at();

-- -----------------------------------------------------------------------------
-- 1.5 work_checklist_item_media - fotos anexadas ao marcar item
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.work_checklist_item_media (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id           UUID        NOT NULL REFERENCES public.work_checklist_items(id) ON DELETE CASCADE,
  work_checklist_id UUID        NOT NULL REFERENCES public.work_checklists(id) ON DELETE CASCADE,
  work_id           UUID        NOT NULL REFERENCES public.works(id) ON DELETE CASCADE,
  kind              TEXT        NOT NULL CHECK (kind IN ('image','video')),
  storage_path      TEXT        NOT NULL,
  mime_type         TEXT        NULL,
  size_bytes        BIGINT      NULL,
  width             INT         NULL,
  height            INT         NULL,
  duration_seconds  NUMERIC     NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_checklist_item_media_item
  ON public.work_checklist_item_media(item_id);
CREATE INDEX IF NOT EXISTS idx_checklist_item_media_work
  ON public.work_checklist_item_media(work_id);

-- =============================================================================
-- 2. TABELAS - ALERTAS
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 2.1 work_alerts - alertas/emergencias em campo
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.work_alerts (
  id                     UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  work_id                UUID        NOT NULL REFERENCES public.works(id) ON DELETE CASCADE,
  created_by             UUID        NOT NULL REFERENCES auth.users(id),
  severity               TEXT        NOT NULL CHECK (severity IN ('low','medium','high','critical')),
  category               TEXT        NOT NULL CHECK (category IN ('accident','material_shortage','safety','equipment','weather','other')),
  title                  TEXT        NOT NULL,
  description            TEXT        NOT NULL,
  gps_lat                NUMERIC     NULL,
  gps_lng                NUMERIC     NULL,
  gps_accuracy_meters    NUMERIC     NULL,
  status                 TEXT        NOT NULL DEFAULT 'open'
                                     CHECK (status IN ('open','in_progress','resolved_in_field','closed')),
  field_resolution_at    TIMESTAMPTZ NULL,
  field_resolution_notes TEXT        NULL,
  closed_by              UUID        NULL REFERENCES auth.users(id),
  closed_at              TIMESTAMPTZ NULL,
  closure_notes          TEXT        NULL,
  client_event_id        UUID        NOT NULL,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT work_alerts_client_event_unique UNIQUE (client_event_id),
  CONSTRAINT work_alerts_gps_lat_check CHECK (gps_lat IS NULL OR (gps_lat >= -90 AND gps_lat <= 90)),
  CONSTRAINT work_alerts_gps_lng_check CHECK (gps_lng IS NULL OR (gps_lng >= -180 AND gps_lng <= 180))
);

CREATE INDEX IF NOT EXISTS idx_work_alerts_work_status
  ON public.work_alerts(work_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_work_alerts_work_severity
  ON public.work_alerts(work_id, severity);

CREATE OR REPLACE FUNCTION public.update_work_alerts_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

ALTER FUNCTION public.update_work_alerts_updated_at()
  SET search_path = public, auth;

DROP TRIGGER IF EXISTS trg_work_alerts_updated_at ON public.work_alerts;
CREATE TRIGGER trg_work_alerts_updated_at
  BEFORE UPDATE ON public.work_alerts
  FOR EACH ROW EXECUTE FUNCTION public.update_work_alerts_updated_at();

-- -----------------------------------------------------------------------------
-- 2.2 work_alert_updates - historico de tratativas
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.work_alert_updates (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_id        UUID        NOT NULL REFERENCES public.work_alerts(id) ON DELETE CASCADE,
  work_id         UUID        NOT NULL REFERENCES public.works(id) ON DELETE CASCADE,
  actor_id        UUID        NOT NULL REFERENCES auth.users(id),
  actor_role      TEXT        NOT NULL CHECK (actor_role IN ('engineer','manager')),
  update_type     TEXT        NOT NULL CHECK (update_type IN ('opened','in_progress','resolved_in_field','reopened','closed','comment')),
  notes           TEXT        NULL,
  client_event_id UUID        NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_alert_updates_alert
  ON public.work_alert_updates(alert_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_alert_updates_client_event
  ON public.work_alert_updates(client_event_id) WHERE client_event_id IS NOT NULL;

-- -----------------------------------------------------------------------------
-- 2.3 work_alert_media - fotos do alerta e tratativas
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.work_alert_media (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_id         UUID        NOT NULL REFERENCES public.work_alerts(id) ON DELETE CASCADE,
  update_id        UUID        NULL REFERENCES public.work_alert_updates(id) ON DELETE CASCADE,
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

CREATE INDEX IF NOT EXISTS idx_alert_media_alert ON public.work_alert_media(alert_id);
CREATE INDEX IF NOT EXISTS idx_alert_media_update ON public.work_alert_media(update_id);

-- =============================================================================
-- 3. TABELAS - EQUIPE
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 3.1 work_team - alocacao de crew na obra
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.work_team (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  work_id         UUID        NOT NULL REFERENCES public.works(id) ON DELETE CASCADE,
  crew_member_id  UUID        NOT NULL REFERENCES public.crew_members(id) ON DELETE CASCADE,
  role_in_work    TEXT        NULL,
  allocated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  deallocated_at  TIMESTAMPTZ NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(work_id, crew_member_id)
);

CREATE INDEX IF NOT EXISTS idx_work_team_work
  ON public.work_team(work_id, deallocated_at);

CREATE OR REPLACE FUNCTION public.update_work_team_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

ALTER FUNCTION public.update_work_team_updated_at()
  SET search_path = public, auth;

DROP TRIGGER IF EXISTS trg_work_team_updated_at ON public.work_team;
CREATE TRIGGER trg_work_team_updated_at
  BEFORE UPDATE ON public.work_team
  FOR EACH ROW EXECUTE FUNCTION public.update_work_team_updated_at();

-- -----------------------------------------------------------------------------
-- 3.2 work_team_attendance - presenca diaria (populada por trigger)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.work_team_attendance (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  work_id         UUID        NOT NULL REFERENCES public.works(id) ON DELETE CASCADE,
  crew_member_id  UUID        NOT NULL REFERENCES public.crew_members(id) ON DELETE CASCADE,
  attendance_date DATE        NOT NULL,
  daily_log_id    UUID        NULL REFERENCES public.work_daily_logs(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(work_id, crew_member_id, attendance_date)
);

CREATE INDEX IF NOT EXISTS idx_work_team_attendance_work_date
  ON public.work_team_attendance(work_id, attendance_date DESC);

-- =============================================================================
-- 4. TRIGGERS - protect_fields (BEFORE UPDATE, estritos)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 4.1 work_checklists_protect_fields
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.work_checklists_protect_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_role TEXT;
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.work_id IS DISTINCT FROM OLD.work_id
     OR NEW.template_id IS DISTINCT FROM OLD.template_id
     OR NEW.template_snapshot IS DISTINCT FROM OLD.template_snapshot
     OR NEW.assigned_by IS DISTINCT FROM OLD.assigned_by
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'Colunas imutaveis nao podem ser alteradas em work_checklists';
  END IF;

  SELECT role INTO v_role
    FROM public.work_members
   WHERE work_id = NEW.work_id
     AND user_id = auth.uid();

  IF v_role IS NULL THEN
    RAISE EXCEPTION 'Usuario nao e membro da obra';
  END IF;

  IF v_role = 'manager' THEN
    IF NEW.name IS DISTINCT FROM OLD.name
       OR NEW.description IS DISTINCT FROM OLD.description
       OR NEW.assigned_to IS DISTINCT FROM OLD.assigned_to
       OR NEW.due_date IS DISTINCT FROM OLD.due_date
       OR NEW.validated_by IS DISTINCT FROM OLD.validated_by
       OR NEW.validated_at IS DISTINCT FROM OLD.validated_at
       OR NEW.returned_at IS DISTINCT FROM OLD.returned_at
       OR NEW.return_reason IS DISTINCT FROM OLD.return_reason
    THEN
      RAISE EXCEPTION 'Manager nao pode alterar esses campos em work_checklists';
    END IF;

    IF OLD.status = 'pending' AND NEW.status = 'in_progress' THEN
      NULL;
    ELSIF OLD.status = 'in_progress' AND NEW.status = 'awaiting_validation' THEN
      NULL;
    ELSIF OLD.status = 'returned' AND NEW.status = 'in_progress' THEN
      NULL;
    ELSIF OLD.status = NEW.status THEN
      NULL;
    ELSE
      RAISE EXCEPTION 'Manager: transicao invalida de % para % em work_checklists', OLD.status, NEW.status;
    END IF;

  ELSIF v_role = 'engineer' THEN
    IF OLD.status = 'awaiting_validation' AND NEW.status = 'validated' THEN
      IF NEW.validated_by IS DISTINCT FROM auth.uid() THEN
        RAISE EXCEPTION 'validated_by deve ser o engenheiro que validou';
      END IF;
      IF NEW.validated_at IS NULL THEN
        RAISE EXCEPTION 'validated_at obrigatorio na validacao';
      END IF;
    ELSIF OLD.status = 'awaiting_validation' AND NEW.status = 'returned' THEN
      IF NEW.returned_at IS NULL THEN
        RAISE EXCEPTION 'returned_at obrigatorio ao devolver';
      END IF;
      IF NEW.return_reason IS NULL OR length(trim(NEW.return_reason)) = 0 THEN
        RAISE EXCEPTION 'return_reason obrigatorio ao devolver';
      END IF;
    ELSIF OLD.status = NEW.status THEN
      NULL;
    ELSE
      RAISE EXCEPTION 'Engineer: transicao invalida de % para % em work_checklists', OLD.status, NEW.status;
    END IF;
  ELSE
    RAISE EXCEPTION 'Papel invalido em work_checklists_protect_fields: %', v_role;
  END IF;

  RETURN NEW;
END;
$$;

ALTER FUNCTION public.work_checklists_protect_fields()
  SET search_path = public, auth;

DROP TRIGGER IF EXISTS trg_work_checklists_protect ON public.work_checklists;
CREATE TRIGGER trg_work_checklists_protect
  BEFORE UPDATE ON public.work_checklists
  FOR EACH ROW EXECUTE FUNCTION public.work_checklists_protect_fields();

-- -----------------------------------------------------------------------------
-- 4.2 work_checklist_items_protect_fields
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.work_checklist_items_protect_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_role    TEXT;
  v_work_id UUID;
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.work_checklist_id IS DISTINCT FROM OLD.work_checklist_id
     OR NEW.order_index IS DISTINCT FROM OLD.order_index
     OR NEW.label IS DISTINCT FROM OLD.label
     OR NEW.description IS DISTINCT FROM OLD.description
     OR NEW.requires_photo IS DISTINCT FROM OLD.requires_photo
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'Colunas imutaveis nao podem ser alteradas em work_checklist_items';
  END IF;

  SELECT wc.work_id INTO v_work_id
    FROM public.work_checklists wc
   WHERE wc.id = NEW.work_checklist_id;

  IF v_work_id IS NULL THEN
    RAISE EXCEPTION 'Checklist nao encontrado';
  END IF;

  SELECT role INTO v_role
    FROM public.work_members
   WHERE work_id = v_work_id
     AND user_id = auth.uid();

  IF v_role IS NULL THEN
    RAISE EXCEPTION 'Usuario nao e membro da obra';
  END IF;

  IF v_role = 'engineer' THEN
    RAISE EXCEPTION 'Engineer nao pode alterar itens de checklist diretamente';
  END IF;

  IF v_role <> 'manager' THEN
    RAISE EXCEPTION 'Papel invalido em work_checklist_items_protect_fields: %', v_role;
  END IF;

  RETURN NEW;
END;
$$;

ALTER FUNCTION public.work_checklist_items_protect_fields()
  SET search_path = public, auth;

DROP TRIGGER IF EXISTS trg_work_checklist_items_protect ON public.work_checklist_items;
CREATE TRIGGER trg_work_checklist_items_protect
  BEFORE UPDATE ON public.work_checklist_items
  FOR EACH ROW EXECUTE FUNCTION public.work_checklist_items_protect_fields();

-- -----------------------------------------------------------------------------
-- 4.3 work_alerts_protect_fields
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.work_alerts_protect_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_role TEXT;
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.work_id IS DISTINCT FROM OLD.work_id
     OR NEW.created_by IS DISTINCT FROM OLD.created_by
     OR NEW.severity IS DISTINCT FROM OLD.severity
     OR NEW.category IS DISTINCT FROM OLD.category
     OR NEW.title IS DISTINCT FROM OLD.title
     OR NEW.description IS DISTINCT FROM OLD.description
     OR NEW.gps_lat IS DISTINCT FROM OLD.gps_lat
     OR NEW.gps_lng IS DISTINCT FROM OLD.gps_lng
     OR NEW.gps_accuracy_meters IS DISTINCT FROM OLD.gps_accuracy_meters
     OR NEW.client_event_id IS DISTINCT FROM OLD.client_event_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'Colunas imutaveis nao podem ser alteradas em work_alerts';
  END IF;

  SELECT role INTO v_role
    FROM public.work_members
   WHERE work_id = NEW.work_id
     AND user_id = auth.uid();

  IF v_role IS NULL THEN
    RAISE EXCEPTION 'Usuario nao e membro da obra';
  END IF;

  IF v_role = 'manager' THEN
    IF auth.uid() <> OLD.created_by THEN
      RAISE EXCEPTION 'Apenas o gerente que criou o alerta pode atualiza-lo';
    END IF;

    IF OLD.status = 'open' AND NEW.status = 'in_progress' THEN
      NULL;
    ELSIF OLD.status = 'in_progress' AND NEW.status = 'resolved_in_field' THEN
      IF NEW.field_resolution_at IS NULL THEN
        RAISE EXCEPTION 'field_resolution_at obrigatorio ao resolver em campo';
      END IF;
    ELSIF OLD.status = NEW.status THEN
      NULL;
    ELSE
      RAISE EXCEPTION 'Manager: transicao invalida de % para % em work_alerts', OLD.status, NEW.status;
    END IF;

  ELSIF v_role = 'engineer' THEN
    IF OLD.status = 'open' AND NEW.status = 'in_progress' THEN
      NULL;
    ELSIF OLD.status = 'resolved_in_field' AND NEW.status = 'closed' THEN
      IF NEW.closed_by IS DISTINCT FROM auth.uid() THEN
        RAISE EXCEPTION 'closed_by deve ser o engenheiro que fechou';
      END IF;
      IF NEW.closed_at IS NULL THEN
        RAISE EXCEPTION 'closed_at obrigatorio ao fechar alerta';
      END IF;
    ELSIF OLD.status = 'closed' AND NEW.status = 'in_progress' THEN
      NULL;
    ELSIF OLD.status = NEW.status THEN
      NULL;
    ELSE
      RAISE EXCEPTION 'Engineer: transicao invalida de % para % em work_alerts', OLD.status, NEW.status;
    END IF;
  ELSE
    RAISE EXCEPTION 'Papel invalido em work_alerts_protect_fields: %', v_role;
  END IF;

  RETURN NEW;
END;
$$;

ALTER FUNCTION public.work_alerts_protect_fields()
  SET search_path = public, auth;

DROP TRIGGER IF EXISTS trg_work_alerts_protect ON public.work_alerts;
CREATE TRIGGER trg_work_alerts_protect
  BEFORE UPDATE ON public.work_alerts
  FOR EACH ROW EXECUTE FUNCTION public.work_alerts_protect_fields();

-- =============================================================================
-- 5. TRIGGERS - instanciacao (AFTER INSERT, estrito)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 5.1 on_work_checklist_assigned - cria items a partir do template_snapshot
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.on_work_checklist_assigned()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_item   JSONB;
  v_items  JSONB;
  v_work   RECORD;
BEGIN
  v_items := NEW.template_snapshot->'items';

  IF v_items IS NULL OR jsonb_array_length(v_items) = 0 THEN
    RAISE EXCEPTION 'template_snapshot.items vazio ou ausente ao instanciar checklist';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(v_items)
  LOOP
    INSERT INTO public.work_checklist_items (
      work_checklist_id, order_index, label, description, requires_photo
    ) VALUES (
      NEW.id,
      (v_item->>'order_index')::int,
      v_item->>'label',
      v_item->>'description',
      coalesce((v_item->>'requires_photo')::boolean, false)
    );
  END LOOP;

  BEGIN
    SELECT id, name, manager_id INTO v_work
      FROM public.works
     WHERE id = NEW.work_id;

    IF FOUND AND NEW.assigned_to IS NOT NULL THEN
      INSERT INTO public.notifications (user_id, work_id, kind, title, body, link_path)
      VALUES (
        NEW.assigned_to,
        NEW.work_id,
        'checklist_assigned',
        'Checklist atribuido em ' || v_work.name,
        NEW.name,
        '/tools/andamento-obra/obras/' || NEW.work_id::text || '/checklists'
      );
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Falha ao notificar atribuicao de checklist: %', SQLERRM;
  END;

  RETURN NEW;
END;
$$;

ALTER FUNCTION public.on_work_checklist_assigned()
  SET search_path = public, auth;

DROP TRIGGER IF EXISTS trg_work_checklist_assigned ON public.work_checklists;
CREATE TRIGGER trg_work_checklist_assigned
  AFTER INSERT ON public.work_checklists
  FOR EACH ROW EXECUTE FUNCTION public.on_work_checklist_assigned();

-- =============================================================================
-- 6. TRIGGERS - auto-completion (AFTER UPDATE)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 6.1 on_checklist_item_marked - verifica se todos items completos
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.on_checklist_item_marked()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_all_complete BOOLEAN;
  v_checklist    RECORD;
  v_work         RECORD;
BEGIN
  IF NOT (OLD.is_completed = false AND NEW.is_completed = true) THEN
    RETURN NEW;
  END IF;

  SELECT NOT EXISTS (
    SELECT 1 FROM public.work_checklist_items
    WHERE work_checklist_id = NEW.work_checklist_id
      AND is_completed = false
      AND id <> NEW.id
  ) INTO v_all_complete;

  IF NOT v_all_complete THEN
    RETURN NEW;
  END IF;

  SELECT id, work_id, status INTO v_checklist
    FROM public.work_checklists
   WHERE id = NEW.work_checklist_id;

  IF v_checklist.status NOT IN ('pending', 'in_progress', 'returned') THEN
    RETURN NEW;
  END IF;

  BEGIN
    UPDATE public.work_checklists
       SET status = 'awaiting_validation'
     WHERE id = NEW.work_checklist_id
       AND status IN ('pending', 'in_progress', 'returned');

    SELECT id, name, engineer_id INTO v_work
      FROM public.works
     WHERE id = v_checklist.work_id;

    IF FOUND THEN
      INSERT INTO public.notifications (user_id, work_id, kind, title, body, link_path)
      VALUES (
        v_work.engineer_id,
        v_work.id,
        'checklist_completed',
        'Checklist concluido em ' || v_work.name,
        (SELECT wc.name FROM public.work_checklists wc WHERE wc.id = NEW.work_checklist_id),
        '/tools/andamento-obra/obras/' || v_work.id::text || '/checklists'
      );
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Falha em on_checklist_item_marked: %', SQLERRM;
  END;

  RETURN NEW;
END;
$$;

ALTER FUNCTION public.on_checklist_item_marked()
  SET search_path = public, auth;

DROP TRIGGER IF EXISTS trg_checklist_item_marked ON public.work_checklist_items;
CREATE TRIGGER trg_checklist_item_marked
  AFTER UPDATE ON public.work_checklist_items
  FOR EACH ROW EXECUTE FUNCTION public.on_checklist_item_marked();

-- =============================================================================
-- 7. TRIGGERS - notificacao (AFTER, tolerantes)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 7.1 on_checklist_decision_notify - status validated/returned
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.on_checklist_decision_notify()
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
  IF NOT (OLD.status IS DISTINCT FROM NEW.status AND NEW.status IN ('validated','returned')) THEN
    RETURN NEW;
  END IF;

  BEGIN
    SELECT id, name, manager_id INTO v_work
      FROM public.works
     WHERE id = NEW.work_id;

    IF NOT FOUND OR v_work.manager_id IS NULL THEN
      RETURN NEW;
    END IF;

    IF NEW.status = 'validated' THEN
      v_kind  := 'checklist_validated';
      v_title := 'Checklist validado em ' || v_work.name;
      v_body  := NEW.name || ' foi aprovado pelo engenheiro.';
    ELSE
      v_kind  := 'checklist_returned';
      v_title := 'Checklist devolvido em ' || v_work.name;
      IF NEW.return_reason IS NOT NULL AND length(NEW.return_reason) > 0 THEN
        v_body := left(NEW.return_reason, 160);
        IF length(NEW.return_reason) > 160 THEN
          v_body := v_body || '...';
        END IF;
      ELSE
        v_body := NEW.name || ' foi devolvido.';
      END IF;
    END IF;

    INSERT INTO public.notifications (user_id, work_id, kind, title, body, link_path)
    VALUES (
      v_work.manager_id,
      v_work.id,
      v_kind,
      v_title,
      v_body,
      '/tools/andamento-obra/obras/' || v_work.id::text || '/checklists'
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Falha ao notificar decisao de checklist: %', SQLERRM;
  END;

  RETURN NEW;
END;
$$;

ALTER FUNCTION public.on_checklist_decision_notify()
  SET search_path = public, auth;

DROP TRIGGER IF EXISTS trg_checklist_decision_notify ON public.work_checklists;
CREATE TRIGGER trg_checklist_decision_notify
  AFTER UPDATE ON public.work_checklists
  FOR EACH ROW EXECUTE FUNCTION public.on_checklist_decision_notify();

-- -----------------------------------------------------------------------------
-- 7.2 on_alert_opened_notify - AFTER INSERT em work_alerts
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.on_alert_opened_notify()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_work RECORD;
  v_body TEXT;
BEGIN
  BEGIN
    SELECT id, name, engineer_id INTO v_work
      FROM public.works
     WHERE id = NEW.work_id;

    IF NOT FOUND THEN
      RAISE WARNING 'Obra % nao encontrada (alerta)', NEW.work_id;
      RETURN NEW;
    END IF;

    v_body := left(NEW.description, 120);
    IF length(NEW.description) > 120 THEN
      v_body := v_body || '...';
    END IF;

    INSERT INTO public.notifications (user_id, work_id, kind, title, body, link_path)
    VALUES (
      v_work.engineer_id,
      v_work.id,
      'alert_opened',
      'Alerta ' || NEW.severity || ' em ' || v_work.name,
      v_body,
      '/tools/andamento-obra/obras/' || v_work.id::text || '/alertas'
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Falha ao notificar abertura de alerta: %', SQLERRM;
  END;

  RETURN NEW;
END;
$$;

ALTER FUNCTION public.on_alert_opened_notify()
  SET search_path = public, auth;

DROP TRIGGER IF EXISTS trg_alert_opened_notify ON public.work_alerts;
CREATE TRIGGER trg_alert_opened_notify
  AFTER INSERT ON public.work_alerts
  FOR EACH ROW EXECUTE FUNCTION public.on_alert_opened_notify();

-- -----------------------------------------------------------------------------
-- 7.3 on_alert_status_change_notify - AFTER UPDATE com mudanca de status
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.on_alert_status_change_notify()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_work      RECORD;
  v_recipient UUID;
  v_kind      TEXT;
  v_title     TEXT;
  v_body      TEXT;
BEGIN
  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;

  BEGIN
    SELECT id, name, engineer_id, manager_id INTO v_work
      FROM public.works
     WHERE id = NEW.work_id;

    IF NOT FOUND THEN
      RETURN NEW;
    END IF;

    IF OLD.status = 'open' AND NEW.status = 'in_progress' THEN
      v_recipient := v_work.manager_id;
      v_kind := 'alert_acknowledged';
      v_title := 'Alerta reconhecido em ' || v_work.name;
      v_body := NEW.title || ' - engenheiro reconheceu.';
    ELSIF OLD.status = 'in_progress' AND NEW.status = 'resolved_in_field' THEN
      v_recipient := v_work.engineer_id;
      v_kind := 'alert_resolved_in_field';
      v_title := 'Alerta resolvido em campo - ' || v_work.name;
      v_body := coalesce(left(NEW.field_resolution_notes, 120), NEW.title);
    ELSIF (OLD.status = 'resolved_in_field' AND NEW.status = 'closed') THEN
      v_recipient := v_work.manager_id;
      v_kind := 'alert_closed';
      v_title := 'Alerta encerrado em ' || v_work.name;
      v_body := coalesce(left(NEW.closure_notes, 120), NEW.title);
    ELSIF OLD.status = 'closed' AND NEW.status = 'in_progress' THEN
      v_recipient := v_work.manager_id;
      v_kind := 'alert_reopened';
      v_title := 'Alerta reaberto em ' || v_work.name;
      v_body := NEW.title || ' - engenheiro reabriu.';
    ELSE
      RETURN NEW;
    END IF;

    IF v_recipient IS NULL THEN
      RETURN NEW;
    END IF;

    INSERT INTO public.notifications (user_id, work_id, kind, title, body, link_path)
    VALUES (
      v_recipient,
      v_work.id,
      v_kind,
      v_title,
      v_body,
      '/tools/andamento-obra/obras/' || v_work.id::text || '/alertas'
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Falha ao notificar mudanca de status de alerta: %', SQLERRM;
  END;

  RETURN NEW;
END;
$$;

ALTER FUNCTION public.on_alert_status_change_notify()
  SET search_path = public, auth;

DROP TRIGGER IF EXISTS trg_alert_status_change_notify ON public.work_alerts;
CREATE TRIGGER trg_alert_status_change_notify
  AFTER UPDATE ON public.work_alerts
  FOR EACH ROW EXECUTE FUNCTION public.on_alert_status_change_notify();

-- =============================================================================
-- 8. TRIGGERS - presenca (AFTER UPDATE, tolerante)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 8.1 on_daily_log_approved_attendance - popula work_team_attendance
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.on_daily_log_approved_attendance()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_revision RECORD;
  v_crew_id  TEXT;
BEGIN
  IF NOT (OLD.status = 'pending_approval' AND NEW.status = 'approved') THEN
    RETURN NEW;
  END IF;

  BEGIN
    SELECT crew_present INTO v_revision
      FROM public.work_daily_log_revisions
     WHERE id = NEW.current_revision_id;

    IF NOT FOUND OR v_revision.crew_present IS NULL THEN
      RETURN NEW;
    END IF;

    FOR v_crew_id IN SELECT jsonb_array_elements_text(v_revision.crew_present)
    LOOP
      BEGIN
        INSERT INTO public.work_team_attendance (work_id, crew_member_id, attendance_date, daily_log_id)
        VALUES (NEW.work_id, v_crew_id::uuid, NEW.log_date, NEW.id)
        ON CONFLICT (work_id, crew_member_id, attendance_date) DO NOTHING;
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'Falha ao registrar presenca para crew %: %', v_crew_id, SQLERRM;
      END;
    END LOOP;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Falha em on_daily_log_approved_attendance: %', SQLERRM;
  END;

  RETURN NEW;
END;
$$;

ALTER FUNCTION public.on_daily_log_approved_attendance()
  SET search_path = public, auth;

DROP TRIGGER IF EXISTS trg_daily_log_approved_attendance ON public.work_daily_logs;
CREATE TRIGGER trg_daily_log_approved_attendance
  AFTER UPDATE ON public.work_daily_logs
  FOR EACH ROW EXECUTE FUNCTION public.on_daily_log_approved_attendance();

-- =============================================================================
-- 9. TRIGGERS - last_activity_at (AFTER, tolerantes)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 9.1 update_work_last_activity_on_checklist
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_work_last_activity_on_checklist()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;

  BEGIN
    UPDATE public.works
       SET last_activity_at = now()
     WHERE id = NEW.work_id;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Falha em update_work_last_activity_on_checklist: %', SQLERRM;
  END;

  RETURN NEW;
END;
$$;

ALTER FUNCTION public.update_work_last_activity_on_checklist()
  SET search_path = public, auth;

DROP TRIGGER IF EXISTS trg_checklist_last_activity ON public.work_checklists;
CREATE TRIGGER trg_checklist_last_activity
  AFTER UPDATE ON public.work_checklists
  FOR EACH ROW EXECUTE FUNCTION public.update_work_last_activity_on_checklist();

-- -----------------------------------------------------------------------------
-- 9.2 update_work_last_activity_on_alert
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_work_last_activity_on_alert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;

  BEGIN
    UPDATE public.works
       SET last_activity_at = now()
     WHERE id = NEW.work_id;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Falha em update_work_last_activity_on_alert: %', SQLERRM;
  END;

  RETURN NEW;
END;
$$;

ALTER FUNCTION public.update_work_last_activity_on_alert()
  SET search_path = public, auth;

DROP TRIGGER IF EXISTS trg_alert_last_activity ON public.work_alerts;
CREATE TRIGGER trg_alert_last_activity
  AFTER INSERT OR UPDATE ON public.work_alerts
  FOR EACH ROW EXECUTE FUNCTION public.update_work_last_activity_on_alert();

-- =============================================================================
-- 10. HARDENING: revogar EXECUTE de funcoes SECURITY DEFINER
-- =============================================================================
REVOKE EXECUTE ON FUNCTION public.on_work_checklist_assigned()
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.on_checklist_item_marked()
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.on_checklist_decision_notify()
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.on_alert_opened_notify()
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.on_alert_status_change_notify()
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.on_daily_log_approved_attendance()
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_work_last_activity_on_checklist()
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_work_last_activity_on_alert()
  FROM PUBLIC, anon, authenticated;

-- =============================================================================
-- 11. RLS - checklist_templates
-- =============================================================================
ALTER TABLE public.checklist_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "checklist_templates_select" ON public.checklist_templates;
CREATE POLICY "checklist_templates_select" ON public.checklist_templates
  FOR SELECT USING (auth.uid() = engineer_id);

DROP POLICY IF EXISTS "checklist_templates_insert" ON public.checklist_templates;
CREATE POLICY "checklist_templates_insert" ON public.checklist_templates
  FOR INSERT WITH CHECK (auth.uid() = engineer_id);

DROP POLICY IF EXISTS "checklist_templates_update" ON public.checklist_templates;
CREATE POLICY "checklist_templates_update" ON public.checklist_templates
  FOR UPDATE USING (auth.uid() = engineer_id) WITH CHECK (auth.uid() = engineer_id);

DROP POLICY IF EXISTS "checklist_templates_delete" ON public.checklist_templates;
CREATE POLICY "checklist_templates_delete" ON public.checklist_templates
  FOR DELETE USING (auth.uid() = engineer_id);

-- =============================================================================
-- 12. RLS - checklist_template_items
-- =============================================================================
ALTER TABLE public.checklist_template_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "checklist_template_items_select" ON public.checklist_template_items;
CREATE POLICY "checklist_template_items_select" ON public.checklist_template_items
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.checklist_templates ct
      WHERE ct.id = checklist_template_items.template_id
        AND ct.engineer_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "checklist_template_items_insert" ON public.checklist_template_items;
CREATE POLICY "checklist_template_items_insert" ON public.checklist_template_items
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.checklist_templates ct
      WHERE ct.id = checklist_template_items.template_id
        AND ct.engineer_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "checklist_template_items_update" ON public.checklist_template_items;
CREATE POLICY "checklist_template_items_update" ON public.checklist_template_items
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.checklist_templates ct
      WHERE ct.id = checklist_template_items.template_id
        AND ct.engineer_id = auth.uid()
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.checklist_templates ct
      WHERE ct.id = checklist_template_items.template_id
        AND ct.engineer_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "checklist_template_items_delete" ON public.checklist_template_items;
CREATE POLICY "checklist_template_items_delete" ON public.checklist_template_items
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.checklist_templates ct
      WHERE ct.id = checklist_template_items.template_id
        AND ct.engineer_id = auth.uid()
    )
  );

-- =============================================================================
-- 13. RLS - work_checklists
-- =============================================================================
ALTER TABLE public.work_checklists ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "work_checklists_select" ON public.work_checklists;
CREATE POLICY "work_checklists_select" ON public.work_checklists
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.work_members wm
      WHERE wm.work_id = work_checklists.work_id
        AND wm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "work_checklists_insert" ON public.work_checklists;
CREATE POLICY "work_checklists_insert" ON public.work_checklists
  FOR INSERT WITH CHECK (
    auth.uid() = assigned_by
    AND EXISTS (
      SELECT 1 FROM public.work_members wm
      WHERE wm.work_id = work_checklists.work_id
        AND wm.user_id = auth.uid()
        AND wm.role = 'engineer'
    )
  );

DROP POLICY IF EXISTS "work_checklists_update" ON public.work_checklists;
CREATE POLICY "work_checklists_update" ON public.work_checklists
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.work_members wm
      WHERE wm.work_id = work_checklists.work_id
        AND wm.user_id = auth.uid()
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.work_members wm
      WHERE wm.work_id = work_checklists.work_id
        AND wm.user_id = auth.uid()
    )
  );

-- =============================================================================
-- 14. RLS - work_checklist_items
-- =============================================================================
ALTER TABLE public.work_checklist_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "work_checklist_items_select" ON public.work_checklist_items;
CREATE POLICY "work_checklist_items_select" ON public.work_checklist_items
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM public.work_checklists wc
      JOIN public.work_members wm ON wm.work_id = wc.work_id
      WHERE wc.id = work_checklist_items.work_checklist_id
        AND wm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "work_checklist_items_update" ON public.work_checklist_items;
CREATE POLICY "work_checklist_items_update" ON public.work_checklist_items
  FOR UPDATE USING (
    EXISTS (
      SELECT 1
      FROM public.work_checklists wc
      JOIN public.work_members wm ON wm.work_id = wc.work_id
      WHERE wc.id = work_checklist_items.work_checklist_id
        AND wm.user_id = auth.uid()
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.work_checklists wc
      JOIN public.work_members wm ON wm.work_id = wc.work_id
      WHERE wc.id = work_checklist_items.work_checklist_id
        AND wm.user_id = auth.uid()
    )
  );

-- =============================================================================
-- 15. RLS - work_checklist_item_media
-- =============================================================================
ALTER TABLE public.work_checklist_item_media ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "work_checklist_item_media_select" ON public.work_checklist_item_media;
CREATE POLICY "work_checklist_item_media_select" ON public.work_checklist_item_media
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.work_members wm
      WHERE wm.work_id = work_checklist_item_media.work_id
        AND wm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "work_checklist_item_media_insert" ON public.work_checklist_item_media;
CREATE POLICY "work_checklist_item_media_insert" ON public.work_checklist_item_media
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.work_members wm
      WHERE wm.work_id = work_checklist_item_media.work_id
        AND wm.user_id = auth.uid()
        AND wm.role = 'manager'
    )
  );

-- =============================================================================
-- 16. RLS - work_alerts
-- =============================================================================
ALTER TABLE public.work_alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "work_alerts_select" ON public.work_alerts;
CREATE POLICY "work_alerts_select" ON public.work_alerts
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.work_members wm
      WHERE wm.work_id = work_alerts.work_id
        AND wm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "work_alerts_insert" ON public.work_alerts;
CREATE POLICY "work_alerts_insert" ON public.work_alerts
  FOR INSERT WITH CHECK (
    auth.uid() = created_by
    AND EXISTS (
      SELECT 1 FROM public.work_members wm
      WHERE wm.work_id = work_alerts.work_id
        AND wm.user_id = auth.uid()
        AND wm.role = 'manager'
    )
  );

DROP POLICY IF EXISTS "work_alerts_update" ON public.work_alerts;
CREATE POLICY "work_alerts_update" ON public.work_alerts
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.work_members wm
      WHERE wm.work_id = work_alerts.work_id
        AND wm.user_id = auth.uid()
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.work_members wm
      WHERE wm.work_id = work_alerts.work_id
        AND wm.user_id = auth.uid()
    )
  );

-- =============================================================================
-- 17. RLS - work_alert_updates
-- =============================================================================
ALTER TABLE public.work_alert_updates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "work_alert_updates_select" ON public.work_alert_updates;
CREATE POLICY "work_alert_updates_select" ON public.work_alert_updates
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.work_members wm
      WHERE wm.work_id = work_alert_updates.work_id
        AND wm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "work_alert_updates_insert" ON public.work_alert_updates;
CREATE POLICY "work_alert_updates_insert" ON public.work_alert_updates
  FOR INSERT WITH CHECK (
    auth.uid() = actor_id
    AND EXISTS (
      SELECT 1 FROM public.work_members wm
      WHERE wm.work_id = work_alert_updates.work_id
        AND wm.user_id = auth.uid()
        AND wm.role = work_alert_updates.actor_role
    )
  );

-- =============================================================================
-- 18. RLS - work_alert_media
-- =============================================================================
ALTER TABLE public.work_alert_media ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "work_alert_media_select" ON public.work_alert_media;
CREATE POLICY "work_alert_media_select" ON public.work_alert_media
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.work_members wm
      WHERE wm.work_id = work_alert_media.work_id
        AND wm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "work_alert_media_insert" ON public.work_alert_media;
CREATE POLICY "work_alert_media_insert" ON public.work_alert_media
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.work_members wm
      WHERE wm.work_id = work_alert_media.work_id
        AND wm.user_id = auth.uid()
    )
  );

-- =============================================================================
-- 19. RLS - work_team
-- =============================================================================
ALTER TABLE public.work_team ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "work_team_select" ON public.work_team;
CREATE POLICY "work_team_select" ON public.work_team
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.work_members wm
      WHERE wm.work_id = work_team.work_id
        AND wm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "work_team_insert" ON public.work_team;
CREATE POLICY "work_team_insert" ON public.work_team
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.work_members wm
      WHERE wm.work_id = work_team.work_id
        AND wm.user_id = auth.uid()
        AND wm.role = 'engineer'
    )
  );

DROP POLICY IF EXISTS "work_team_update" ON public.work_team;
CREATE POLICY "work_team_update" ON public.work_team
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.work_members wm
      WHERE wm.work_id = work_team.work_id
        AND wm.user_id = auth.uid()
        AND wm.role = 'engineer'
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.work_members wm
      WHERE wm.work_id = work_team.work_id
        AND wm.user_id = auth.uid()
        AND wm.role = 'engineer'
    )
  );

DROP POLICY IF EXISTS "work_team_delete" ON public.work_team;
CREATE POLICY "work_team_delete" ON public.work_team
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.work_members wm
      WHERE wm.work_id = work_team.work_id
        AND wm.user_id = auth.uid()
        AND wm.role = 'engineer'
    )
  );

-- =============================================================================
-- 20. RLS - work_team_attendance
-- =============================================================================
ALTER TABLE public.work_team_attendance ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "work_team_attendance_select" ON public.work_team_attendance;
CREATE POLICY "work_team_attendance_select" ON public.work_team_attendance
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.work_members wm
      WHERE wm.work_id = work_team_attendance.work_id
        AND wm.user_id = auth.uid()
    )
  );

-- INSERT/UPDATE/DELETE bloqueados para authenticated (apenas via trigger SECURITY DEFINER).

-- =============================================================================
-- 21. STORAGE POLICIES
-- =============================================================================

DROP POLICY IF EXISTS "andamento_obra_storage_insert_checklist" ON storage.objects;
CREATE POLICY "andamento_obra_storage_insert_checklist" ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'andamento-obra'
    AND (storage.foldername(name))[2] = 'checklists'
    AND EXISTS (
      SELECT 1 FROM public.work_members wm
      WHERE wm.user_id = auth.uid()
        AND wm.role = 'manager'
        AND wm.work_id::text = (storage.foldername(name))[1]
    )
  );

DROP POLICY IF EXISTS "andamento_obra_storage_insert_alert" ON storage.objects;
CREATE POLICY "andamento_obra_storage_insert_alert" ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'andamento-obra'
    AND (storage.foldername(name))[2] = 'alerts'
    AND EXISTS (
      SELECT 1 FROM public.work_members wm
      WHERE wm.user_id = auth.uid()
        AND wm.work_id::text = (storage.foldername(name))[1]
    )
  );

-- =============================================================================
-- 22. REALTIME
-- =============================================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime'
  ) THEN
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.work_checklists;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;

    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.work_checklist_items;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;

    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.work_alerts;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;

    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.work_alert_updates;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;

    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.work_team;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;

    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.work_team_attendance;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END IF;
END $$;
