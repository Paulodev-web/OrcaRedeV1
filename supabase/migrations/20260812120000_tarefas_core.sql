-- =============================================================================
-- QUADRO DE TRABALHO — Fase 4 do plano de org (Fase 4 de MD/PLANO-ORG-MULTITENANCY.md)
--
-- PROPÓSITO
--   mapeamentooperacional.md §5.1 — "Sistema de Tasks com RBAC (o Trello
--   interno)". Handoff formal de trabalho entre os quatro setores da ON
--   (Comercial, Engenharia, Compras, Execução), amarrado ao budget_id que já é
--   o fio condutor de toda a esteira (OrçaRede → Precificação → Suprimentos →
--   Andamento de Obra).
--
-- POR QUE NÃO É UM TRELLO GENÉRICO
--   `sector` e `status` são enums fixos, não board/listas configuráveis:
--     sector → o board que se olha, os mesmos 4 valores de org_members.sector
--              (criado em 20260806120000 já com esse propósito — ver comentário
--              da coluna ali: "alimenta o roteamento de cards no módulo Quadro
--              de Trabalho").
--     status → a coluna dentro do board, literalmente o texto do mapeamento:
--              "fila, em andamento e concluído para cada setor".
--   Task pertence a UM setor + UM status. Trocar de setor é handoff; trocar de
--   status é progresso dentro do mesmo setor.
--
--   Passagem entre setores é LIVRE (mapeamento: "Engenharia entrega e passa de
--   volta para Comercial ou para Compras") — sem máquina de estados por papel
--   tipo work_alerts_protect_fields. Não é pipeline linear, é roteamento livre
--   com histórico obrigatório.
--
-- RLS — segue o padrão pós-flip (20260807140000_org_rls_flip.sql):
--   SELECT/DELETE: org_id = (SELECT current_org_id())
--   UPDATE:        idem no USING e WITH CHECK, sem checar autor — colega edita
--                  task de colega, é o objetivo de toda a camada de org.
--   INSERT:        org_id = current_org_id() AND auth.uid() = created_by
--                  AND budget é da mesma org (guarda de integridade, mesmo
--                  padrão de proposals_insert).
--   SEMPRE `TO authenticated` — nunca `TO public`/`anon` (lição do rls_flip:
--   isso quebrou a página pública de propostas uma vez).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. tasks
-- -----------------------------------------------------------------------------
CREATE TABLE public.tasks (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            UUID        NOT NULL REFERENCES public.organizations(id) DEFAULT public.current_org_id(),
  budget_id         UUID        NOT NULL REFERENCES public.budgets(id) ON DELETE RESTRICT,
  title             TEXT        NOT NULL CHECK (length(btrim(title)) > 0),
  description       TEXT        NULL,
  sector            TEXT        NOT NULL CHECK (sector IN ('comercial', 'engenharia', 'compras', 'execucao')),
  status            TEXT        NOT NULL DEFAULT 'fila' CHECK (status IN ('fila', 'andamento', 'concluida')),
  assigned_to       UUID        NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  due_date          DATE        NULL,
  created_by        UUID        NOT NULL REFERENCES auth.users(id) DEFAULT auth.uid(),
  -- Transiente: veículo de uma nota opcional para o UPDATE que muda
  -- sector/status. O trigger de auditoria (seção 3) grava em task_transitions
  -- e zera esta coluna antes de retornar — nunca carrega estado entre linhas.
  transition_note   TEXT        NULL,
  last_activity_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.tasks IS
  'Quadro de Trabalho — handoff formal entre setores (mapeamentooperacional.md '
  '§5.1). Uma task mora em um setor (a fila) e um status dentro dele. Trocar de '
  'setor é handoff — reseta status para fila (trigger tasks_audit_transitions).';

COMMENT ON COLUMN public.tasks.sector IS
  'Setor responsável atual — mesmos 4 valores de org_members.sector. Roteamento '
  'livre entre os 4 (comercial/engenharia/compras/execucao passam entre si sem '
  'restrição de máquina de estados).';

COMMENT ON COLUMN public.tasks.transition_note IS
  'Campo transiente: nota opcional anexada ao UPDATE que muda sector/status. O '
  'trigger tasks_audit_transitions copia para task_transitions.note e zera esta '
  'coluna na mesma instrução — nunca é lido fora do trigger.';

CREATE INDEX idx_tasks_org_sector_status
  ON public.tasks (org_id, sector, status);

CREATE INDEX idx_tasks_org_budget
  ON public.tasks (org_id, budget_id);

CREATE INDEX idx_tasks_org_assigned
  ON public.tasks (org_id, assigned_to)
  WHERE assigned_to IS NOT NULL;

-- -----------------------------------------------------------------------------
-- 2. task_transitions — histórico de handoff (setor↔setor, status↔status)
-- -----------------------------------------------------------------------------
CREATE TABLE public.task_transitions (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id     UUID        NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  org_id      UUID        NOT NULL,
  actor_id    UUID        NOT NULL,
  from_sector TEXT        NULL,
  to_sector   TEXT        NULL,
  from_status TEXT        NULL,
  to_status   TEXT        NULL,
  note        TEXT        NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.task_transitions IS
  'Auditoria de handoff — uma linha por mudança de sector e/ou status em '
  'tasks, escrita pelo trigger tasks_audit_transitions (nunca por INSERT de '
  'app direto). Histórico é transparente pra org inteira, igual à task em si.';

CREATE INDEX idx_task_transitions_task
  ON public.task_transitions (task_id, created_at DESC);

-- -----------------------------------------------------------------------------
-- 3. tasks_audit_transitions — trigger BEFORE UPDATE em tasks
--
--    BEFORE (não AFTER) de propósito: precisa ESCREVER em NEW (resetar status
--    no handoff, zerar transition_note) e inserir o histórico na mesma
--    transação, sem RPC extra e sem depender de quem fez o UPDATE (UI, script
--    SQL, futura automação do GestãoClick). Roda como invoker (não SECURITY
--    DEFINER): quem tem UPDATE em tasks sempre pode gerar uma transição.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tasks_audit_transitions()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_sector_changed BOOLEAN := NEW.sector IS DISTINCT FROM OLD.sector;
  v_status_changed BOOLEAN := NEW.status IS DISTINCT FROM OLD.status;
BEGIN
  -- Handoff de setor: task ainda não foi tocada pelo setor novo, então volta
  -- pra fila. Sem isso a task chegaria "concluída" num setor que nem começou.
  IF v_sector_changed THEN
    NEW.status := 'fila';
    v_status_changed := NEW.status IS DISTINCT FROM OLD.status;
    -- Handoff também limpa o responsável — a pessoa nova ainda não foi escolhida.
    NEW.assigned_to := NULL;
  END IF;

  IF v_sector_changed OR v_status_changed THEN
    INSERT INTO public.task_transitions (
      task_id, org_id, actor_id, from_sector, to_sector, from_status, to_status, note
    ) VALUES (
      NEW.id, NEW.org_id, auth.uid(),
      CASE WHEN v_sector_changed THEN OLD.sector ELSE NULL END,
      CASE WHEN v_sector_changed THEN NEW.sector ELSE NULL END,
      CASE WHEN v_status_changed THEN OLD.status ELSE NULL END,
      CASE WHEN v_status_changed THEN NEW.status ELSE NULL END,
      NEW.transition_note
    );
  END IF;

  NEW.transition_note := NULL;
  NEW.updated_at := now();
  NEW.last_activity_at := now();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tasks_audit_transitions ON public.tasks;
CREATE TRIGGER trg_tasks_audit_transitions
  BEFORE UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.tasks_audit_transitions();

-- -----------------------------------------------------------------------------
-- 4. RLS — tasks
-- -----------------------------------------------------------------------------
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tasks_select" ON public.tasks;
CREATE POLICY "tasks_select" ON public.tasks
  FOR SELECT
  TO authenticated
  USING (org_id = (SELECT public.current_org_id()));

DROP POLICY IF EXISTS "tasks_insert" ON public.tasks;
CREATE POLICY "tasks_insert" ON public.tasks
  FOR INSERT
  TO authenticated
  WITH CHECK (
    org_id = (SELECT public.current_org_id())
    AND auth.uid() = created_by
    AND EXISTS (
      SELECT 1 FROM public.budgets b
      WHERE b.id = tasks.budget_id
        AND b.org_id = (SELECT public.current_org_id())
    )
  );

DROP POLICY IF EXISTS "tasks_update" ON public.tasks;
CREATE POLICY "tasks_update" ON public.tasks
  FOR UPDATE
  TO authenticated
  USING (org_id = (SELECT public.current_org_id()))
  WITH CHECK (org_id = (SELECT public.current_org_id()));

DROP POLICY IF EXISTS "tasks_delete" ON public.tasks;
CREATE POLICY "tasks_delete" ON public.tasks
  FOR DELETE
  TO authenticated
  USING (org_id = (SELECT public.current_org_id()));

-- -----------------------------------------------------------------------------
-- 5. RLS — task_transitions (transparente pra org, escrita só pelo trigger)
-- -----------------------------------------------------------------------------
ALTER TABLE public.task_transitions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "task_transitions_select" ON public.task_transitions;
CREATE POLICY "task_transitions_select" ON public.task_transitions
  FOR SELECT
  TO authenticated
  USING (org_id = (SELECT public.current_org_id()));

-- INSERT: qualquer membro da org que também consiga dar UPDATE em tasks (o
-- trigger insere na mesma transação do UPDATE, como o próprio invoker).
-- Sem policy de UPDATE/DELETE: histórico é imutável.
DROP POLICY IF EXISTS "task_transitions_insert" ON public.task_transitions;
CREATE POLICY "task_transitions_insert" ON public.task_transitions
  FOR INSERT
  TO authenticated
  WITH CHECK (org_id = (SELECT public.current_org_id()));

-- -----------------------------------------------------------------------------
-- 6. Realtime — tasks entra na publication (board atualiza ao vivo quando um
--    colega move um card). task_transitions fica de fora por ora: o detalhe da
--    task já recarrega a lista ao ver tasks.updated_at mudar.
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.tasks;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
