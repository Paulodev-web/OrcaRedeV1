-- =============================================================================
-- Andamento de Obra - Instalacao de postes em campo (Bloco 7)
--
-- Tabelas novas:
--   - work_pole_installations       (pino criado pelo gerente em campo)
--   - work_pole_installation_media  (fotos/videos vinculados a uma instalacao)
--
-- Idempotencia FORTE: client_event_id e UNIQUE NOT NULL na tabela principal.
-- Primeiro uso real do roadmap; APK gera UUID v4 client-side antes de qualquer
-- side effect (foto + insert) para garantir que reenvios offline-first NUNCA
-- duplicam uma instalacao.
--
-- Triggers:
--   - protect_fields (BEFORE UPDATE, estrito):
--       work_pole_installations_protect_fields
--   - notificacao (AFTER INSERT, tolerante):
--       on_pole_installation_notify
--   - last_activity_at (AFTER, tolerante):
--       update_work_last_activity_on_pole_installation
--         INSERT: sempre dispara
--         UPDATE: somente quando OLD.status IS DISTINCT FROM NEW.status
--           (correcoes de notes/numbering/pole_type NAO sobem a obra na
--            ordenacao da Central)
--
-- RLS:
--   - work_pole_installations: SELECT membro; INSERT manager+self; UPDATE via
--     trigger (apenas criador, apenas subset de campos); DELETE bloqueado.
--   - work_pole_installation_media: SELECT membro; INSERT manager dono da
--     instalacao; UPDATE/DELETE bloqueados.
--
-- Storage policy: bucket andamento-obra, path pole-installations/, INSERT
-- exclusivo de manager membro da obra.
--
-- Path canonico:
--   {work_id}/pole-installations/{installation_id}/{uuid}.{ext}
--
-- Realtime: publicacao supabase_realtime adiciona work_pole_installations.
-- Canal compartilhado work:{work_id}:events (mesmo de diario/marcos do
-- Bloco 6); cada subscriber filtra por payload.table.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. work_pole_installations - cada linha e um pino marcado pelo gerente
--
--    Coordenadas no quadro logico 6000x6000 (alinhado ao snapshot do canvas).
--    GPS opcional (manager pode estar em area sem cobertura).
--    status = 'removed' e soft-delete (correcao de marcacao errada). A linha
--    persiste para auditoria; nunca DELETE fisico.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.work_pole_installations (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  work_id               UUID        NOT NULL REFERENCES public.works(id) ON DELETE CASCADE,
  created_by            UUID        NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  x_coord               NUMERIC     NOT NULL,
  y_coord               NUMERIC     NOT NULL,
  gps_lat               NUMERIC     NULL,
  gps_lng               NUMERIC     NULL,
  gps_accuracy_meters   NUMERIC     NULL,
  numbering             TEXT        NULL,
  pole_type             TEXT        NULL,
  notes                 TEXT        NULL,
  installed_at          TIMESTAMPTZ NOT NULL,
  status                TEXT        NOT NULL DEFAULT 'installed'
                                    CHECK (status IN ('installed','removed')),
  removed_at            TIMESTAMPTZ NULL,
  removed_by            UUID        NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  client_event_id       UUID        NOT NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT work_pole_installations_x_coord_check
    CHECK (x_coord >= 0 AND x_coord <= 6000),
  CONSTRAINT work_pole_installations_y_coord_check
    CHECK (y_coord >= 0 AND y_coord <= 6000),
  CONSTRAINT work_pole_installations_gps_lat_check
    CHECK (gps_lat IS NULL OR (gps_lat >= -90 AND gps_lat <= 90)),
  CONSTRAINT work_pole_installations_gps_lng_check
    CHECK (gps_lng IS NULL OR (gps_lng >= -180 AND gps_lng <= 180)),
  CONSTRAINT work_pole_installations_client_event_unique
    UNIQUE (client_event_id)
);

CREATE INDEX IF NOT EXISTS idx_pole_installations_work_status_installed_at
  ON public.work_pole_installations(work_id, status, installed_at DESC);
CREATE INDEX IF NOT EXISTS idx_pole_installations_work_creator
  ON public.work_pole_installations(work_id, created_by);

CREATE OR REPLACE FUNCTION public.update_work_pole_installations_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

ALTER FUNCTION public.update_work_pole_installations_updated_at()
  SET search_path = public, auth;

DROP TRIGGER IF EXISTS trg_work_pole_installations_updated_at
  ON public.work_pole_installations;
CREATE TRIGGER trg_work_pole_installations_updated_at
  BEFORE UPDATE ON public.work_pole_installations
  FOR EACH ROW EXECUTE FUNCTION public.update_work_pole_installations_updated_at();

-- -----------------------------------------------------------------------------
-- 2. work_pole_installation_media - fotos vinculadas a uma instalacao
--    work_id denormalizado para Storage policies e queries diretas.
--    is_primary marca a foto destacada (a primeira) - exibida no PostDetails
--    e thumbnail da galeria.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.work_pole_installation_media (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  installation_id  UUID        NOT NULL REFERENCES public.work_pole_installations(id) ON DELETE CASCADE,
  work_id          UUID        NOT NULL REFERENCES public.works(id) ON DELETE CASCADE,
  kind             TEXT        NOT NULL CHECK (kind IN ('image','video')),
  storage_path     TEXT        NOT NULL,
  mime_type        TEXT        NULL,
  size_bytes       BIGINT      NULL,
  width            INT         NULL,
  height           INT         NULL,
  duration_seconds NUMERIC     NULL,
  is_primary       BOOLEAN     NOT NULL DEFAULT false,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pole_installation_media_installation
  ON public.work_pole_installation_media(installation_id);
CREATE INDEX IF NOT EXISTS idx_pole_installation_media_work
  ON public.work_pole_installation_media(work_id);
CREATE INDEX IF NOT EXISTS idx_pole_installation_media_primary
  ON public.work_pole_installation_media(installation_id)
  WHERE is_primary = true;

-- =============================================================================
-- TRIGGERS - protect_fields (BEFORE UPDATE, estrito)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 3. work_pole_installations_protect_fields
--
--    Regras:
--      - Imutaveis em qualquer caso: id, work_id, created_by, x_coord, y_coord,
--        gps_lat, gps_lng, gps_accuracy_meters, installed_at, client_event_id,
--        created_at.
--      - Apenas o criador (created_by = auth.uid()) com role manager pode
--        atualizar status (installed -> removed) e os campos de correcao
--        (numbering, pole_type, notes, removed_at, removed_by, updated_at).
--      - Engineer e outros managers nao podem editar nada - apenas SELECT.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.work_pole_installations_protect_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_role TEXT;
BEGIN
  -- Campos absolutamente imutaveis.
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.work_id IS DISTINCT FROM OLD.work_id
     OR NEW.created_by IS DISTINCT FROM OLD.created_by
     OR NEW.x_coord IS DISTINCT FROM OLD.x_coord
     OR NEW.y_coord IS DISTINCT FROM OLD.y_coord
     OR NEW.gps_lat IS DISTINCT FROM OLD.gps_lat
     OR NEW.gps_lng IS DISTINCT FROM OLD.gps_lng
     OR NEW.gps_accuracy_meters IS DISTINCT FROM OLD.gps_accuracy_meters
     OR NEW.installed_at IS DISTINCT FROM OLD.installed_at
     OR NEW.client_event_id IS DISTINCT FROM OLD.client_event_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'Colunas imutaveis nao podem ser alteradas em work_pole_installations';
  END IF;

  -- Apenas o criador edita.
  IF auth.uid() IS NULL OR auth.uid() <> OLD.created_by THEN
    RAISE EXCEPTION 'Somente o gerente que criou a instalacao pode atualiza-la';
  END IF;

  SELECT role INTO v_role
    FROM public.work_members
   WHERE work_id = NEW.work_id
     AND user_id = auth.uid();

  IF v_role IS NULL THEN
    RAISE EXCEPTION 'Usuario nao e membro da obra';
  END IF;
  IF v_role <> 'manager' THEN
    RAISE EXCEPTION 'Apenas o gerente pode atualizar instalacoes';
  END IF;

  -- Transicoes de status permitidas: installed -> removed apenas.
  IF OLD.status = 'installed' AND NEW.status = 'removed' THEN
    IF NEW.removed_at IS NULL THEN
      RAISE EXCEPTION 'removed_at obrigatorio ao remover instalacao';
    END IF;
    IF NEW.removed_by IS DISTINCT FROM auth.uid() THEN
      RAISE EXCEPTION 'removed_by deve ser o gerente que removeu';
    END IF;
  ELSIF OLD.status = NEW.status THEN
    -- Sem mudanca de status: aceita atualizacoes em notes/numbering/pole_type.
    -- removed_at/removed_by nao podem mudar fora de transicao.
    IF NEW.removed_at IS DISTINCT FROM OLD.removed_at
       OR NEW.removed_by IS DISTINCT FROM OLD.removed_by
    THEN
      RAISE EXCEPTION 'removed_at/removed_by so podem ser atribuidos ao remover';
    END IF;
  ELSE
    RAISE EXCEPTION 'Transicao invalida: % -> %', OLD.status, NEW.status;
  END IF;

  RETURN NEW;
END;
$$;

ALTER FUNCTION public.work_pole_installations_protect_fields()
  SET search_path = public, auth;

DROP TRIGGER IF EXISTS trg_work_pole_installations_protect
  ON public.work_pole_installations;
CREATE TRIGGER trg_work_pole_installations_protect
  BEFORE UPDATE ON public.work_pole_installations
  FOR EACH ROW EXECUTE FUNCTION public.work_pole_installations_protect_fields();

-- =============================================================================
-- TRIGGERS - notificacao (AFTER INSERT, tolerante)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 4. on_pole_installation_notify - AFTER INSERT em work_pole_installations
--    quando status='installed'. Notifica o engenheiro com kind 'pole_installed'
--    (reservado desde o Bloco 2 e mapeado em NotificationItem.tsx).
--
--    Tolerante a falhas (RAISE WARNING) para nao impedir o INSERT principal.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.on_pole_installation_notify()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_work    RECORD;
  v_label   TEXT;
  v_body    TEXT;
BEGIN
  IF NEW.status <> 'installed' THEN
    RETURN NEW;
  END IF;

  BEGIN
    SELECT id, name, engineer_id INTO v_work
      FROM public.works
     WHERE id = NEW.work_id;

    IF NOT FOUND THEN
      RAISE WARNING 'Obra % nao encontrada (instalacao de poste)', NEW.work_id;
      RETURN NEW;
    END IF;

    IF NEW.numbering IS NOT NULL AND length(trim(NEW.numbering)) > 0 THEN
      v_label := trim(NEW.numbering);
      v_body  := 'Poste ' || v_label || ' marcado via APK.';
    ELSE
      v_body  := 'Poste sem numeracao marcado via APK.';
    END IF;

    INSERT INTO public.notifications (user_id, work_id, kind, title, body, link_path)
    VALUES (
      v_work.engineer_id,
      v_work.id,
      'pole_installed',
      'Poste instalado em ' || v_work.name,
      v_body,
      '/tools/andamento-obra/obras/' || v_work.id::text || '/visao-geral'
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Falha ao notificar instalacao de poste: %', SQLERRM;
  END;

  RETURN NEW;
END;
$$;

ALTER FUNCTION public.on_pole_installation_notify()
  SET search_path = public, auth;

DROP TRIGGER IF EXISTS trg_pole_installation_notify
  ON public.work_pole_installations;
CREATE TRIGGER trg_pole_installation_notify
  AFTER INSERT ON public.work_pole_installations
  FOR EACH ROW EXECUTE FUNCTION public.on_pole_installation_notify();

-- =============================================================================
-- TRIGGERS - last_activity_at (AFTER, tolerante)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 5. update_work_last_activity_on_pole_installation
--
--    INSERT: sempre dispara (instalacao nova e atividade relevante).
--    UPDATE: dispara somente quando OLD.status IS DISTINCT FROM NEW.status
--      (transicao installed -> removed e relevante; correcoes de
--      notes/numbering/pole_type NAO sobem a obra na ordenacao da Central).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_work_last_activity_on_pole_installation()
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
    RAISE WARNING 'Falha em update_work_last_activity_on_pole_installation: %', SQLERRM;
  END;

  RETURN NEW;
END;
$$;

ALTER FUNCTION public.update_work_last_activity_on_pole_installation()
  SET search_path = public, auth;

DROP TRIGGER IF EXISTS trg_pole_installation_last_activity
  ON public.work_pole_installations;
CREATE TRIGGER trg_pole_installation_last_activity
  AFTER INSERT OR UPDATE ON public.work_pole_installations
  FOR EACH ROW EXECUTE FUNCTION public.update_work_last_activity_on_pole_installation();

-- =============================================================================
-- HARDENING: revogar EXECUTE de funcoes SECURITY DEFINER
-- =============================================================================
REVOKE EXECUTE ON FUNCTION public.on_pole_installation_notify()
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_work_last_activity_on_pole_installation()
  FROM PUBLIC, anon, authenticated;

-- =============================================================================
-- RLS - work_pole_installations
-- =============================================================================
ALTER TABLE public.work_pole_installations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "work_pole_installations_select" ON public.work_pole_installations;
CREATE POLICY "work_pole_installations_select" ON public.work_pole_installations
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.work_members wm
      WHERE wm.work_id = work_pole_installations.work_id
        AND wm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "work_pole_installations_insert" ON public.work_pole_installations;
CREATE POLICY "work_pole_installations_insert" ON public.work_pole_installations
  FOR INSERT
  WITH CHECK (
    auth.uid() = created_by
    AND EXISTS (
      SELECT 1 FROM public.work_members wm
      WHERE wm.work_id = work_pole_installations.work_id
        AND wm.user_id = auth.uid()
        AND wm.role = 'manager'
    )
  );

DROP POLICY IF EXISTS "work_pole_installations_update" ON public.work_pole_installations;
CREATE POLICY "work_pole_installations_update" ON public.work_pole_installations
  FOR UPDATE
  USING (
    auth.uid() = created_by
    AND EXISTS (
      SELECT 1 FROM public.work_members wm
      WHERE wm.work_id = work_pole_installations.work_id
        AND wm.user_id = auth.uid()
        AND wm.role = 'manager'
    )
  )
  WITH CHECK (
    auth.uid() = created_by
    AND EXISTS (
      SELECT 1 FROM public.work_members wm
      WHERE wm.work_id = work_pole_installations.work_id
        AND wm.user_id = auth.uid()
        AND wm.role = 'manager'
    )
  );

-- DELETE: sem policy = bloqueado. Soft delete via status='removed'.

-- =============================================================================
-- RLS - work_pole_installation_media
-- =============================================================================
ALTER TABLE public.work_pole_installation_media ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "work_pole_installation_media_select"
  ON public.work_pole_installation_media;
CREATE POLICY "work_pole_installation_media_select"
  ON public.work_pole_installation_media
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.work_members wm
      WHERE wm.work_id = work_pole_installation_media.work_id
        AND wm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "work_pole_installation_media_insert"
  ON public.work_pole_installation_media;
CREATE POLICY "work_pole_installation_media_insert"
  ON public.work_pole_installation_media
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.work_pole_installations i
      JOIN public.work_members wm
        ON wm.work_id = i.work_id
       AND wm.user_id = auth.uid()
       AND wm.role = 'manager'
      WHERE i.id = work_pole_installation_media.installation_id
        AND i.work_id = work_pole_installation_media.work_id
        AND i.created_by = auth.uid()
    )
  );

-- UPDATE/DELETE: bloqueados (midia e imutavel; cleanup futuro via job batch).

-- =============================================================================
-- STORAGE POLICY - bucket andamento-obra, path pole-installations/
-- =============================================================================
-- Path layout:
--   {work_id}/pole-installations/{installation_id}/{file}.{ext}

DROP POLICY IF EXISTS "andamento_obra_storage_insert_pole_installations"
  ON storage.objects;
CREATE POLICY "andamento_obra_storage_insert_pole_installations"
  ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'andamento-obra'
    AND (storage.foldername(name))[2] = 'pole-installations'
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
      ALTER PUBLICATION supabase_realtime ADD TABLE public.work_pole_installations;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END IF;
END $$;
