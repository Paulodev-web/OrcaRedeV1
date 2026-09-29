-- ============================================================================
-- O engenheiro da obra passa a poder editar o portal do cliente dela.
--
-- A RLS de `work_trackings` nasceu no Portal do Engenheiro, onde o dono era
-- quem tinha criado o orçamento: todas as policies dizem
-- `budgets.user_id = auth.uid()`. Isso bastava enquanto o portal era ilha.
--
-- Não basta mais. No Andamento de Obra a autoridade é `work_members`, e os
-- dois podem divergir de forma banal: a aba Responsável reatribui a obra a
-- outro engenheiro, e a partir daí o responsável de verdade não é mais o dono
-- do orçamento. Ele veria o portal do próprio cliente e não conseguiria mexer.
--
-- Policy somada, não trocada: o caminho antigo continua de pé para o
-- acompanhamento legado, que não tem obra por trás e segue pertencendo a quem
-- criou o orçamento.
-- ============================================================================

DROP POLICY IF EXISTS work_trackings_update_work_engineer ON public.work_trackings;
CREATE POLICY work_trackings_update_work_engineer
  ON public.work_trackings
  FOR UPDATE
  USING (
    work_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.work_members wm
       WHERE wm.work_id = work_trackings.work_id
         AND wm.user_id = auth.uid()
         AND wm.role = 'engineer'
    )
  )
  WITH CHECK (
    work_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.work_members wm
       WHERE wm.work_id = work_trackings.work_id
         AND wm.user_id = auth.uid()
         AND wm.role = 'engineer'
    )
  );

-- O SELECT tem o mesmo problema pelo mesmo motivo: engenheiro reatribuído não
-- enxergaria a linha para depois atualizá-la.
DROP POLICY IF EXISTS work_trackings_select_work_engineer ON public.work_trackings;
CREATE POLICY work_trackings_select_work_engineer
  ON public.work_trackings
  FOR SELECT
  USING (
    work_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.work_members wm
       WHERE wm.work_id = work_trackings.work_id
         AND wm.user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- As colunas que o espelho é dono, e que a tela não deve deixar ninguém editar
--
-- A policy acima libera a linha inteira, e a linha tem dentro dela tanto o que
-- o engenheiro escreve (descrição, foco, galeria) quanto o que a obra deriva
-- (postes, progresso, timeline). Editar os derivados na mão faria o portal
-- mentir até a próxima sincronia desfazer.
--
-- A trava fica aqui embaixo, e não só na aplicação, porque a aplicação pode
-- ganhar outro caminho amanhã.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.work_trackings_protect_derived()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'auth'
AS $function$
BEGIN
  -- Só vale para espelho.
  IF OLD.work_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- **A própria sincronia precisa passar.** `sync_work_client_timeline`,
  -- `refresh_work_tracking_progress` e `ensure_work_tracking` existem
  -- justamente para escrever estas colunas, e as três são SECURITY DEFINER de
  -- `postgres`. Conferir `auth.uid()` aqui não distinguiria nada: dentro de
  -- SECURITY DEFINER ele continua sendo o do usuário logado, então aprovar um
  -- marco dispararia a sincronia e a sincronia bateria nesta trava. Quem
  -- separa os dois mundos é `current_user`: vira `postgres` dentro delas e
  -- continua `authenticated` numa escrita que vem direto do PostgREST.
  IF current_user <> 'authenticated' THEN
    RETURN NEW;
  END IF;

  -- Dono do orçamento mantém o alcance que sempre teve: ele é quem conserta
  -- acompanhamento na mão quando algo sai do lugar.
  IF EXISTS (SELECT 1 FROM budgets b WHERE b.id = NEW.budget_id AND b.user_id = auth.uid()) THEN
    RETURN NEW;
  END IF;

  IF NEW.work_id            IS DISTINCT FROM OLD.work_id
     OR NEW.budget_id       IS DISTINCT FROM OLD.budget_id
     OR NEW.public_id       IS DISTINCT FROM OLD.public_id
     OR NEW.poles_installed IS DISTINCT FROM OLD.poles_installed
     OR NEW.planned_poles   IS DISTINCT FROM OLD.planned_poles
     OR NEW.progress_percentage  IS DISTINCT FROM OLD.progress_percentage
     OR NEW.timeline_milestones  IS DISTINCT FROM OLD.timeline_milestones
  THEN
    RAISE EXCEPTION 'Estes campos do portal sao derivados da obra e nao se editam aqui';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_work_trackings_protect_derived ON public.work_trackings;
CREATE TRIGGER trg_work_trackings_protect_derived
  BEFORE UPDATE ON public.work_trackings
  FOR EACH ROW
  EXECUTE FUNCTION public.work_trackings_protect_derived();
