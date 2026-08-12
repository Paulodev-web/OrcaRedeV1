-- =============================================================================
-- QUADRO DE TRABALHO — integração com notifications (reaproveitada, sem ALTER)
--
-- `notifications` já foi generalizada por módulo em
-- 20260803120000_notifications_module_activity.sql (module_key, entity_type,
-- entity_id, sem FK em entity_id de propósito). Nenhuma migration na tabela é
-- necessária — só os 3 triggers abaixo, no mesmo molde de
-- on_new_work_message_notify (20260504210000_andamento_obra_chat.sql).
--
-- `notifications` não tem policy de INSERT para `authenticated` (só SELECT/UPDATE
-- do próprio dono) — por isso os 3 triggers são SECURITY DEFINER, e por isso
-- mesmo têm EXECUTE revogado de PUBLIC/anon/authenticated no final: função de
-- trigger SECURITY DEFINER não pode virar RPC pública via PostgREST.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Handoff de setor — notifica TODO membro ativo do setor de destino
--    (não uma pessoa: "quando uma task chega no seu setor, você é notificado",
--    mapeamentooperacional.md §5.1 — fala em setor, não em indivíduo).
--    O próprio autor do handoff não recebe a notificação da própria ação.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.on_task_sector_changed_notify()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.notifications (user_id, kind, title, body, link_path, module_key, entity_type, entity_id)
  SELECT
    m.user_id,
    'task_sector_changed',
    'Task para ' || NEW.sector || ': ' || NEW.title,
    'Passou de ' || COALESCE(OLD.sector, '—') || ' para ' || NEW.sector,
    '/tarefas/' || NEW.id::text,
    'tarefas',
    'task',
    NEW.id
  FROM public.org_members m
  WHERE m.org_id = NEW.org_id
    AND m.sector = NEW.sector
    AND m.is_active
    AND m.user_id <> auth.uid();

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.on_task_sector_changed_notify()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_task_sector_changed_notify ON public.tasks;
CREATE TRIGGER trg_task_sector_changed_notify
  AFTER UPDATE OF sector ON public.tasks
  FOR EACH ROW
  WHEN (NEW.sector IS DISTINCT FROM OLD.sector)
  EXECUTE FUNCTION public.on_task_sector_changed_notify();

-- -----------------------------------------------------------------------------
-- 2. Responsável individual atribuído/trocado
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.on_task_assigned_notify()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.assigned_to IS NULL OR NEW.assigned_to = auth.uid() THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.notifications (user_id, kind, title, body, link_path, module_key, entity_type, entity_id)
  VALUES (
    NEW.assigned_to,
    'task_assigned',
    'Você foi responsável por: ' || NEW.title,
    NULL,
    '/tarefas/' || NEW.id::text,
    'tarefas',
    'task',
    NEW.id
  );

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.on_task_assigned_notify()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_task_assigned_notify ON public.tasks;
CREATE TRIGGER trg_task_assigned_notify
  AFTER UPDATE OF assigned_to ON public.tasks
  FOR EACH ROW
  WHEN (NEW.assigned_to IS DISTINCT FROM OLD.assigned_to)
  EXECUTE FUNCTION public.on_task_assigned_notify();

-- -----------------------------------------------------------------------------
-- 3. Nova mensagem no chat — notifica participantes, exceto o remetente
--    (mesmo molde de on_new_work_message_notify, generalizado de 1
--    destinatário fixo para N via task_members).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.on_new_task_message_notify()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_task_title TEXT;
  v_preview    TEXT;
BEGIN
  SELECT title INTO v_task_title FROM public.tasks WHERE id = NEW.task_id;

  v_preview := left(NEW.body, 80);
  IF length(NEW.body) > 80 THEN
    v_preview := v_preview || '...';
  END IF;

  INSERT INTO public.notifications (user_id, kind, title, body, link_path, module_key, entity_type, entity_id)
  SELECT
    tm.user_id,
    'task_message',
    'Nova mensagem em ' || COALESCE(v_task_title, 'uma tarefa'),
    v_preview,
    '/tarefas/' || NEW.task_id::text,
    'tarefas',
    'task',
    NEW.task_id
  FROM public.task_members tm
  WHERE tm.task_id = NEW.task_id
    AND tm.user_id <> NEW.sender_id;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.on_new_task_message_notify()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_task_message_notify ON public.task_messages;
CREATE TRIGGER trg_task_message_notify
  AFTER INSERT ON public.task_messages
  FOR EACH ROW EXECUTE FUNCTION public.on_new_task_message_notify();
