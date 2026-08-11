-- =============================================================================
-- org_id + BACKFILL — Fase 2 de 3
--
-- PROPÓSITO
--   A Fase 1 (20260806120000_org_foundation) criou a camada de organização mas
--   não tocou em nenhuma tabela de dado. Esta migration dá a cada tabela-raiz a
--   coluna `org_id` e a preenche a partir do dono atual, de modo que a Fase 3
--   possa trocar `auth.uid() = user_id` por `org_id = current_org_id()` sem que
--   ninguém perca acesso ao próprio trabalho.
--
--   `user_id` NÃO é removido nem alterado aqui. Ele sobrevive como AUTOR
--   (auditoria, "quem criou"). Depois da Fase 3 ele deixa de ser a fronteira de
--   acesso, mas continua respondendo "quem fez isto".
--
-- ESTA MIGRATION NÃO MEXE EM NENHUMA POLICY. O comportamento do sistema é
-- idêntico antes e depois. O flip do RLS é a Fase 3, e é lá que o risco mora.
--
-- ⚠ PRÉ-REQUISITO — rodar ANTES e exigir zero linhas:
--     SELECT p.email FROM public.profiles p
--     LEFT JOIN public.org_members om ON om.user_id = p.id AND om.is_active
--     WHERE p.is_active AND om.id IS NULL;
--   Usuário ativo fora de qualquer org tem dado que o backfill não consegue
--   atribuir — a seção 4 aborta a migration nesse caso, de propósito.
--   Em dev (07/08/2026) isso está limpo: 2 usuários, ambos com org.
--
-- -----------------------------------------------------------------------------
-- O QUE GANHA `org_id` E O QUE NÃO GANHA
--
--   As 33 tabelas da seção 2 são as que a inspeção de `pg_policies` mostrou
--   terem policy de DONO DIRETO (`auth.uid() = user_id` ou `user_id =
--   auth.uid()`, as duas ordens existem no schema). São dado da EMPRESA.
--
--   Ficam DE FORA, deliberadamente:
--
--   a) DADO PESSOAL — `device_tokens`, `user_module_seen`, `notifications`.
--      Pertencem à PESSOA, não à empresa. Um token de push é do aparelho de
--      alguém; "já vi o módulo X" é estado de interface individual; notificação
--      tem destinatário. Se virassem org-scoped, todo colega passaria a ler (e
--      poder apagar) o token de push e as notificações dos outros. Continuam
--      `auth.uid() = user_id` na Fase 3 — e isso não é dívida, é o correto.
--
--   b) TABELAS-FILHAS — herdam a fronteira do pai via EXISTS e não precisam de
--      coluna própria. `quotation_session_notes` é o caso puro: SELECT e DELETE
--      são 100% `EXISTS (quotation_sessions qs WHERE qs.user_id = auth.uid())`.
--      Na Fase 3 esse EXISTS passa a comparar `qs.org_id`, e a filha acompanha
--      sem migração de dado. O mesmo vale para as 8 filhas de `proposals`
--      (proposal_sections, proposal_abc_rows, etc.), que já herdam por token.
--
--   c) A PRÓPRIA CAMADA DE ORG — `organizations`, `org_members`,
--      `platform_admins`. Já resolvidas na Fase 1.
--
--   Note que várias das 33 têm um EXISTS no INSERT (ex.: `proposals_insert`
--   confere que o `budget_id` é do mesmo dono). Isso é GUARDA DE INTEGRIDADE
--   referencial, não herança de fronteira — por isso elas são raiz e ganham
--   `org_id` mesmo assim.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Mapa tabela → coluna de dono
--
--    Três tabelas fogem do padrão `user_id`, e é aqui que elas são tratadas:
--      works               → engineer_id (com fallback para manager_id)
--      checklist_templates → engineer_id
--      crew_members        → owner_id
--
--    A lista vive numa temp table em vez de 33 blocos de DDL escritos à mão:
--    o que precisa ser auditado é a LISTA, e assim ela cabe numa tela. Os
--    statements gerados são idênticos para todas, o que elimina a classe de erro
--    "copiei e esqueci de trocar o nome da tabela numa das 33".
-- -----------------------------------------------------------------------------
CREATE TEMP TABLE _org_backfill_map (tabela TEXT PRIMARY KEY, col_dono TEXT NOT NULL)
ON COMMIT DROP;

INSERT INTO _org_backfill_map (tabela, col_dono) VALUES
  -- Orçamento e materiais
  ('budgets',                                'user_id'),
  ('budget_folders',                         'user_id'),
  ('finalized_budgets',                      'user_id'),
  ('saved_pricing_budgets',                  'user_id'),
  ('materials',                              'user_id'),
  ('material_subgroups',                     'user_id'),
  ('item_group_templates',                   'user_id'),
  -- Suprimentos e cotação
  ('suppliers',                              'user_id'),
  ('supplier_material_mappings',             'user_id'),
  ('supplier_quotes',                        'user_id'),
  ('quotation_sessions',                     'user_id'),
  ('session_material_exclusions',            'user_id'),
  ('session_material_stock_inputs',          'user_id'),
  ('scenario_ideal_selections',              'user_id'),
  ('scenario_purchase_orders',               'user_id'),
  ('extraction_jobs',                        'user_id'),
  -- Propostas
  ('proposals',                              'user_id'),
  ('proposal_templates',                     'user_id'),
  ('proposal_template_responsibility_items', 'user_id'),
  ('technical_responsibles',                 'user_id'),
  -- Padrões técnicos e cadastros
  ('pole_standards',                         'user_id'),
  ('post_types',                             'user_id'),
  ('utility_companies',                      'user_id'),
  ('company_settings',                       'user_id'),
  -- Mídia
  ('media_library',                          'user_id'),
  ('media_tags',                             'user_id'),
  ('media_library_tags',                     'user_id'),
  -- Andamento de obra
  ('works',                                  'engineer_id'),
  ('work_segments',                          'user_id'),
  ('work_members',                           'user_id'),
  ('crew_members',                           'owner_id'),
  ('checklist_templates',                    'engineer_id'),
  -- Governança de acesso
  ('module_permissions',                     'user_id');

-- Trava de sanidade: a lista acima é escrita à mão, então conferimos contra o
-- catálogo que toda tabela existe e que a coluna de dono declarada é real.
-- Erro de digitação aborta aqui, antes de qualquer DDL.
DO $do$
DECLARE r RECORD; v_faltando TEXT := '';
BEGIN
  FOR r IN SELECT * FROM _org_backfill_map LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name=r.tabela AND column_name=r.col_dono
    ) THEN
      v_faltando := v_faltando || format('  %s.%s%s', r.tabela, r.col_dono, chr(10));
    END IF;
  END LOOP;

  IF v_faltando <> '' THEN
    RAISE EXCEPTION 'Mapa de backfill inválido — tabela ou coluna inexistente:%s%s',
      chr(10), v_faltando;
  END IF;
END $do$;

-- -----------------------------------------------------------------------------
-- 2. ADD COLUMN — nullable e sem DEFAULT
--
--    Nullable de propósito: a coluna precisa aceitar NULL durante o backfill.
--    Sem DEFAULT nesta etapa porque um DEFAULT volátil forçaria reescrita da
--    tabela inteira no ALTER; o DEFAULT entra na seção 5, depois que as linhas
--    já estão preenchidas.
--
--    ON DELETE RESTRICT: apagar uma organização com dado dentro deve FALHAR, e
--    ruidosamente. CASCADE aqui apagaria a empresa inteira; SET NULL deixaria
--    todo o acervo órfão e invisível após o flip da Fase 3.
-- -----------------------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT * FROM _org_backfill_map ORDER BY tabela LOOP
    EXECUTE format(
      'ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS org_id UUID NULL '
      'REFERENCES public.organizations(id) ON DELETE RESTRICT',
      r.tabela
    );
    EXECUTE format(
      'COMMENT ON COLUMN public.%I.org_id IS %L',
      r.tabela,
      'Organização dona da linha. Fronteira de acesso a partir da Fase 3. '
      'A coluna de autoria (' || r.col_dono || ') permanece como registro de quem criou.'
    );
  END LOOP;
END $do$;

-- -----------------------------------------------------------------------------
-- 3. BACKFILL — org_id = org do dono atual
--
--    `works` é a única com dois candidatos a dono. Usa engineer_id e cai para
--    manager_id quando o engenheiro é nulo, para não deixar obra sem org.
--
--    Quando o dono pertence a mais de uma org, vence a mais antiga
--    (ORDER BY created_at LIMIT 1) — mesma regra do fallback de
--    current_org_id(), então o dado cai onde o usuário aterrissa por padrão.
-- -----------------------------------------------------------------------------
DO $do$
DECLARE r RECORD; v_expr TEXT; v_n BIGINT;
BEGIN
  FOR r IN SELECT * FROM _org_backfill_map ORDER BY tabela LOOP
    v_expr := CASE WHEN r.tabela = 'works'
                   THEN 'COALESCE(t.engineer_id, t.manager_id)'
                   ELSE format('t.%I', r.col_dono) END;

    EXECUTE format($sql$
      UPDATE public.%I t
      SET org_id = (
        SELECT om.org_id FROM public.org_members om
        WHERE om.user_id = %s AND om.is_active
        ORDER BY om.created_at LIMIT 1
      )
      WHERE t.org_id IS NULL AND %s IS NOT NULL
    $sql$, r.tabela, v_expr, v_expr);

    GET DIAGNOSTICS v_n = ROW_COUNT;
    RAISE NOTICE 'backfill %: % linha(s)', rpad(r.tabela, 42), v_n;
  END LOOP;
END $do$;

-- -----------------------------------------------------------------------------
-- 4. PORTÃO — aborta se sobrou qualquer org_id NULL
--
--    Toda linha que chegar NULL aqui é dado que SOME DA INTERFACE no flip da
--    Fase 3: nenhuma org bate, nenhuma policy libera. Falhar agora, com a
--    transação inteira revertida, é infinitamente melhor que descobrir depois.
--
--    Causas possíveis: dono sem vínculo ativo em org_members, ou linha com a
--    coluna de dono NULL (dado órfão anterior a esta migration).
-- -----------------------------------------------------------------------------
DO $do$
DECLARE r RECORD; v_n BIGINT; v_relatorio TEXT := '';
BEGIN
  FOR r IN SELECT * FROM _org_backfill_map ORDER BY tabela LOOP
    EXECUTE format('SELECT count(*) FROM public.%I WHERE org_id IS NULL', r.tabela) INTO v_n;
    IF v_n > 0 THEN
      v_relatorio := v_relatorio || format('  %s: %s linha(s) sem org%s', r.tabela, v_n, chr(10));
    END IF;
  END LOOP;

  IF v_relatorio <> '' THEN
    RAISE EXCEPTION E'Backfill incompleto — estas linhas ficariam invisíveis após a Fase 3:\n%\nCorrija o vínculo em org_members (ou a coluna de autoria) e rode de novo.', v_relatorio;
  END IF;

  RAISE NOTICE 'Portão OK: nenhuma linha sem org_id.';
END $do$;

-- -----------------------------------------------------------------------------
-- 5. NOT NULL + DEFAULT + índice
--
--    A ordem importa: NOT NULL só depois do portão da seção 4, e o DEFAULT só
--    depois do NOT NULL (assim nenhuma linha existente é reescrita).
--
--    DEFAULT current_org_id() faz todo INSERT novo já nascer na org certa sem o
--    app precisar informar nada — inclusive os inserts do APK Android, que não
--    conhecem esta camada. É o que permite a Fase 3 acontecer sem tocar no
--    aplicativo.
--
--    ⚠ EM PRODUÇÃO: CREATE INDEX sem CONCURRENTLY trava escrita na tabela
--    enquanto roda. Aqui é aceitável (`materials` tem ~2.4k linhas, o resto é
--    menor), mas se o volume crescer, criar os índices FORA desta migration com
--    CREATE INDEX CONCURRENTLY — que não pode rodar dentro de transação.
-- -----------------------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT * FROM _org_backfill_map ORDER BY tabela LOOP
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN org_id SET NOT NULL', r.tabela);
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN org_id SET DEFAULT public.current_org_id()', r.tabela);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I (org_id)',
                   'idx_' || r.tabela || '_org', r.tabela);
  END LOOP;
END $do$;

-- -----------------------------------------------------------------------------
-- 6. Verificação final — rodar e conferir ANTES de escrever a Fase 3
--
--     SELECT c.table_name,
--            (SELECT count(*) FROM public.organizations o
--              WHERE EXISTS (SELECT 1 FROM pg_class WHERE relname = c.table_name)) AS _
--     -- Na prática, o mais útil é a distribuição por org:
--     --   SELECT o.name, count(*) FROM public.budgets b
--     --   JOIN public.organizations o ON o.id = b.org_id GROUP BY o.name;
--     -- Repetir para as tabelas de maior volume (materials, supplier_quotes).
--
--     E a checagem estrutural, que deve retornar 33:
--     SELECT count(*) FROM information_schema.columns
--     WHERE table_schema='public' AND column_name='org_id' AND is_nullable='NO';
--
-- -----------------------------------------------------------------------------
-- 7. Ponto de atenção herdado, para a Fase 3
--
--    `company_settings` é hoje UMA LINHA POR USUÁRIO. Depois deste backfill, uma
--    org com dois usuários que ambos preencheram o cadastro fica com DUAS linhas
--    de "dados da empresa" na mesma org — e a Fase 3, ao trocar a policy para
--    `org_id = current_org_id()`, faz as duas aparecerem, sem critério de
--    desempate. O mesmo padrão vale para `technical_responsibles` (aí a
--    multiplicidade é legítima: uma empresa tem vários responsáveis técnicos).
--
--    Decidir na Fase 3: eleger a linha canônica de company_settings por org e
--    aplicar UNIQUE (org_id). Em dev hoje o problema não se manifesta (uma linha
--    só), mas EM PRODUÇÃO É PRECISO CONFERIR ANTES.
-- =============================================================================
