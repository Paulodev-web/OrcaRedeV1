-- =============================================================================
-- ESTEIRA DE TRABALHO — Fase 4 do plano de org (MD/PLANO-ESTEIRA-TAREFAS.md)
--
-- PROPÓSITO
--   mapeamentooperacional.md §3 (o fluxo real, Fases 1 a 7) e §5.1 (o "Trello
--   interno"). O card é a DEMANDA do cliente e caminha por etapas fixas,
--   trocando de setor a cada handoff. Arrastar o card entre colunas é o
--   handoff; o histórico de toda transição é obrigatório.
--
-- POR QUE ESTE ARQUIVO FOI REESCRITO NO MESMO DIA
--   A primeira versão (12/08/2026, manhã) modelava `setor = quadro` e
--   `status = coluna`, com `budget_id NOT NULL`. Dois defeitos de modelo:
--
--   1. `budget_id NOT NULL` impedia a Fase 1 do mapeamento. O ponto de entrada
--      de todo projeto é o Comercial recebendo o cliente; o orçamento só nasce
--      na Fase 2, dentro da Engenharia. Com a coluna obrigatória, o Comercial
--      não conseguia abrir a primeira demanda — o fluxo real voltava pro
--      WhatsApp, que é o gargalo que o módulo existe pra matar.
--
--   2. Quatro quadros independentes não formam esteira. Pra saber onde estava
--      o job do cliente era preciso abrir as 4 abas, e uma task "concluída" no
--      Comercial e uma "na fila" da Engenharia eram o mesmo evento sem ligação.
--
--   Nada foi aplicado em produção e dev tinha 1 task de teste, então a versão
--   errada é derrubada em vez de receber ALTERs por cima. O preâmbulo abaixo é
--   no-op em qualquer banco que nunca recebeu a versão da manhã.
--
-- O MODELO
--   stage  → a coluna da esteira. 7 etapas de trabalho + 2 terminais.
--            NULL = card avulso (trabalho que não é job de cliente).
--   sector → DERIVADO de stage pelo trigger. Continua existindo porque é ele
--            que alimenta notificação, `current_org_sector()` e o filtro "meu
--            setor" — tudo já construído em 20260806120000_org_foundation.sql.
--   Sem `status`: "fila/andamento/concluída" era escrituração manual que
--   ninguém mantém. Quem tem responsável está em andamento; quem não tem está
--   aguardando; quem tem `blocked_reason` está travado. Sair da etapa É
--   concluir a etapa.
--
--   Movimento LIVRE nos dois sentidos (mapeamento: "Engenharia entrega e passa
--   de volta para Comercial ou para Compras"). Sem máquina de estados — só
--   registro obrigatório, em `task_events`.
--
-- RLS — padrão pós-flip (20260807140000_org_rls_flip.sql):
--   org_id = (SELECT current_org_id()) em tudo, SEMPRE `TO authenticated`
--   (nunca `TO public`/`anon` — lição do rls_flip, que quebrou a página
--   pública de propostas uma vez).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 0. Preâmbulo — derruba a versão da manhã de 12/08/2026, se existir
-- -----------------------------------------------------------------------------
DROP TABLE IF EXISTS public.task_messages   CASCADE;
DROP TABLE IF EXISTS public.task_members    CASCADE;
DROP TABLE IF EXISTS public.task_transitions CASCADE;
DROP TABLE IF EXISTS public.tasks           CASCADE;

DROP FUNCTION IF EXISTS public.tasks_audit_transitions()               CASCADE;
DROP FUNCTION IF EXISTS public.tasks_seed_members()                    CASCADE;
DROP FUNCTION IF EXISTS public.is_task_member(UUID)                    CASCADE;
DROP FUNCTION IF EXISTS public.update_task_last_activity_on_message()  CASCADE;
DROP FUNCTION IF EXISTS public.on_task_sector_changed_notify()         CASCADE;
DROP FUNCTION IF EXISTS public.on_task_assigned_notify()               CASCADE;
DROP FUNCTION IF EXISTS public.on_new_task_message_notify()            CASCADE;

-- -----------------------------------------------------------------------------
-- 1. Vocabulário da esteira — duas funções IMMUTABLE
--
--    Ficam no banco (e não só em TS) porque o trigger de auditoria precisa
--    delas para derivar o setor e a direção do movimento na mesma transação.
--    `src/types/tasks.ts` espelha os mesmos valores para a UI.
--
--    Etapas configuráveis por organização foram consideradas e RECUSADAS: cada
--    etapa tem comportamento amarrado em código (qual módulo ela abre, qual
--    trigger a avança sozinha, qual setor ela notifica). Etapa configurável com
--    comportamento fixo é o pior dos dois mundos. Mudar a lista depois é uma
--    migration de uma linha.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.task_stage_sector(_stage TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE _stage
    WHEN 'solicitacao'       THEN 'comercial'   -- Fase 1: briefing do cliente
    WHEN 'orcamento'         THEN 'engenharia'  -- Fase 2: canvas + BOM
    WHEN 'precificacao'      THEN 'engenharia'  -- Fase 3: margem e imposto
    WHEN 'proposta'          THEN 'comercial'   -- Fases 4-5: envio e aceite
    WHEN 'projeto_executivo' THEN 'engenharia'  -- Fase 5: projeto + orç. implantação
    WHEN 'compras'           THEN 'compras'     -- Fase 6: ordem de compra
    WHEN 'execucao'          THEN 'execucao'    -- Fase 7: obra em campo
    ELSE NULL                                   -- concluido/perdido/avulsa
  END;
$$;

COMMENT ON FUNCTION public.task_stage_sector(TEXT) IS
  'Setor dono de cada etapa da esteira. NULL nas etapas terminais e no card '
  'avulso — nesses casos o setor da task é preservado como estava.';

CREATE OR REPLACE FUNCTION public.task_stage_order(_stage TEXT)
RETURNS INT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE _stage
    WHEN 'solicitacao'       THEN 1
    WHEN 'orcamento'         THEN 2
    WHEN 'precificacao'      THEN 3
    WHEN 'proposta'          THEN 4
    WHEN 'projeto_executivo' THEN 5
    WHEN 'compras'           THEN 6
    WHEN 'execucao'          THEN 7
    ELSE NULL                -- terminais não entram na comparação de direção
  END;
$$;

-- -----------------------------------------------------------------------------
-- 2. tasks
-- -----------------------------------------------------------------------------
CREATE TABLE public.tasks (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id         UUID        NOT NULL REFERENCES public.organizations(id) DEFAULT public.current_org_id(),

  -- Identificação da demanda. `client_name` existe porque a demanda nasce
  -- ANTES do orçamento (Fase 1) e precisa dizer de quem é.
  title          TEXT        NOT NULL CHECK (length(btrim(title)) > 0),
  description    TEXT        NULL,
  client_name    TEXT        NULL,

  -- Posição na esteira.
  stage          TEXT        NULL CHECK (stage IN (
                               'solicitacao', 'orcamento', 'precificacao', 'proposta',
                               'projeto_executivo', 'compras', 'execucao',
                               'concluido', 'perdido')),
  sector         TEXT        NOT NULL CHECK (sector IN ('comercial', 'engenharia', 'compras', 'execucao')),
  position       NUMERIC     NOT NULL DEFAULT 1000,

  -- Estado do card. Sem enum de status: responsável define "em andamento",
  -- blocked_reason define "travada", sair da etapa define "concluída".
  assigned_to    UUID        NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  blocked_reason TEXT        NULL,
  due_date       DATE        NULL,

  -- Elos com o resto da esteira. Ambos NULL no começo e preenchidos quando a
  -- Engenharia cria o orçamento (Fase 2) e quando a obra abre (Fase 7).
  budget_id      UUID        NULL REFERENCES public.budgets(id) ON DELETE SET NULL,
  work_id        UUID        NULL REFERENCES public.works(id)   ON DELETE SET NULL,

  created_by     UUID        NOT NULL REFERENCES auth.users(id) DEFAULT auth.uid(),

  -- Transiente: veículo de uma nota opcional para o UPDATE que move o card. O
  -- trigger de auditoria grava em task_events.note e zera esta coluna na mesma
  -- instrução — nunca carrega estado entre linhas. Devolver um card (mover pra
  -- trás) exige nota, regra aplicada na Server Action.
  transition_note TEXT       NULL,

  last_activity_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.tasks IS
  'Esteira de Trabalho — a demanda do cliente caminhando pelas etapas do '
  'mapeamentooperacional.md §3. Uma task mora em uma etapa (stage) cujo setor '
  'dono é derivado. stage NULL = card avulso, trabalho que não é job de cliente.';

COMMENT ON COLUMN public.tasks.stage IS
  'Coluna da esteira. 7 etapas de trabalho na ordem das Fases 1-7 do '
  'mapeamento, mais concluido/perdido (terminais). NULL = card avulso.';

COMMENT ON COLUMN public.tasks.sector IS
  'Setor responsável — DERIVADO de stage pelo trigger tasks_before_write. '
  'Mantido como coluna própria porque alimenta notificação por setor, o filtro '
  '"meu setor" e os cards avulsos (que têm setor sem ter etapa).';

COMMENT ON COLUMN public.tasks.position IS
  'Ordem dentro da coluna. Numérica com inserção no ponto médio: soltar entre '
  '1000 e 2000 grava 1500, um UPDATE por arrasto em vez da coluna inteira. '
  'rebalance_task_positions() reescreve a coluna quando o intervalo aperta.';

COMMENT ON COLUMN public.tasks.blocked_reason IS
  'Motivo do travamento ("esperando resposta do cliente", "esperando a '
  'concessionária"). É o estado mais comum da operação real e o único que as '
  'pessoas de fato mantêm atualizado. NULL = não travada.';

COMMENT ON COLUMN public.tasks.transition_note IS
  'Campo transiente: nota anexada ao UPDATE que move o card. O trigger '
  'tasks_before_write copia para task_events.note e zera esta coluna na mesma '
  'instrução — nunca é lido fora do trigger.';

-- Query do board: uma coluna da esteira, na ordem de arrasto.
CREATE INDEX idx_tasks_org_stage_position
  ON public.tasks (org_id, stage, position);

-- Query "meu setor" e o board de avulsas.
CREATE INDEX idx_tasks_org_sector_position
  ON public.tasks (org_id, sector, position);

-- Query "minhas", ordenada por prazo.
CREATE INDEX idx_tasks_org_assigned_due
  ON public.tasks (org_id, assigned_to, due_date)
  WHERE assigned_to IS NOT NULL;

-- Linha do tempo de um job (aba Tarefas do workspace de orçamento).
CREATE INDEX idx_tasks_org_budget
  ON public.tasks (org_id, budget_id)
  WHERE budget_id IS NOT NULL;

-- -----------------------------------------------------------------------------
-- 3. task_events — a linha do tempo (append-only)
--
--    Chamava-se `task_transitions` na versão da manhã. Renomeada porque agora
--    guarda mais que transição: bloqueio, prazo, responsável e vínculo com
--    orçamento/obra entram no MESMO fio. É esse fio que a aba "Atividade" do
--    card mistura com as mensagens do chat — na versão anterior o histórico e a
--    conversa eram duas caixas separadas e era impossível saber que uma
--    mensagem veio DEPOIS de um handoff.
-- -----------------------------------------------------------------------------
CREATE TABLE public.task_events (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id     UUID        NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  org_id      UUID        NOT NULL,
  actor_id    UUID        NULL,
  kind        TEXT        NOT NULL CHECK (kind IN (
                            'criada', 'movida', 'atribuida', 'desatribuida',
                            'bloqueada', 'desbloqueada', 'prazo', 'vinculada')),
  from_stage  TEXT        NULL,
  to_stage    TEXT        NULL,
  from_sector TEXT        NULL,
  to_sector   TEXT        NULL,
  -- 'avanco' | 'retorno' | 'encerramento'. Calculada aqui e não na UI porque
  -- é ela que decide a cor do flash do card quando ele pousa (accent no
  -- avanço, âmbar no retorno) e o ícone da linha do tempo.
  direction   TEXT        NULL CHECK (direction IN ('avanco', 'retorno', 'encerramento')),
  note        TEXT        NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.task_events IS
  'Linha do tempo append-only de uma task: movimentos entre etapas, bloqueios, '
  'prazo, responsável e vínculos. Escrita só por trigger — nunca por INSERT de '
  'app. Sem policy de UPDATE/DELETE: histórico é imutável.';

CREATE INDEX idx_task_events_task
  ON public.task_events (task_id, created_at DESC);

-- -----------------------------------------------------------------------------
-- 4. tasks_before_write — deriva, audita e limpa
--
--    BEFORE (não AFTER) de propósito: precisa ESCREVER em NEW (derivar setor,
--    posicionar card novo, zerar transition_note) e gravar o histórico na mesma
--    transação, sem RPC extra e sem depender de quem fez a escrita (UI, script
--    SQL, futura automação do GestãoClick). Roda como invoker (não SECURITY
--    DEFINER): quem tem UPDATE em tasks sempre pode gerar um evento.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tasks_before_write()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_derived_sector TEXT;
  v_from_order     INT;
  v_to_order       INT;
  v_direction      TEXT;
  v_stage_changed  BOOLEAN := FALSE;
BEGIN
  -- ---- INSERT: deriva setor e joga o card no fim da coluna -----------------
  IF TG_OP = 'INSERT' THEN
    v_derived_sector := public.task_stage_sector(NEW.stage);
    IF v_derived_sector IS NOT NULL THEN
      NEW.sector := v_derived_sector;
    END IF;

    -- Fim da fila (FIFO). Escopo por etapa quando há etapa; por setor quando é
    -- card avulso — são boards diferentes e cada um tem sua própria ordem.
    SELECT COALESCE(MAX(t.position), 0) + 1000 INTO NEW.position
    FROM public.tasks t
    WHERE t.org_id = NEW.org_id
      AND (
        (NEW.stage IS NOT NULL AND t.stage = NEW.stage)
        OR (NEW.stage IS NULL AND t.stage IS NULL AND t.sector = NEW.sector)
      );

    NEW.transition_note := NULL;
    RETURN NEW;
  END IF;

  -- ---- UPDATE --------------------------------------------------------------
  IF NEW.stage IS DISTINCT FROM OLD.stage THEN
    v_stage_changed := TRUE;
    v_derived_sector := public.task_stage_sector(NEW.stage);
    IF v_derived_sector IS NOT NULL THEN
      NEW.sector := v_derived_sector;
    END IF;

    -- Handoff limpa o responsável: a pessoa do setor novo ainda não foi
    -- escolhida, e manter o nome antigo faria o card parecer "em andamento"
    -- num setor que nem começou.
    IF NEW.sector IS DISTINCT FROM OLD.sector THEN
      NEW.assigned_to := NULL;
    END IF;

    -- O bloqueio descreve por que ESTA etapa travou ("esperando a carta da
    -- RGE" enquanto a Engenharia orçava). Sair da etapa encerra o motivo — sem
    -- isso um card chegaria em "Concluído" ainda marcado como travado. Limpeza
    -- silenciosa: o evento 'movida' já conta a história, e emitir também um
    -- 'desbloqueada' notificaria os seguidores a cada handoff de card travado.
    NEW.blocked_reason := NULL;

    IF NEW.stage IN ('concluido', 'perdido') THEN
      v_direction := 'encerramento';
    ELSE
      v_from_order := public.task_stage_order(OLD.stage);
      v_to_order   := public.task_stage_order(NEW.stage);
      v_direction  := CASE
        WHEN v_from_order IS NULL OR v_to_order IS NULL THEN 'avanco'
        WHEN v_to_order < v_from_order                  THEN 'retorno'
        ELSE 'avanco'
      END;
    END IF;

    INSERT INTO public.task_events (
      task_id, org_id, actor_id, kind,
      from_stage, to_stage, from_sector, to_sector, direction, note
    ) VALUES (
      NEW.id, NEW.org_id, auth.uid(), 'movida',
      OLD.stage, NEW.stage, OLD.sector, NEW.sector, v_direction, NEW.transition_note
    );

  -- Card avulso trocando de setor sem etapa: também é handoff.
  ELSIF NEW.sector IS DISTINCT FROM OLD.sector THEN
    NEW.assigned_to := NULL;
    INSERT INTO public.task_events (
      task_id, org_id, actor_id, kind, from_sector, to_sector, note
    ) VALUES (
      NEW.id, NEW.org_id, auth.uid(), 'movida', OLD.sector, NEW.sector, NEW.transition_note
    );
  END IF;

  IF NEW.assigned_to IS DISTINCT FROM OLD.assigned_to THEN
    INSERT INTO public.task_events (task_id, org_id, actor_id, kind, note)
    VALUES (
      NEW.id, NEW.org_id, auth.uid(),
      CASE WHEN NEW.assigned_to IS NULL THEN 'desatribuida' ELSE 'atribuida' END,
      NEW.assigned_to::text
    );
  END IF;

  IF NEW.blocked_reason IS DISTINCT FROM OLD.blocked_reason AND NOT v_stage_changed THEN
    INSERT INTO public.task_events (task_id, org_id, actor_id, kind, note)
    VALUES (
      NEW.id, NEW.org_id, auth.uid(),
      CASE WHEN NEW.blocked_reason IS NULL THEN 'desbloqueada' ELSE 'bloqueada' END,
      NEW.blocked_reason
    );
  END IF;

  IF NEW.due_date IS DISTINCT FROM OLD.due_date THEN
    INSERT INTO public.task_events (task_id, org_id, actor_id, kind, note)
    VALUES (NEW.id, NEW.org_id, auth.uid(), 'prazo', NEW.due_date::text);
  END IF;

  IF NEW.budget_id IS DISTINCT FROM OLD.budget_id AND NEW.budget_id IS NOT NULL THEN
    INSERT INTO public.task_events (task_id, org_id, actor_id, kind, note)
    VALUES (NEW.id, NEW.org_id, auth.uid(), 'vinculada', 'budget:' || NEW.budget_id::text);
  END IF;

  IF NEW.work_id IS DISTINCT FROM OLD.work_id AND NEW.work_id IS NOT NULL THEN
    INSERT INTO public.task_events (task_id, org_id, actor_id, kind, note)
    VALUES (NEW.id, NEW.org_id, auth.uid(), 'vinculada', 'work:' || NEW.work_id::text);
  END IF;

  NEW.transition_note  := NULL;
  NEW.updated_at       := now();
  NEW.last_activity_at := now();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tasks_before_insert ON public.tasks;
CREATE TRIGGER trg_tasks_before_insert
  BEFORE INSERT ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.tasks_before_write();

DROP TRIGGER IF EXISTS trg_tasks_before_update ON public.tasks;
CREATE TRIGGER trg_tasks_before_update
  BEFORE UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.tasks_before_write();

-- Evento 'criada' precisa ser AFTER: a FK de task_events aponta para uma linha
-- que ainda não existe durante o BEFORE INSERT.
CREATE OR REPLACE FUNCTION public.tasks_after_insert_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.task_events (
    task_id, org_id, actor_id, kind, to_stage, to_sector
  ) VALUES (
    NEW.id, NEW.org_id, NEW.created_by, 'criada', NEW.stage, NEW.sector
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tasks_after_insert_event ON public.tasks;
CREATE TRIGGER trg_tasks_after_insert_event
  AFTER INSERT ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.tasks_after_insert_event();

-- -----------------------------------------------------------------------------
-- 5. rebalance_task_positions — reescreve a ordem de uma coluna
--
--    A inserção no ponto médio divide o intervalo pela metade a cada arrasto
--    para a mesma posição. Depois de ~50 arrastos seguidos entre os mesmos dois
--    vizinhos, o intervalo chega ao limite do NUMERIC útil. A Server Action
--    chama esta função quando detecta gap < 0.0001. Acontece raramente e é
--    barato numa coluna de dezenas de cards.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rebalance_task_positions(_stage TEXT, _sector TEXT DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  WITH ordenado AS (
    SELECT t.id, row_number() OVER (ORDER BY t.position, t.created_at) * 1000 AS nova
    FROM public.tasks t
    WHERE t.org_id = (SELECT public.current_org_id())
      AND (
        (_stage IS NOT NULL AND t.stage = _stage)
        OR (_stage IS NULL AND t.stage IS NULL AND t.sector = _sector)
      )
  )
  UPDATE public.tasks t
     SET position = o.nova
    FROM ordenado o
   WHERE t.id = o.id
     AND t.position IS DISTINCT FROM o.nova;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.rebalance_task_positions(TEXT, TEXT) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.rebalance_task_positions(TEXT, TEXT) TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 6. RLS — tasks
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
    -- Guarda de integridade: orçamento e obra vinculados têm de ser da mesma
    -- org (mesmo padrão de proposals_insert). NULL passa — é o caso normal na
    -- Fase 1, quando o orçamento ainda não existe.
    AND (
      budget_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.budgets b
        WHERE b.id = tasks.budget_id AND b.org_id = (SELECT public.current_org_id())
      )
    )
    AND (
      work_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.works w
        WHERE w.id = tasks.work_id AND w.org_id = (SELECT public.current_org_id())
      )
    )
  );

-- UPDATE sem checar autor: colega edita card de colega, que é o objetivo de
-- toda a camada de org (commits bc366c1 e 037996c).
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
-- 7. RLS — task_events (transparente pra org, escrita só por trigger)
-- -----------------------------------------------------------------------------
ALTER TABLE public.task_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "task_events_select" ON public.task_events;
CREATE POLICY "task_events_select" ON public.task_events
  FOR SELECT
  TO authenticated
  USING (org_id = (SELECT public.current_org_id()));

-- INSERT liberado para quem já consegue escrever em tasks: o trigger insere na
-- mesma transação, como o próprio invoker. Sem UPDATE/DELETE — imutável.
DROP POLICY IF EXISTS "task_events_insert" ON public.task_events;
CREATE POLICY "task_events_insert" ON public.task_events
  FOR INSERT
  TO authenticated
  WITH CHECK (org_id = (SELECT public.current_org_id()));

-- -----------------------------------------------------------------------------
-- 8. Realtime — o board assina `tasks` filtrando por org_id.
--
--    REPLICA IDENTITY FULL: sem isso o payload de UPDATE traz só a PK no
--    `old`, e o board não consegue saber DE QUAL coluna o card saiu para
--    animar a saída. Com poucos milhares de linhas, o custo de WAL é
--    irrelevante perto de acertar a animação.
-- -----------------------------------------------------------------------------
ALTER TABLE public.tasks REPLICA IDENTITY FULL;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.tasks;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
