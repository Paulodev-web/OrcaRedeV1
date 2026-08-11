-- =============================================================================
-- FLIP DO RLS — Fase 3 de 3
--
-- PROPÓSITO
--   Esta é a migration que efetivamente muda o comportamento do sistema. As
--   Fases 1 e 2 foram preparação: criaram a organização e deram `org_id` a cada
--   linha, sem alterar quem vê o quê. Aqui a fronteira de acesso deixa de ser a
--   PESSOA e passa a ser a ORGANIZAÇÃO.
--
--     antes:  auth.uid() = user_id
--     depois: org_id = (SELECT public.current_org_id())
--
--   É a partir daqui que o Comercial lê um orçamento da Engenharia, e que a
--   duplicação física de linhas (20260624000000_duplicate_luan_to_paulo) deixa
--   de ser necessária.
--
-- ⚠ ESTA MIGRATION É A DE RISCO REAL DO PROJETO.
--   Aplicar somente com as Fases 1 e 2 já validadas. A seção 1 aborta se o
--   pré-requisito não estiver satisfeito.
--
-- -----------------------------------------------------------------------------
-- POR QUE `(SELECT public.current_org_id())` E NÃO `public.current_org_id()`
--
--   Com o SELECT explícito, o planner trata a chamada como InitPlan: avalia UMA
--   vez por statement. Sem ele, a função é chamada UMA VEZ POR LINHA. Em
--   `materials` (2.443 linhas na ON) isso é a diferença entre uma chamada e duas
--   mil e quatrocentas. O parêntese não é estilo — é o plano de execução.
--
-- -----------------------------------------------------------------------------
-- O DESENHO DAS POLICIES
--
--   SELECT / DELETE   → org_id = org ativa
--   UPDATE            → org_id = org ativa, no USING e no WITH CHECK
--   INSERT            → org_id = org ativa  E  auth.uid() = <coluna de autoria>
--
--   A assimetria do INSERT é deliberada: **o dado é da organização, mas quem
--   cria assina**. Manter `auth.uid() = user_id` no WITH CHECK preserva a
--   autoria honesta (ninguém cria uma linha em nome de outro) sem restringir a
--   leitura ou a edição, que é o que precisávamos abrir.
--
--   No UPDATE o `auth.uid() = user_id` é REMOVIDO de propósito: se ele
--   permanecesse, um colega continuaria sem poder editar o orçamento do outro —
--   exatamente o problema que este projeto existe para resolver.
--
--   O WITH CHECK do UPDATE com `org_id = org ativa` também impede MOVER uma
--   linha para outra organização: o valor novo tem de continuar sendo a org
--   ativa.
--
-- -----------------------------------------------------------------------------
-- O QUE NÃO É TOCADO AQUI, E POR QUÊ
--
--   a) DADO PESSOAL — `device_tokens`, `user_module_seen`, `notifications`
--      continuam `auth.uid() = user_id`. Não ganharam `org_id` na Fase 2 e não
--      podem ganhar policy de org: token de push e notificação têm dono, não
--      empresa. Ver o cabeçalho de 20260807120000.
--
--   b) POLICIES `anon` DAS PROPOSTAS PÚBLICAS — `proposals_public_select`,
--      `company_settings_public_select`, `technical_responsibles_public_select`.
--      Comparam `share_token` e são ortogonais à organização: o cliente que abre
--      o link não é membro de org nenhuma. Mexer nelas quebraria o link público.
--
--   c) TABELAS-FILHAS que herdam por `EXISTS` no pai (`quotation_session_notes`,
--      as 8 filhas de `proposals`, e todo o módulo de andamento de obra que
--      passa por `is_work_member`). Elas acompanham sozinhas assim que o pai
--      passa a comparar `org_id` — não têm coluna própria e não precisam.
--
-- -----------------------------------------------------------------------------
-- ⚠ POR QUE TODA POLICY ORG-SCOPED É CRIADA `TO authenticated`, NUNCA `TO public`
--
--   Quase todas as policies originais eram `TO public` — e `public` no Postgres
--   significa TODOS os roles, `anon` inclusive. Enquanto a regra era
--   `auth.uid() = user_id`, isso era inofensivo: para o visitante anônimo
--   `auth.uid()` é NULL, a comparação dá falso e a linha simplesmente não
--   aparece.
--
--   Depois do flip a regra passa a chamar `public.current_org_id()`, cujo
--   EXECUTE foi revogado de `anon` na Fase 1. O resultado não é "falso" — é
--   **erro**: `permission denied for function current_org_id`. E como a policy
--   `TO public` é avaliada junto com a policy `TO anon` da mesma tabela, a
--   consulta inteira aborta.
--
--   Consequência prática, confirmada em teste: `technical_responsibles` e
--   `company_settings` têm uma policy `anon` e uma `public` cada. Sem esta
--   correção, **a página pública da proposta quebra para o cliente** — que é o
--   dano mais visível que este projeto poderia causar.
--
--   Restringir a `authenticated` é também a leitura semântica correta: "membro
--   da organização vê o dado" não é uma afirmação que faça sentido avaliar para
--   quem não fez login.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Pré-requisito — a Fase 2 precisa estar completa
-- -----------------------------------------------------------------------------
DO $do$
DECLARE v_n INT;
BEGIN
  SELECT count(*) INTO v_n
  FROM information_schema.columns
  WHERE table_schema='public' AND column_name='org_id' AND is_nullable='NO'
    AND table_name <> 'org_members';

  IF v_n < 33 THEN
    RAISE EXCEPTION 'Fase 2 incompleta: % tabelas com org_id NOT NULL (esperado 33). Aplique 20260807120000 antes.', v_n;
  END IF;
END $do$;

-- -----------------------------------------------------------------------------
-- 2. Troca mecânica das policies de dono puro
--
--    Percorre as policies cuja expressão é EXATAMENTE `auth.uid() = <dono>` (ou
--    a ordem inversa, que também existe no schema) e as recria comparando
--    `org_id`. Preserva nome, comando e roles de cada uma — nada é inventado,
--    nada é perdido.
--
--    A âncora `^...$` do regex é o que torna isto seguro: só casa a expressão
--    INTEIRA. Uma policy que contenha o padrão dentro de um EXISTS maior (como
--    `b.user_id = auth.uid()` aninhado) não casa e cai no tratamento manual da
--    seção 3 — é justamente o que queremos, porque nelas a troca não é mecânica.
--
--    ⚠ A âncora sozinha NÃO BASTA, e isto quase passou despercebido:
--    `proposals_update` e `saved_pricing_budgets_update` têm o USING de dono
--    puro (casa na âncora) mas o WITH CHECK COMPOSTO, com um EXISTS que valida o
--    orçamento pai. Tratadas mecanicamente, o WITH CHECK seria substituído por
--    `org_id = ...` e a guarda de integridade **desapareceria em silêncio**.
--    Por isso o filtro exclui qualquer policy que mencione EXISTS em qualquer
--    das duas expressões; elas vão para a seção 3.1.
--
--    Note que a verificação da seção 4 NÃO aplica essa exclusão — de propósito.
--    Assim, se uma policy com EXISTS ficasse sem tratamento manual, ela seria
--    detectada lá e a migration abortaria em vez de degradar a segurança.
-- -----------------------------------------------------------------------------
DO $do$
DECLARE
  r        RECORD;
  v_dono   TEXT;
  v_roles  TEXT;
  v_org    CONSTANT TEXT := 'org_id = (SELECT public.current_org_id())';
  v_total  INT := 0;
BEGIN
  FOR r IN
    SELECT pol.tablename, pol.policyname, pol.cmd,
           COALESCE(pol.qual, '')       AS q,
           COALESCE(pol.with_check, '') AS w
    FROM pg_policies pol
    WHERE pol.schemaname = 'public'
      AND pol.tablename IN (
        SELECT table_name FROM information_schema.columns
        WHERE table_schema='public' AND column_name='org_id' AND table_name <> 'org_members'
      )
      AND pol.roles::text NOT LIKE '%anon%'
      -- Qualquer EXISTS = guarda de integridade que não pode ser reescrita
      -- mecanicamente. Vai para a seção 3.1.
      AND (COALESCE(pol.qual,'') || COALESCE(pol.with_check,'')) !~* 'EXISTS'
      AND (
           COALESCE(pol.qual,'')       ~ '^\(auth\.uid\(\) = (user_id|owner_id|engineer_id)\)$'
        OR COALESCE(pol.with_check,'') ~ '^\(auth\.uid\(\) = (user_id|owner_id|engineer_id)\)$'
        OR COALESCE(pol.qual,'')       ~ '^\((user_id|owner_id|engineer_id) = auth\.uid\(\)\)$'
        OR COALESCE(pol.with_check,'') ~ '^\((user_id|owner_id|engineer_id) = auth\.uid\(\)\)$'
      )
    ORDER BY pol.tablename, pol.policyname
  LOOP
    v_dono := substring(r.q || r.w from '(user_id|owner_id|engineer_id)');

    -- Sempre `authenticated`, nunca o role original: ver o bloco sobre `anon`
    -- no cabeçalho. As policies `TO anon` já foram excluídas pelo filtro acima.
    v_roles := 'authenticated';

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);

    IF r.cmd = 'SELECT' OR r.cmd = 'DELETE' THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR %s TO %s USING (%s)',
        r.policyname, r.tablename, r.cmd, v_roles, v_org
      );

    ELSIF r.cmd = 'INSERT' THEN
      -- O dado é da org, mas quem cria assina.
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR INSERT TO %s WITH CHECK (%s AND auth.uid() = %I)',
        r.policyname, r.tablename, v_roles, v_org, v_dono
      );

    ELSIF r.cmd = 'UPDATE' THEN
      -- Sem `auth.uid() = dono`: é o que libera o colega a editar.
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR UPDATE TO %s USING (%s) WITH CHECK (%s)',
        r.policyname, r.tablename, v_roles, v_org, v_org
      );

    ELSIF r.cmd = 'ALL' THEN
      -- FOR ALL (materials, post_types, utility_companies, item_group_templates,
      -- finalized_budgets) usa um único WITH CHECK para INSERT **e** UPDATE.
      -- Não dá para exigir autoria só no INSERT sem travar o UPDATE no dono —
      -- que é exatamente o que precisamos destravar. Aqui a abertura vence:
      -- fica só `org_id`. Quem quiser autoria estrita nessas tabelas precisa
      -- primeiro separar a policy FOR ALL em quatro por comando.
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR ALL TO %s USING (%s) WITH CHECK (%s)',
        r.policyname, r.tablename, v_roles, v_org, v_org
      );

    ELSE
      RAISE EXCEPTION 'Comando de policy inesperado: %.% (%)', r.tablename, r.policyname, r.cmd;
    END IF;

    v_total := v_total + 1;
  END LOOP;

  RAISE NOTICE 'Policies convertidas mecanicamente: %', v_total;
END $do$;

-- -----------------------------------------------------------------------------
-- 3. As que exigem tratamento manual
-- -----------------------------------------------------------------------------

-- 3.1 — INSERTs com guarda de integridade referencial
--
--   O EXISTS destas policies nunca foi herança de fronteira: é a trava que
--   impede vincular um filho ao pai de OUTRO dono. Depois do flip ele fica
--   ainda mais necessário — sem ele seria possível pendurar uma proposta num
--   orçamento de outra organização. A guarda passa a comparar `org_id` do pai.

DROP POLICY IF EXISTS "proposals_insert" ON public.proposals;
CREATE POLICY "proposals_insert" ON public.proposals
  FOR INSERT TO authenticated
  WITH CHECK (
    org_id = (SELECT public.current_org_id())
    AND auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.budgets b
      WHERE b.id = proposals.budget_id
        AND b.org_id = (SELECT public.current_org_id())
    )
  );

DROP POLICY IF EXISTS "saved_pricing_budgets_insert" ON public.saved_pricing_budgets;
CREATE POLICY "saved_pricing_budgets_insert" ON public.saved_pricing_budgets
  FOR INSERT TO authenticated
  WITH CHECK (
    org_id = (SELECT public.current_org_id())
    AND auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.budgets b
      WHERE b.id = saved_pricing_budgets.budget_id
        AND b.org_id = (SELECT public.current_org_id())
    )
  );

-- Os dois UPDATEs cujo WITH CHECK carrega a mesma guarda. Sem este bloco, a
-- seção 2 os reescreveria e a validação do orçamento pai sumiria: passaria a ser
-- possível reapontar uma proposta publicada para o orçamento de outra org.
DROP POLICY IF EXISTS "proposals_update" ON public.proposals;
CREATE POLICY "proposals_update" ON public.proposals
  FOR UPDATE TO authenticated
  USING (org_id = (SELECT public.current_org_id()))
  WITH CHECK (
    org_id = (SELECT public.current_org_id())
    AND EXISTS (
      SELECT 1 FROM public.budgets b
      WHERE b.id = proposals.budget_id
        AND b.org_id = (SELECT public.current_org_id())
    )
  );

DROP POLICY IF EXISTS "saved_pricing_budgets_update" ON public.saved_pricing_budgets;
CREATE POLICY "saved_pricing_budgets_update" ON public.saved_pricing_budgets
  FOR UPDATE TO authenticated
  USING (org_id = (SELECT public.current_org_id()))
  WITH CHECK (
    org_id = (SELECT public.current_org_id())
    AND EXISTS (
      SELECT 1 FROM public.budgets b
      WHERE b.id = saved_pricing_budgets.budget_id
        AND b.org_id = (SELECT public.current_org_id())
    )
  );

DROP POLICY IF EXISTS "extraction_jobs_insert" ON public.extraction_jobs;
CREATE POLICY "extraction_jobs_insert" ON public.extraction_jobs
  FOR INSERT TO authenticated
  WITH CHECK (
    org_id = (SELECT public.current_org_id())
    AND auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.quotation_sessions qs
      WHERE qs.id = extraction_jobs.session_id
        AND qs.org_id = (SELECT public.current_org_id())
    )
  );

DROP POLICY IF EXISTS "proposal_template_resp_items_insert" ON public.proposal_template_responsibility_items;
CREATE POLICY "proposal_template_resp_items_insert" ON public.proposal_template_responsibility_items
  FOR INSERT TO authenticated
  WITH CHECK (
    org_id = (SELECT public.current_org_id())
    AND auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.proposal_templates t
      WHERE t.id = proposal_template_responsibility_items.template_id
        AND t.org_id = (SELECT public.current_org_id())
    )
  );

DROP POLICY IF EXISTS "media_library_tags_insert" ON public.media_library_tags;
CREATE POLICY "media_library_tags_insert" ON public.media_library_tags
  FOR INSERT TO authenticated
  WITH CHECK (
    org_id = (SELECT public.current_org_id())
    AND auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.media_library m
      WHERE m.id = media_library_tags.media_id
        AND m.org_id = (SELECT public.current_org_id())
    )
    AND EXISTS (
      SELECT 1 FROM public.media_tags t
      WHERE t.id = media_library_tags.tag_id
        AND t.org_id = (SELECT public.current_org_id())
    )
  );

-- 3.2 — module_permissions: sai `is_profile_creator`, entra `is_org_admin`
--
--   Esta troca conserta um buraco que o plano já apontava. `is_profile_creator`
--   ancorava a administração das permissões em QUEM CRIOU O PERFIL: se essa
--   pessoa saísse da empresa, ninguém mais conseguiria administrar as permissões
--   dos demais, e não havia caminho de recuperação pela interface.
--
--   Com `is_org_admin`, a autoridade passa a ser um CARGO dentro da organização,
--   que pode ser transferido — e o trigger de proteção do último owner (Fase 1)
--   garante que ele nunca fica vago.
--
--   `granted_by = auth.uid()` é preservado: registra quem concedeu.

DROP POLICY IF EXISTS "module_permissions_select" ON public.module_permissions;
CREATE POLICY "module_permissions_select" ON public.module_permissions
  FOR SELECT TO authenticated
  USING (
    auth.uid() = user_id
    OR (org_id = (SELECT public.current_org_id()) AND public.is_org_admin(org_id))
  );

DROP POLICY IF EXISTS "module_permissions_insert" ON public.module_permissions;
CREATE POLICY "module_permissions_insert" ON public.module_permissions
  FOR INSERT TO authenticated
  WITH CHECK (
    org_id = (SELECT public.current_org_id())
    AND public.is_org_admin(org_id)
    AND granted_by = auth.uid()
  );

DROP POLICY IF EXISTS "module_permissions_update" ON public.module_permissions;
CREATE POLICY "module_permissions_update" ON public.module_permissions
  FOR UPDATE TO authenticated
  USING (
    org_id = (SELECT public.current_org_id())
    AND public.is_org_admin(org_id)
  )
  WITH CHECK (
    org_id = (SELECT public.current_org_id())
    AND public.is_org_admin(org_id)
    AND granted_by = auth.uid()
  );

DROP POLICY IF EXISTS "module_permissions_delete" ON public.module_permissions;
CREATE POLICY "module_permissions_delete" ON public.module_permissions
  FOR DELETE TO authenticated
  USING (
    org_id = (SELECT public.current_org_id())
    AND public.is_org_admin(org_id)
  );

-- 3.3 — works / work_members: o `is_work_member` FICA
--
--   ⚠ ESTE BLOCO É O QUE MANTÉM O APK ANDROID FUNCIONANDO.
--
--   docs/apk-contracts/02-works.md: o gerente de obra não cria nem edita obras;
--   ele vê apenas aquelas em que está alocado, e o contrato afirma
--   explicitamente que `works_select` já filtra por `work_members`, sem JOIN
--   explícito do lado do app.
--
--   O gerente de campo é justamente o perfil que pode NÃO estar em
--   `org_members` — o seed da Fase 1 entra por domínio de e-mail
--   (@onengenhariaeletrica.com.br) e um gerente pode ter conta pessoal. Se esta
--   policy virasse `org_id` puro, todo gerente fora da org perderia acesso às
--   obras no aplicativo, sem erro visível: a RLS simplesmente devolve vazio.
--
--   Por isso o `OR public.is_work_member(...)` é PRESERVADO. Ele é estritamente
--   aditivo e não vaza nada: só alcança quem foi explicitamente alocado à obra.
--
--   Em dev não há um único `profiles.role = 'manager'`, então este caminho é
--   IMPOSSÍVEL DE TESTAR AQUI. Testar em produção com um gerente real antes de
--   considerar a Fase 3 concluída.

DROP POLICY IF EXISTS "works_select" ON public.works;
CREATE POLICY "works_select" ON public.works
  FOR SELECT TO authenticated
  USING (
    org_id = (SELECT public.current_org_id())
    OR public.is_work_member(id, auth.uid())
  );

DROP POLICY IF EXISTS "work_members_select" ON public.work_members;
CREATE POLICY "work_members_select" ON public.work_members
  FOR SELECT TO authenticated
  USING (
    auth.uid() = user_id
    OR org_id = (SELECT public.current_org_id())
    OR public.is_work_member(work_id, auth.uid())
  );

-- -----------------------------------------------------------------------------
-- 4. Verificação — nenhuma policy de dono pode ter sobrado
--
--    Varre as 33 tabelas atrás de qualquer resquício de `auth.uid() = <dono>`
--    como expressão inteira. As policies `anon` e as compostas da seção 3 são
--    ignoradas de propósito. Sobrando qualquer coisa, a migration aborta e a
--    transação inteira é revertida.
-- -----------------------------------------------------------------------------
DO $do$
DECLARE r RECORD; v_relatorio TEXT := '';
BEGIN
  FOR r IN
    SELECT pol.tablename, pol.policyname, pol.cmd
    FROM pg_policies pol
    WHERE pol.schemaname='public'
      AND pol.tablename IN (
        SELECT table_name FROM information_schema.columns
        WHERE table_schema='public' AND column_name='org_id' AND table_name <> 'org_members'
      )
      AND pol.roles::text NOT LIKE '%anon%'
      AND (
           COALESCE(pol.qual,'')       ~ '^\(auth\.uid\(\) = (user_id|owner_id|engineer_id)\)$'
        OR COALESCE(pol.with_check,'') ~ '^\(auth\.uid\(\) = (user_id|owner_id|engineer_id)\)$'
        OR COALESCE(pol.qual,'')       ~ '^\((user_id|owner_id|engineer_id) = auth\.uid\(\)\)$'
        OR COALESCE(pol.with_check,'') ~ '^\((user_id|owner_id|engineer_id) = auth\.uid\(\)\)$'
      )
  LOOP
    v_relatorio := v_relatorio || format('  %s.%s (%s)%s', r.tablename, r.policyname, r.cmd, chr(10));
  END LOOP;

  IF v_relatorio <> '' THEN
    RAISE EXCEPTION E'Flip incompleto — policies ainda ancoradas na pessoa:\n%', v_relatorio;
  END IF;

  -- Segunda trava: nenhuma policy que chame current_org_id() pode estar em
  -- `public`, senão `anon` a avalia e o link da proposta quebra com
  -- `permission denied for function current_org_id`.
  v_relatorio := '';
  FOR r IN
    SELECT pol.tablename, pol.policyname, pol.cmd
    FROM pg_policies pol
    WHERE pol.schemaname='public'
      AND pol.roles::text = '{public}'
      AND (COALESCE(pol.qual,'') || COALESCE(pol.with_check,'')) ILIKE '%current_org_id%'
  LOOP
    v_relatorio := v_relatorio || format('  %s.%s (%s)%s', r.tablename, r.policyname, r.cmd, chr(10));
  END LOOP;

  IF v_relatorio <> '' THEN
    RAISE EXCEPTION E'Policies org-scoped em `public` — anon quebraria ao avaliá-las:\n%', v_relatorio;
  END IF;

  RAISE NOTICE 'Flip completo: nenhuma policy de dono puro restante, nenhuma exposta a anon.';
END $do$;

-- -----------------------------------------------------------------------------
-- 5. Depois de aplicar — o que conferir
--
--   a) ISOLAMENTO, com os dois usuários de dev:
--        Luan (org ON)      → 102 budgets, 0 da devpaulo
--        Paulo (devpaulo)   → 3 budgets, 0 da ON
--        Paulo após eleger a ON → 102 da ON, 0 da devpaulo
--
--   b) O LINK PÚBLICO DA PROPOSTA continua abrindo (as policies `anon` não foram
--      tocadas, mas é o teste que prova).
--
--   c) O APK, com um gerente real EM PRODUÇÃO (impossível em dev — zero
--      managers). Ver a seção 3.3.
--
--   d) Só depois de tudo isso, avaliar apagar a duplicata criada por
--      20260624000000_duplicate_luan_to_paulo — que é a razão de ser deste
--      projeto. CONFERIR EM PRODUÇÃO se ela existe: em dev, não.
-- =============================================================================
