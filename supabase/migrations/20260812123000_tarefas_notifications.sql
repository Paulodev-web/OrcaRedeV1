-- =============================================================================
-- ESTEIRA DE TRABALHO — notificações (reaproveita `notifications`, sem ALTER)
--
-- `notifications` já foi generalizada por módulo em
-- 20260803120000_notifications_module_activity.sql (module_key, entity_type,
-- entity_id, sem FK em entity_id de propósito). Nenhuma migration na tabela é
-- necessária — só os triggers abaixo, no molde de on_new_work_message_notify
-- (20260504210000_andamento_obra_chat.sql).
--
-- A CORREÇÃO DE VOLUME
--   A versão da manhã de 12/08/2026 notificava todo `task_member` a cada
--   mensagem, e a lista de membros crescia com o setor inteiro a cada handoff.
--   Três handoffs depois, qualquer mensagem em qualquer card notificava a
--   empresa toda e o sino virava ruído — que é a morte de um sistema de
--   notificação. Agora:
--
--     handoff (mudou de setor) → membros ativos do setor de DESTINO.
--                                Evento pontual: "chegou trabalho pra vocês".
--     responsável atribuído    → a pessoa.
--     bloqueio/desbloqueio     → seguidores. É o sinal que trava o job inteiro
--                                ("esperando a concessionária") e quem
--                                acompanha o card precisa saber.
--     mensagem no chat         → SEGUIDORES (criador, responsável, quem já
--                                comentou), nunca o setor inteiro.
--
-- `notifications` não tem policy de INSERT para `authenticated` (só SELECT e
-- UPDATE do próprio dono) — por isso os triggers são SECURITY DEFINER, e por
-- isso mesmo têm EXECUTE revogado de PUBLIC/anon/authenticated: função de
-- trigger SECURITY DEFINER não pode virar RPC pública via PostgREST.
-- =============================================================================

-- Rótulos em português para o corpo da notificação. IMMUTABLE e local a este
-- arquivo — a UI tem os mesmos rótulos em src/types/tasks.ts.
CREATE OR REPLACE FUNCTION public.task_stage_label(_stage TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE _stage
    WHEN 'solicitacao'       THEN 'Solicitação'
    WHEN 'orcamento'         THEN 'Orçamento técnico'
    WHEN 'precificacao'      THEN 'Precificação'
    WHEN 'proposta'          THEN 'Proposta'
    WHEN 'projeto_executivo' THEN 'Projeto executivo'
    WHEN 'compras'           THEN 'Compras'
    WHEN 'execucao'          THEN 'Execução'
    WHEN 'concluido'         THEN 'Concluído'
    WHEN 'perdido'           THEN 'Perdido'
    ELSE 'Avulsa'
  END;
$$;

-- -----------------------------------------------------------------------------
-- 1. Handoff — notifica os membros ativos do setor de destino
--
--    Setor, não pessoa: mapeamentooperacional.md §5.1 fala em "quando uma task
--    chega no SEU SETOR, você é notificado". Quem fez o handoff não recebe a
--    notificação da própria ação.
--
--    Dispara em UPDATE OF sector (e não OF stage): trocar de `orcamento` para
--    `precificacao` mantém a Engenharia como dona e não é chegada de trabalho
--    novo pra ninguém — notificar ali seria ruído.
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
    'Chegou na sua fila: ' || NEW.title,
    public.task_stage_label(OLD.stage) || ' → ' || public.task_stage_label(NEW.stage),
    '/tarefas/' || NEW.id::text,
    'tarefas',
    'task',
    NEW.id
  FROM public.org_members m
  WHERE m.org_id = NEW.org_id
    AND m.sector = NEW.sector
    AND m.is_active
    AND m.user_id IS DISTINCT FROM auth.uid();

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
-- 2. Responsável atribuído
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.on_task_assigned_notify()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Assumir o próprio card não gera notificação pra si mesmo.
  IF NEW.assigned_to IS NULL OR NEW.assigned_to = auth.uid() THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.notifications (user_id, kind, title, body, link_path, module_key, entity_type, entity_id)
  VALUES (
    NEW.assigned_to,
    'task_assigned',
    'Você é o responsável: ' || NEW.title,
    public.task_stage_label(NEW.stage),
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
-- 3. Bloqueio e desbloqueio — notifica seguidores
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.on_task_blocked_notify()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.notifications (user_id, kind, title, body, link_path, module_key, entity_type, entity_id)
  SELECT
    f.user_id,
    CASE WHEN NEW.blocked_reason IS NULL THEN 'task_unblocked' ELSE 'task_blocked' END,
    CASE WHEN NEW.blocked_reason IS NULL
         THEN 'Destravou: ' || NEW.title
         ELSE 'Travou: ' || NEW.title END,
    NEW.blocked_reason,
    '/tarefas/' || NEW.id::text,
    'tarefas',
    'task',
    NEW.id
  FROM public.task_followers f
  WHERE f.task_id = NEW.id
    AND f.user_id IS DISTINCT FROM auth.uid();

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.on_task_blocked_notify()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_task_blocked_notify ON public.tasks;
CREATE TRIGGER trg_task_blocked_notify
  AFTER UPDATE OF blocked_reason ON public.tasks
  FOR EACH ROW
  WHEN (NEW.blocked_reason IS DISTINCT FROM OLD.blocked_reason)
  EXECUTE FUNCTION public.on_task_blocked_notify();

-- -----------------------------------------------------------------------------
-- 4. Nova mensagem no chat — só seguidores, nunca o setor inteiro
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

  v_preview := left(COALESCE(NEW.body, 'Enviou um anexo'), 80);
  IF length(COALESCE(NEW.body, '')) > 80 THEN
    v_preview := v_preview || '…';
  END IF;

  INSERT INTO public.notifications (user_id, kind, title, body, link_path, module_key, entity_type, entity_id)
  SELECT
    f.user_id,
    'task_message',
    'Nova mensagem em ' || COALESCE(v_task_title, 'uma tarefa'),
    v_preview,
    '/tarefas/' || NEW.task_id::text,
    'tarefas',
    'task',
    NEW.task_id
  FROM public.task_followers f
  WHERE f.task_id = NEW.task_id
    AND f.user_id <> NEW.sender_id;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.on_new_task_message_notify()
  FROM PUBLIC, anon, authenticated;

-- Ordem importa: `trg_task_message_after_insert` (migration de chat) insere o
-- remetente em task_followers. Os nomes de trigger são disparados em ordem
-- alfabética pelo Postgres, e `trg_task_message_after_insert` <
-- `trg_task_message_notify` — então quando este roda, o remetente já está na
-- lista e é excluído pelo `f.user_id <> NEW.sender_id` acima.
DROP TRIGGER IF EXISTS trg_task_message_notify ON public.task_messages;
CREATE TRIGGER trg_task_message_notify
  AFTER INSERT ON public.task_messages
  FOR EACH ROW EXECUTE FUNCTION public.on_new_task_message_notify();
