-- =============================================================================
-- Andamento de Obra — Esqueleto de Obras (Bloco 2)
-- works + work_members + work_milestones + notifications
-- Triggers: seed_work_defaults, sync_work_manager, updated_at, RLS completo
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. works — Obra de Andamento (entidade central)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.works (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  engineer_id      UUID        NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  manager_id       UUID        NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  budget_id        UUID        NULL,
  name             TEXT        NOT NULL,
  client_name      TEXT        NULL,
  utility_company  TEXT        NULL,
  address          TEXT        NULL,
  status           TEXT        NOT NULL DEFAULT 'planned'
                               CHECK (status IN ('planned','in_progress','paused','completed','cancelled')),
  started_at       DATE        NULL,
  expected_end_at  DATE        NULL,
  completed_at     TIMESTAMPTZ NULL,
  last_activity_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes            TEXT        NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_works_engineer ON public.works(engineer_id);
CREATE INDEX IF NOT EXISTS idx_works_manager ON public.works(manager_id);
CREATE INDEX IF NOT EXISTS idx_works_status ON public.works(status);
CREATE INDEX IF NOT EXISTS idx_works_last_activity ON public.works(last_activity_at DESC);

CREATE OR REPLACE FUNCTION public.update_works_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_works_updated_at ON public.works;
CREATE TRIGGER trg_works_updated_at
  BEFORE UPDATE ON public.works
  FOR EACH ROW EXECUTE FUNCTION public.update_works_updated_at();

-- -----------------------------------------------------------------------------
-- 2. work_members — Associacao de quem participa da obra (engenheiro + gerente)
--    PK composta (work_id, user_id) — combinacao unica semanticamente.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.work_members (
  work_id    UUID        NOT NULL REFERENCES public.works(id) ON DELETE CASCADE,
  user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role       TEXT        NOT NULL CHECK (role IN ('engineer','manager')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (work_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_work_members_user ON public.work_members(user_id);

-- -----------------------------------------------------------------------------
-- 3. work_milestones — Marcos da obra (6 padrao por obra, criados via trigger)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.work_milestones (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  work_id     UUID        NOT NULL REFERENCES public.works(id) ON DELETE CASCADE,
  code        TEXT        NOT NULL,
  name        TEXT        NOT NULL,
  order_index INT         NOT NULL,
  status      TEXT        NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending','in_progress','awaiting_approval','approved','rejected')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (work_id, code)
);

CREATE INDEX IF NOT EXISTS idx_work_milestones_work_order
  ON public.work_milestones(work_id, order_index);

CREATE OR REPLACE FUNCTION public.update_work_milestones_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_work_milestones_updated_at ON public.work_milestones;
CREATE TRIGGER trg_work_milestones_updated_at
  BEFORE UPDATE ON public.work_milestones
  FOR EACH ROW EXECUTE FUNCTION public.update_work_milestones_updated_at();

-- -----------------------------------------------------------------------------
-- 4. notifications — Feed de notificacoes do usuario
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.notifications (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  work_id    UUID        NULL REFERENCES public.works(id) ON DELETE CASCADE,
  kind       TEXT        NOT NULL,
  title      TEXT        NOT NULL,
  body       TEXT        NULL,
  link_path  TEXT        NULL,
  is_read    BOOLEAN     NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_created
  ON public.notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
  ON public.notifications(user_id, is_read);

-- -----------------------------------------------------------------------------
-- 5. Trigger seed_work_defaults — AFTER INSERT em works (ESTRITO)
--    Insere 6 marcos padrao + members + notificacao work_created.
--    Sem EXCEPTION HANDLER: qualquer falha derruba a transacao.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.seed_work_defaults()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  INSERT INTO public.work_milestones (work_id, code, name, order_index) VALUES
    (NEW.id, 'survey',        'Locação',           1),
    (NEW.id, 'poles',         'Postes instalados', 2),
    (NEW.id, 'cabling_lv',    'Cabeamento BT',     3),
    (NEW.id, 'cabling_mv',    'Cabeamento MT',     4),
    (NEW.id, 'energization',  'Energização',       5),
    (NEW.id, 'commissioning', 'Comissionamento',   6);

  INSERT INTO public.work_members (work_id, user_id, role)
  VALUES (NEW.id, NEW.engineer_id, 'engineer')
  ON CONFLICT (work_id, user_id) DO NOTHING;

  IF NEW.manager_id IS NOT NULL THEN
    INSERT INTO public.work_members (work_id, user_id, role)
    VALUES (NEW.id, NEW.manager_id, 'manager')
    ON CONFLICT (work_id, user_id) DO UPDATE SET role = EXCLUDED.role;
  END IF;

  INSERT INTO public.notifications (user_id, work_id, kind, title, body, link_path)
  VALUES (
    NEW.engineer_id,
    NEW.id,
    'work_created',
    'Obra criada: ' || NEW.name,
    'Você criou a obra "' || NEW.name || '".',
    '/tools/andamento-obra/obras/' || NEW.id::text
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_seed_work_defaults ON public.works;
CREATE TRIGGER trg_seed_work_defaults
  AFTER INSERT ON public.works
  FOR EACH ROW EXECUTE FUNCTION public.seed_work_defaults();

-- -----------------------------------------------------------------------------
-- 6. Trigger sync_work_manager — AFTER UPDATE em works quando manager_id mudou
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sync_work_manager()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF OLD.manager_id IS DISTINCT FROM NEW.manager_id THEN
    IF OLD.manager_id IS NOT NULL THEN
      DELETE FROM public.work_members
       WHERE work_id = NEW.id
         AND user_id = OLD.manager_id
         AND role = 'manager';
    END IF;

    IF NEW.manager_id IS NOT NULL THEN
      INSERT INTO public.work_members (work_id, user_id, role)
      VALUES (NEW.id, NEW.manager_id, 'manager')
      ON CONFLICT (work_id, user_id) DO UPDATE SET role = EXCLUDED.role;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_work_manager ON public.works;
CREATE TRIGGER trg_sync_work_manager
  AFTER UPDATE OF manager_id ON public.works
  FOR EACH ROW EXECUTE FUNCTION public.sync_work_manager();

-- -----------------------------------------------------------------------------
-- 7. RLS — works
-- -----------------------------------------------------------------------------
ALTER TABLE public.works ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "works_select" ON public.works;
CREATE POLICY "works_select" ON public.works
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.work_members wm
      WHERE wm.work_id = works.id
        AND wm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "works_insert" ON public.works;
CREATE POLICY "works_insert" ON public.works
  FOR INSERT
  WITH CHECK (auth.uid() = engineer_id);

DROP POLICY IF EXISTS "works_update" ON public.works;
CREATE POLICY "works_update" ON public.works
  FOR UPDATE
  USING (auth.uid() = engineer_id)
  WITH CHECK (auth.uid() = engineer_id);

-- DELETE: sem policy = bloqueado para authenticated (soft delete via status='cancelled').

-- -----------------------------------------------------------------------------
-- 8. RLS — work_members (mutacoes via trigger; SELECT para membros)
-- -----------------------------------------------------------------------------
ALTER TABLE public.work_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "work_members_select" ON public.work_members;
CREATE POLICY "work_members_select" ON public.work_members
  FOR SELECT
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM public.work_members wm2
      WHERE wm2.work_id = work_members.work_id
        AND wm2.user_id = auth.uid()
    )
  );

-- INSERT/UPDATE/DELETE: sem policy = bloqueado (gerenciado por trigger).

-- -----------------------------------------------------------------------------
-- 9. RLS — work_milestones (somente leitura para membros)
-- -----------------------------------------------------------------------------
ALTER TABLE public.work_milestones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "work_milestones_select" ON public.work_milestones;
CREATE POLICY "work_milestones_select" ON public.work_milestones
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.work_members wm
      WHERE wm.work_id = work_milestones.work_id
        AND wm.user_id = auth.uid()
    )
  );

-- INSERT/UPDATE/DELETE: bloqueado neste bloco (criacao via trigger; updates entram no Bloco 9).

-- -----------------------------------------------------------------------------
-- 10. RLS — notifications (dono le; dono atualiza is_read; criacao via trigger/service role)
-- -----------------------------------------------------------------------------
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notifications_select" ON public.notifications;
CREATE POLICY "notifications_select" ON public.notifications
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "notifications_update" ON public.notifications;
CREATE POLICY "notifications_update" ON public.notifications
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- INSERT/DELETE: bloqueado para authenticated.
