-- =============================================================================
-- Andamento de Obra — Chat 1:1 (Bloco 5)
-- work_messages + work_message_attachments
-- Triggers: on_new_work_message_notify, update_work_last_activity_on_message,
--           work_messages_protect_fields (BEFORE UPDATE)
-- RLS completo + Storage policy INSERT para path {work_id}/chat/{message_id}/...
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. work_messages — mensagens do chat 1:1 entre engenheiro e gerente
--    sender_role e denormalizado para evitar join na renderizacao; validado
--    contra work_members.role no policy de INSERT.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.work_messages (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  work_id              UUID        NOT NULL REFERENCES public.works(id) ON DELETE CASCADE,
  sender_id            UUID        NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  sender_role          TEXT        NOT NULL CHECK (sender_role IN ('engineer','manager')),
  body                 TEXT        NULL,
  client_event_id      UUID        NULL,
  read_by_engineer_at  TIMESTAMPTZ NULL,
  read_by_manager_at   TIMESTAMPTZ NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_work_messages_work_created
  ON public.work_messages(work_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_work_messages_work_sender
  ON public.work_messages(work_id, sender_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_work_messages_client_event
  ON public.work_messages(client_event_id)
  WHERE client_event_id IS NOT NULL;

-- -----------------------------------------------------------------------------
-- 2. work_message_attachments — anexos (imagem/video/audio) das mensagens
--    work_id e denormalizado para Storage policies e queries diretas.
--    storage_path: {work_id}/chat/{message_id}/{filename}
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.work_message_attachments (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id        UUID        NOT NULL REFERENCES public.work_messages(id) ON DELETE CASCADE,
  work_id           UUID        NOT NULL REFERENCES public.works(id) ON DELETE CASCADE,
  kind              TEXT        NOT NULL CHECK (kind IN ('image','video','audio')),
  storage_path      TEXT        NOT NULL,
  mime_type         TEXT        NULL,
  size_bytes        BIGINT      NULL,
  duration_seconds  NUMERIC     NULL,
  width             INT         NULL,
  height            INT         NULL,
  thumbnail_path    TEXT        NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_work_message_attachments_message
  ON public.work_message_attachments(message_id);
CREATE INDEX IF NOT EXISTS idx_work_message_attachments_work_kind
  ON public.work_message_attachments(work_id, kind);

-- -----------------------------------------------------------------------------
-- 3. Trigger work_messages_protect_fields — BEFORE UPDATE
--    Permite UPDATE somente nos campos read_by_engineer_at / read_by_manager_at.
--    Justificativa: e mais legivel e da mensagem de erro explicita do que
--    expressar a restricao em policy WITH CHECK comparando todos os campos.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.work_messages_protect_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.work_id IS DISTINCT FROM OLD.work_id
     OR NEW.sender_id IS DISTINCT FROM OLD.sender_id
     OR NEW.sender_role IS DISTINCT FROM OLD.sender_role
     OR NEW.body IS DISTINCT FROM OLD.body
     OR NEW.client_event_id IS DISTINCT FROM OLD.client_event_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'Apenas read_by_engineer_at e read_by_manager_at podem ser alterados em work_messages';
  END IF;
  RETURN NEW;
END;
$$;

ALTER FUNCTION public.work_messages_protect_fields()
  SET search_path = public, auth;

DROP TRIGGER IF EXISTS trg_work_messages_protect ON public.work_messages;
CREATE TRIGGER trg_work_messages_protect
  BEFORE UPDATE ON public.work_messages
  FOR EACH ROW EXECUTE FUNCTION public.work_messages_protect_fields();

-- -----------------------------------------------------------------------------
-- 4. Trigger on_new_work_message_notify — AFTER INSERT em work_messages
--    Insere notificacao 'message_received' para o destinatario (lado oposto).
--    Se manager_id IS NULL e sender e engineer, sai silenciosamente.
--    SECURITY DEFINER para conseguir inserir em notifications mesmo sem
--    policy de INSERT para authenticated.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.on_new_work_message_notify()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_work             RECORD;
  v_target_user_id   UUID;
  v_preview          TEXT;
  v_attachment_count INT;
BEGIN
  SELECT w.id, w.name, w.engineer_id, w.manager_id
    INTO v_work
    FROM public.works w
   WHERE w.id = NEW.work_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Obra % nao encontrada para notificacao de mensagem', NEW.work_id;
  END IF;

  -- Determinar destinatario com base no sender_role.
  IF NEW.sender_role = 'manager' THEN
    v_target_user_id := v_work.engineer_id;
  ELSE
    v_target_user_id := v_work.manager_id;
  END IF;

  -- Sem destinatario (obra sem gerente): nao gera notificacao.
  IF v_target_user_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Gerar prévia: corpo da mensagem ou rotulo de midia.
  IF NEW.body IS NOT NULL AND length(NEW.body) > 0 THEN
    v_preview := left(NEW.body, 80);
    IF length(NEW.body) > 80 THEN
      v_preview := v_preview || '...';
    END IF;
  ELSE
    SELECT count(*) INTO v_attachment_count
      FROM public.work_message_attachments
     WHERE message_id = NEW.id;

    IF v_attachment_count > 0 THEN
      v_preview := '[Mídia]';
    ELSE
      v_preview := 'Nova mensagem';
    END IF;
  END IF;

  INSERT INTO public.notifications (user_id, work_id, kind, title, body, link_path)
  VALUES (
    v_target_user_id,
    NEW.work_id,
    'message_received',
    'Nova mensagem em ' || v_work.name,
    v_preview,
    '/tools/andamento-obra/obras/' || NEW.work_id::text || '/chat'
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_work_message_notify ON public.work_messages;
CREATE TRIGGER trg_work_message_notify
  AFTER INSERT ON public.work_messages
  FOR EACH ROW EXECUTE FUNCTION public.on_new_work_message_notify();

-- -----------------------------------------------------------------------------
-- 5. Trigger update_work_last_activity_on_message — AFTER INSERT
--    Atualiza works.last_activity_at para refletir na ordenacao da Central
--    de Acompanhamento.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_work_last_activity_on_message()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  UPDATE public.works
     SET last_activity_at = now()
   WHERE id = NEW.work_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_work_message_activity ON public.work_messages;
CREATE TRIGGER trg_work_message_activity
  AFTER INSERT ON public.work_messages
  FOR EACH ROW EXECUTE FUNCTION public.update_work_last_activity_on_message();

-- -----------------------------------------------------------------------------
-- 6. Hardening: revogar EXECUTE de SECURITY DEFINER trigger handlers
--    para nao serem chamaveis via PostgREST RPC (lints 0028/0029).
-- -----------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.on_new_work_message_notify()
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_work_last_activity_on_message()
  FROM PUBLIC, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 7. RLS — work_messages
-- SELECT: membro da obra
-- INSERT: membro + sender_id = auth.uid() + sender_role bate com role real
-- UPDATE: membro (campos protegidos pelo trigger BEFORE UPDATE acima)
-- DELETE: bloqueado nesta fase (divida: soft delete em fase futura)
-- -----------------------------------------------------------------------------
ALTER TABLE public.work_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "work_messages_select" ON public.work_messages;
CREATE POLICY "work_messages_select" ON public.work_messages
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.work_members wm
      WHERE wm.work_id = work_messages.work_id
        AND wm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "work_messages_insert" ON public.work_messages;
CREATE POLICY "work_messages_insert" ON public.work_messages
  FOR INSERT
  WITH CHECK (
    auth.uid() = sender_id
    AND EXISTS (
      SELECT 1 FROM public.work_members wm
      WHERE wm.work_id = work_messages.work_id
        AND wm.user_id = auth.uid()
        AND wm.role = work_messages.sender_role
    )
  );

DROP POLICY IF EXISTS "work_messages_update" ON public.work_messages;
CREATE POLICY "work_messages_update" ON public.work_messages
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.work_members wm
      WHERE wm.work_id = work_messages.work_id
        AND wm.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.work_members wm
      WHERE wm.work_id = work_messages.work_id
        AND wm.user_id = auth.uid()
    )
  );

-- DELETE: sem policy = bloqueado.

-- -----------------------------------------------------------------------------
-- 8. RLS — work_message_attachments
-- SELECT: membro da obra
-- INSERT: dono da mensagem (sender_id = auth.uid())
-- UPDATE/DELETE: bloqueado
-- -----------------------------------------------------------------------------
ALTER TABLE public.work_message_attachments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "work_message_attachments_select" ON public.work_message_attachments;
CREATE POLICY "work_message_attachments_select" ON public.work_message_attachments
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.work_members wm
      WHERE wm.work_id = work_message_attachments.work_id
        AND wm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "work_message_attachments_insert" ON public.work_message_attachments;
CREATE POLICY "work_message_attachments_insert" ON public.work_message_attachments
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.work_messages m
      WHERE m.id = work_message_attachments.message_id
        AND m.sender_id = auth.uid()
        AND m.work_id = work_message_attachments.work_id
    )
  );

-- UPDATE/DELETE: sem policy = bloqueado.

-- -----------------------------------------------------------------------------
-- 9. Storage policy — INSERT em andamento-obra restrito a path {work_id}/chat/...
--    Validar (storage.foldername(name))[2] = 'chat' impede que esta policy
--    abra escrita em outras pastas (que ganharao policies proprias nos
--    blocos 6, 7, 10).
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "andamento_obra_storage_insert_chat" ON storage.objects;
CREATE POLICY "andamento_obra_storage_insert_chat" ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'andamento-obra'
    AND (storage.foldername(name))[2] = 'chat'
    AND EXISTS (
      SELECT 1 FROM public.work_members wm
      WHERE wm.user_id = auth.uid()
        AND wm.work_id::text = (storage.foldername(name))[1]
    )
  );

-- -----------------------------------------------------------------------------
-- 10. Habilitar Realtime: publicacao supabase_realtime para work_messages.
--     A subscription do client filtra por work_id; RLS continua aplicado.
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime'
  ) THEN
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.work_messages;
    EXCEPTION
      WHEN duplicate_object THEN
        NULL;
    END;
  END IF;
END $$;
