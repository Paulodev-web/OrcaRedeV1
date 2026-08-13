-- =============================================================================
-- CONSERTO DE PERFORMANCE — RLS não otimizada em budget_posts/post_item_groups/
-- post_materials, causa raiz da lentidão em produção investigada em 12/08/2026.
--
-- O QUE FOI MEDIDO (pg_stat_statements + pg_stat_user_tables, prod)
--   As queries que carregam o canvas de um orçamento (embed budget_posts →
--   post_types, post_item_groups → materials) estavam levando 200ms–1,4s por
--   chamada. `post_item_groups` sofreu 346.247 scans sequenciais na tabela
--   inteira (17.804 linhas), lendo 5,5 BILHÕES de linhas no total. Mesmo
--   quadro em `post_materials`.
--
-- CAUSA — dois problemas empilhados, nenhum deles introduzido pela camada de
--   organização (essas três tabelas são FILHAS de budgets, verificadas em
--   cascata; o `org_rls_flip` de 07/08/2026 cobriu as 33 tabelas-RAIZ com
--   org_id próprio e deixou estas de fora, de propósito):
--
--   1. SEM ÍNDICE: `post_item_groups.budget_post_id` e `post_materials.post_id`
--      não tinham índice nenhum (só PK e colunas não relacionadas). Qualquer
--      filtro ou join por essas colunas — inclusive o EXISTS da política de
--      RLS — force um seq scan da tabela inteira.
--
--   2. `auth.uid()` SEM `(select ...)`: as policies chamam `auth.uid()` cru
--      dentro do EXISTS. Sem o wrapper, o planner do Postgres não consegue
--      hospedar a chamada como InitPlan (uma vez por query) e a reavalia por
--      linha — o antipadrão que o linter do Supabase marca como
--      `auth_rls_initplan`. Ver:
--      https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select
--
-- POR QUE SÓ APARECEU AGORA
--   Preview aponta para o projeto Supabase de DEV (poucas dezenas de linhas
--   de teste) — a mesma query cega roda em milissegundos ali. Produção tem os
--   dados reais da operação (17.804 post_item_groups). O bug sempre esteve no
--   código; só ficou doloroso no volume de produção.
--
-- ESCOPO DESTA MIGRATION
--   Restrito às 3 tabelas comprovadamente quentes no pg_stat_statements, mais
--   as 5 policies do módulo Tarefas que nasceram HOJE com o mesmo defeito
--   (baixo risco agora — poucas linhas — mas mesma bomba-relógio conforme a
--   esteira cresce). NÃO mexe nas outras ~145 ocorrências de
--   `auth_rls_initplan` do advisor: são pré-existentes, não comprovadamente
--   quentes, e uma varredura completa do schema merece revisão própria, não
--   uma correção de emergência.
--
--   Nenhuma regra de acesso muda — `(select auth.uid())` é semanticamente
--   idêntico a `auth.uid()`, só muda COMO o planner avalia a chamada.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Índices que faltavam — a metade do problema que por si só já explica os
--    scans sequenciais.
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_post_item_groups_budget_post_id
  ON public.post_item_groups (budget_post_id);

CREATE INDEX IF NOT EXISTS idx_post_materials_post_id
  ON public.post_materials (post_id);

-- -----------------------------------------------------------------------------
-- 2. budget_posts — mesma lógica, `auth.uid()` agora hospedado.
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can only see posts from their own budgets" ON public.budget_posts;
CREATE POLICY "Users can only see posts from their own budgets" ON public.budget_posts
  FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.budgets
    WHERE budgets.id = budget_posts.budget_id
      AND budgets.user_id = (select auth.uid())
  ));

DROP POLICY IF EXISTS "Users can only insert posts in their own budgets" ON public.budget_posts;
CREATE POLICY "Users can only insert posts in their own budgets" ON public.budget_posts
  FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.budgets
    WHERE budgets.id = budget_posts.budget_id
      AND budgets.user_id = (select auth.uid())
  ));

DROP POLICY IF EXISTS "Users can only update posts in their own budgets" ON public.budget_posts;
CREATE POLICY "Users can only update posts in their own budgets" ON public.budget_posts
  FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.budgets
    WHERE budgets.id = budget_posts.budget_id
      AND budgets.user_id = (select auth.uid())
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.budgets
    WHERE budgets.id = budget_posts.budget_id
      AND budgets.user_id = (select auth.uid())
  ));

DROP POLICY IF EXISTS "Users can only delete posts from their own budgets" ON public.budget_posts;
CREATE POLICY "Users can only delete posts from their own budgets" ON public.budget_posts
  FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM public.budgets
    WHERE budgets.id = budget_posts.budget_id
      AND budgets.user_id = (select auth.uid())
  ));

-- -----------------------------------------------------------------------------
-- 3. post_item_groups
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can only see groups from their own posts" ON public.post_item_groups;
CREATE POLICY "Users can only see groups from their own posts" ON public.post_item_groups
  FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.budget_posts
    JOIN public.budgets ON budgets.id = budget_posts.budget_id
    WHERE budget_posts.id = post_item_groups.budget_post_id
      AND budgets.user_id = (select auth.uid())
  ));

DROP POLICY IF EXISTS "Users can only insert groups in their own posts" ON public.post_item_groups;
CREATE POLICY "Users can only insert groups in their own posts" ON public.post_item_groups
  FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.budget_posts
    JOIN public.budgets ON budgets.id = budget_posts.budget_id
    WHERE budget_posts.id = post_item_groups.budget_post_id
      AND budgets.user_id = (select auth.uid())
  ));

DROP POLICY IF EXISTS "Users can only update groups in their own posts" ON public.post_item_groups;
CREATE POLICY "Users can only update groups in their own posts" ON public.post_item_groups
  FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.budget_posts
    JOIN public.budgets ON budgets.id = budget_posts.budget_id
    WHERE budget_posts.id = post_item_groups.budget_post_id
      AND budgets.user_id = (select auth.uid())
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.budget_posts
    JOIN public.budgets ON budgets.id = budget_posts.budget_id
    WHERE budget_posts.id = post_item_groups.budget_post_id
      AND budgets.user_id = (select auth.uid())
  ));

DROP POLICY IF EXISTS "Users can only delete groups from their own posts" ON public.post_item_groups;
CREATE POLICY "Users can only delete groups from their own posts" ON public.post_item_groups
  FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM public.budget_posts
    JOIN public.budgets ON budgets.id = budget_posts.budget_id
    WHERE budget_posts.id = post_item_groups.budget_post_id
      AND budgets.user_id = (select auth.uid())
  ));

-- -----------------------------------------------------------------------------
-- 4. post_materials
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can only see loose materials from their own posts" ON public.post_materials;
CREATE POLICY "Users can only see loose materials from their own posts" ON public.post_materials
  FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.budget_posts
    JOIN public.budgets ON budgets.id = budget_posts.budget_id
    WHERE budget_posts.id = post_materials.post_id
      AND budgets.user_id = (select auth.uid())
  ));

DROP POLICY IF EXISTS "Users can only insert loose materials in their own posts" ON public.post_materials;
CREATE POLICY "Users can only insert loose materials in their own posts" ON public.post_materials
  FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.budget_posts
    JOIN public.budgets ON budgets.id = budget_posts.budget_id
    WHERE budget_posts.id = post_materials.post_id
      AND budgets.user_id = (select auth.uid())
  ));

DROP POLICY IF EXISTS "Users can only update loose materials in their own posts" ON public.post_materials;
CREATE POLICY "Users can only update loose materials in their own posts" ON public.post_materials
  FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.budget_posts
    JOIN public.budgets ON budgets.id = budget_posts.budget_id
    WHERE budget_posts.id = post_materials.post_id
      AND budgets.user_id = (select auth.uid())
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.budget_posts
    JOIN public.budgets ON budgets.id = budget_posts.budget_id
    WHERE budget_posts.id = post_materials.post_id
      AND budgets.user_id = (select auth.uid())
  ));

DROP POLICY IF EXISTS "Users can only delete loose materials from their own posts" ON public.post_materials;
CREATE POLICY "Users can only delete loose materials from their own posts" ON public.post_materials
  FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM public.budget_posts
    JOIN public.budgets ON budgets.id = budget_posts.budget_id
    WHERE budget_posts.id = post_materials.post_id
      AND budgets.user_id = (select auth.uid())
  ));

-- -----------------------------------------------------------------------------
-- 5. Módulo Tarefas — mesmo defeito, introduzido hoje (20260812120000/121000/
--    122000_tarefas_*.sql). Baixo risco agora (poucas linhas), mas o mesmo
--    antipadrão vai doer do mesmo jeito conforme a esteira cresce.
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "tasks_insert" ON public.tasks;
CREATE POLICY "tasks_insert" ON public.tasks
  FOR INSERT
  TO authenticated
  WITH CHECK (
    org_id = (SELECT public.current_org_id())
    AND (select auth.uid()) = created_by
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

DROP POLICY IF EXISTS "task_followers_delete" ON public.task_followers;
CREATE POLICY "task_followers_delete" ON public.task_followers
  FOR DELETE
  TO authenticated
  USING (org_id = (SELECT public.current_org_id()) AND user_id = (select auth.uid()));

DROP POLICY IF EXISTS "task_messages_insert" ON public.task_messages;
CREATE POLICY "task_messages_insert" ON public.task_messages
  FOR INSERT
  TO authenticated
  WITH CHECK (
    org_id = (SELECT public.current_org_id())
    AND (select auth.uid()) = sender_id
    AND EXISTS (
      SELECT 1 FROM public.tasks t
      WHERE t.id = task_messages.task_id
        AND t.org_id = (SELECT public.current_org_id())
    )
  );

DROP POLICY IF EXISTS "task_attachments_insert" ON public.task_attachments;
CREATE POLICY "task_attachments_insert" ON public.task_attachments
  FOR INSERT
  TO authenticated
  WITH CHECK (
    org_id = (SELECT public.current_org_id())
    AND (select auth.uid()) = uploaded_by
    AND EXISTS (
      SELECT 1 FROM public.tasks t
      WHERE t.id = task_attachments.task_id
        AND t.org_id = (SELECT public.current_org_id())
    )
  );

DROP POLICY IF EXISTS "task_attachments_delete" ON public.task_attachments;
CREATE POLICY "task_attachments_delete" ON public.task_attachments
  FOR DELETE
  TO authenticated
  USING (
    org_id = (SELECT public.current_org_id())
    AND uploaded_by = (select auth.uid())
  );
