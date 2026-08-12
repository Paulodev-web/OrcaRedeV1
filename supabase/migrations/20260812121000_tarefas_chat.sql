-- =============================================================================
-- QUADRO DE TRABALHO — chat por task (task_members + task_messages)
--
-- Generaliza o chat 1:1 engenheiro↔gerente do Andamento de Obra
-- (20260504210000_andamento_obra_chat.sql, work_messages/work_members) para N
-- participantes: quem criou a task, o setor de origem e o setor de destino a
-- cada handoff — sem exigir convite manual pra esses casos comuns.
--
-- ASSIMETRIA DELIBERADA: a task em si é visível pra org inteira (tasks_select,
-- 20260812120000), mas o chat é gated por participação (task_members). O
-- autor que fez handoff continua vendo ONDE a task está, mas só volta a ler o
-- chat se for readicionado — igual ao "contextualizado" do mapeamento
-- operacional, sem reimplementar RBAC granular que ninguém pediu pra v1.
--
-- Sem anexos de mídia nesta fase — mapeamento pede "chat por task" (texto).
-- work_message_attachments mostra que dá pra estender depois sem quebrar nada.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. task_members
-- -----------------------------------------------------------------------------
CREATE TABLE public.task_members (
  task_id    UUID        NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  added_by   UUID        NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (task_id, user_id)
);

COMMENT ON TABLE public.task_members IS
  'Participantes do chat de uma task. Seed automático (trigger '
  'tasks_seed_members): autor na criação, membros ativos do setor de destino a '
  'cada handoff. addTaskParticipantAction cobre o caso manual — trazer alguém '
  'antes do handoff formal.';

CREATE INDEX idx_task_members_user ON public.task_members (user_id);

-- Helper SECURITY DEFINER — mesmo motivo de public.is_work_member
-- (20260509000000_fix_rls_recursion_works_members.sql): uma policy em
-- task_members que fizesse EXISTS direto em task_members entraria em recursão.
CREATE OR REPLACE FUNCTION public.is_task_member(_task_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.task_members tm
    WHERE tm.task_id = _task_id
      AND tm.user_id = auth.uid()
  );
$$;

REVOKE EXECUTE ON FUNCTION public.is_task_member(UUID) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.is_task_member(UUID) TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 2. tasks_seed_members — popula task_members automaticamente
--    AFTER INSERT: autor entra.
--    AFTER UPDATE OF sector: membros ativos do setor de destino entram (quem
--    já estava, fica — ON CONFLICT DO NOTHING).
--    SECURITY DEFINER: sem isso, inserir o PRIMEIRO membro de um setor novo
--    falharia contra a própria policy de INSERT de task_members (que exige já
--    ser membro — problema do ovo e da galinha).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tasks_seed_members()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.task_members (task_id, user_id, added_by)
    VALUES (NEW.id, NEW.created_by, NEW.created_by)
    ON CONFLICT DO NOTHING;
  END IF;

  INSERT INTO public.task_members (task_id, user_id, added_by)
  SELECT NEW.id, m.user_id, COALESCE(auth.uid(), NEW.created_by)
  FROM public.org_members m
  WHERE m.org_id = NEW.org_id
    AND m.sector = NEW.sector
    AND m.is_active
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.tasks_seed_members()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_tasks_seed_members_insert ON public.tasks;
CREATE TRIGGER trg_tasks_seed_members_insert
  AFTER INSERT ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.tasks_seed_members();

DROP TRIGGER IF EXISTS trg_tasks_seed_members_handoff ON public.tasks;
CREATE TRIGGER trg_tasks_seed_members_handoff
  AFTER UPDATE OF sector ON public.tasks
  FOR EACH ROW
  WHEN (NEW.sector IS DISTINCT FROM OLD.sector)
  EXECUTE FUNCTION public.tasks_seed_members();

-- -----------------------------------------------------------------------------
-- 3. RLS — task_members
--    SELECT/INSERT via is_task_member(): quem já está no chat pode trazer
--    outra pessoa. O seed automático roda SECURITY DEFINER e não passa por
--    aqui. Sem UPDATE/DELETE — sair do chat não é caso de uso da v1.
-- -----------------------------------------------------------------------------
ALTER TABLE public.task_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "task_members_select" ON public.task_members;
CREATE POLICY "task_members_select" ON public.task_members
  FOR SELECT
  TO authenticated
  USING (public.is_task_member(task_id));

DROP POLICY IF EXISTS "task_members_insert" ON public.task_members;
CREATE POLICY "task_members_insert" ON public.task_members
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_task_member(task_id) AND added_by = auth.uid());

-- -----------------------------------------------------------------------------
-- 4. task_messages
-- -----------------------------------------------------------------------------
CREATE TABLE public.task_messages (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id         UUID        NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  sender_id       UUID        NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  body            TEXT        NOT NULL CHECK (length(btrim(body)) > 0),
  client_event_id UUID        NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_task_messages_task_created
  ON public.task_messages (task_id, created_at DESC);

CREATE UNIQUE INDEX idx_task_messages_client_event
  ON public.task_messages (client_event_id)
  WHERE client_event_id IS NOT NULL;

-- Bump em tasks.last_activity_at — mesma razão de
-- update_work_last_activity_on_message (ordenação da lista por atividade).
CREATE OR REPLACE FUNCTION public.update_task_last_activity_on_message()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.tasks SET last_activity_at = now() WHERE id = NEW.task_id;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.update_task_last_activity_on_message()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_task_message_activity ON public.task_messages;
CREATE TRIGGER trg_task_message_activity
  AFTER INSERT ON public.task_messages
  FOR EACH ROW EXECUTE FUNCTION public.update_task_last_activity_on_message();

-- -----------------------------------------------------------------------------
-- 5. RLS — task_messages
--    SELECT/INSERT via is_task_member(). Sem UPDATE (não há read receipts na
--    v1, ao contrário de work_messages) nem DELETE — mesmo racional de
--    work_messages (débito documentado, não construído).
-- -----------------------------------------------------------------------------
ALTER TABLE public.task_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "task_messages_select" ON public.task_messages;
CREATE POLICY "task_messages_select" ON public.task_messages
  FOR SELECT
  TO authenticated
  USING (public.is_task_member(task_id));

DROP POLICY IF EXISTS "task_messages_insert" ON public.task_messages;
CREATE POLICY "task_messages_insert" ON public.task_messages
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = sender_id AND public.is_task_member(task_id));

-- -----------------------------------------------------------------------------
-- 6. Realtime
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.task_messages;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
