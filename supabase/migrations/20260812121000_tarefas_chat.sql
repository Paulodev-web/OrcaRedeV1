-- =============================================================================
-- ESTEIRA DE TRABALHO — conversa por card (task_messages + task_followers)
--
-- DUAS CORREÇÕES SOBRE A VERSÃO DA MANHÃ DE 12/08/2026
--
-- 1. LEITURA DO CHAT VIRA ORG-WIDE.
--    A versão anterior gateava `task_messages_select` por `is_task_member()`
--    enquanto `tasks_select` liberava a task pra org inteira. Resultado: quem
--    fizesse o handoff continuava vendo ONDE o card estava mas perdia a
--    conversa — e ia pedir print no WhatsApp. Isso contradiz a camada de org
--    inteira, cujo ponto foi justamente remover filtros por pessoa (commits
--    bc366c1, 037996c). Agora o chat enxerga o mesmo que a task enxerga.
--
-- 2. `task_members` VIRA `task_followers` E PARA DE INCHAR.
--    A versão anterior adicionava TODOS os membros ativos do setor de destino a
--    cada handoff, e notificava todo membro a cada mensagem. Depois de 3
--    handoffs, qualquer mensagem em qualquer card notificava a empresa inteira
--    — o sino morreria por excesso em duas semanas.
--
--    A lista agora só decide QUEM É NOTIFICADO, não quem pode ler, e entra
--    nela quem demonstrou interesse: criou, é responsável, ou comentou. O
--    handoff continua notificando o setor de destino, mas por consulta direta a
--    `org_members` (é um evento pontual — "chegou trabalho pra vocês"), sem
--    deixar resíduo na lista de seguidores.
--
-- Anexos ficam na migration seguinte (20260812122000_tarefas_attachments.sql) e
-- podem pendurar em uma mensagem — é o que faz "mandei a planta no chat" e
-- "anexei a planta no card" caírem no mesmo lugar.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. task_followers
-- -----------------------------------------------------------------------------
CREATE TABLE public.task_followers (
  task_id    UUID        NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id     UUID        NOT NULL DEFAULT public.current_org_id(),
  -- Por que a pessoa passou a seguir. Só documental — a UI mostra "seguindo
  -- porque você comentou" e oferece o botão de parar.
  reason     TEXT        NOT NULL DEFAULT 'manual'
                         CHECK (reason IN ('criador', 'responsavel', 'comentou', 'manual')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (task_id, user_id)
);

COMMENT ON TABLE public.task_followers IS
  'Quem é NOTIFICADO sobre um card — não quem pode lê-lo (isso é org-wide, '
  'igual à task). Populada por trigger: criador, responsável e quem comentou. '
  'O setor de destino de um handoff NÃO entra aqui: aquele evento é notificado '
  'por consulta a org_members, sem inchar a lista.';

CREATE INDEX idx_task_followers_user ON public.task_followers (user_id);

-- -----------------------------------------------------------------------------
-- 2. task_messages
-- -----------------------------------------------------------------------------
CREATE TABLE public.task_messages (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id         UUID        NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  org_id          UUID        NOT NULL DEFAULT public.current_org_id(),
  sender_id       UUID        NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  -- Corpo é opcional quando a mensagem carrega só anexo ("mandou a foto sem
  -- escrever nada"), mas não pode ser string em branco.
  body            TEXT        NULL CHECK (body IS NULL OR length(btrim(body)) > 0),
  client_event_id UUID        NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON COLUMN public.task_messages.client_event_id IS
  'Id gerado no browser antes do envio. O índice único abaixo faz reenvio '
  '(retry de rede, duplo clique) não duplicar, e permite ao cliente casar a '
  'bolha otimista com a linha real que volta pelo Realtime.';

CREATE INDEX idx_task_messages_task_created
  ON public.task_messages (task_id, created_at);

CREATE UNIQUE INDEX idx_task_messages_client_event
  ON public.task_messages (client_event_id)
  WHERE client_event_id IS NOT NULL;

-- -----------------------------------------------------------------------------
-- 3. Triggers de seguidor — quem demonstra interesse passa a seguir
--
--    SECURITY DEFINER: sem isso, o primeiro INSERT em task_followers falharia
--    contra a própria policy quando quem age não é a pessoa que vai seguir
--    (ex.: eu atribuo o card pra você, você passa a seguir).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tasks_sync_followers()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.task_followers (task_id, user_id, org_id, reason)
    VALUES (NEW.id, NEW.created_by, NEW.org_id, 'criador')
    ON CONFLICT DO NOTHING;
  ELSIF NEW.assigned_to IS NOT NULL THEN
    INSERT INTO public.task_followers (task_id, user_id, org_id, reason)
    VALUES (NEW.id, NEW.assigned_to, NEW.org_id, 'responsavel')
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.tasks_sync_followers() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_tasks_follow_creator ON public.tasks;
CREATE TRIGGER trg_tasks_follow_creator
  AFTER INSERT ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.tasks_sync_followers();

DROP TRIGGER IF EXISTS trg_tasks_follow_assignee ON public.tasks;
CREATE TRIGGER trg_tasks_follow_assignee
  AFTER UPDATE OF assigned_to ON public.tasks
  FOR EACH ROW
  WHEN (NEW.assigned_to IS DISTINCT FROM OLD.assigned_to)
  EXECUTE FUNCTION public.tasks_sync_followers();

-- Quem comenta passa a seguir, e o card sobe na ordenação por atividade.
CREATE OR REPLACE FUNCTION public.task_messages_after_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.tasks SET last_activity_at = now() WHERE id = NEW.task_id;

  INSERT INTO public.task_followers (task_id, user_id, org_id, reason)
  VALUES (NEW.task_id, NEW.sender_id, NEW.org_id, 'comentou')
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.task_messages_after_insert()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_task_message_after_insert ON public.task_messages;
CREATE TRIGGER trg_task_message_after_insert
  AFTER INSERT ON public.task_messages
  FOR EACH ROW EXECUTE FUNCTION public.task_messages_after_insert();

-- -----------------------------------------------------------------------------
-- 4. RLS — task_followers
--    Leitura org-wide (saber quem acompanha o card é informação do time).
--    INSERT org-wide: dá pra chamar um colega pro card. DELETE só de si mesmo:
--    ninguém tira você de um assunto que é seu.
-- -----------------------------------------------------------------------------
ALTER TABLE public.task_followers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "task_followers_select" ON public.task_followers;
CREATE POLICY "task_followers_select" ON public.task_followers
  FOR SELECT
  TO authenticated
  USING (org_id = (SELECT public.current_org_id()));

DROP POLICY IF EXISTS "task_followers_insert" ON public.task_followers;
CREATE POLICY "task_followers_insert" ON public.task_followers
  FOR INSERT
  TO authenticated
  WITH CHECK (org_id = (SELECT public.current_org_id()));

DROP POLICY IF EXISTS "task_followers_delete" ON public.task_followers;
CREATE POLICY "task_followers_delete" ON public.task_followers
  FOR DELETE
  TO authenticated
  USING (org_id = (SELECT public.current_org_id()) AND user_id = auth.uid());

-- -----------------------------------------------------------------------------
-- 5. RLS — task_messages
--    SELECT org-wide: a correção nº 1 do cabeçalho.
--    INSERT: só em nome próprio e só na org corrente.
--    Sem UPDATE (não há read receipts nesta versão) nem DELETE — mesmo racional
--    de work_messages: débito documentado, não construído.
-- -----------------------------------------------------------------------------
ALTER TABLE public.task_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "task_messages_select" ON public.task_messages;
CREATE POLICY "task_messages_select" ON public.task_messages
  FOR SELECT
  TO authenticated
  USING (org_id = (SELECT public.current_org_id()));

DROP POLICY IF EXISTS "task_messages_insert" ON public.task_messages;
CREATE POLICY "task_messages_insert" ON public.task_messages
  FOR INSERT
  TO authenticated
  WITH CHECK (
    org_id = (SELECT public.current_org_id())
    AND auth.uid() = sender_id
    AND EXISTS (
      SELECT 1 FROM public.tasks t
      WHERE t.id = task_messages.task_id
        AND t.org_id = (SELECT public.current_org_id())
    )
  );

-- -----------------------------------------------------------------------------
-- 6. Realtime
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.task_messages;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
