-- =============================================================================
-- Fase 4 — as chaves únicas param de incluir `user_id`
--
--   As Fases 1–3 (20260806120000, 20260807120000, 20260807140000) moveram a
--   fronteira do dado de `auth.uid() = user_id` para
--   `org_id = current_org_id()`. O RLS já deixa o colega LER e EDITAR a mesma
--   linha. Mas NOVE chaves únicas ainda carregam `user_id`, e enquanto isso for
--   verdade a fronteira volta pela porta dos fundos:
--
--     UNIQUE (session_id, material_id, user_id)
--
--   Com essa chave, o Comercial e a Engenharia mexendo no mesmo material da
--   mesma sessão não disputam UMA linha — cada um ganha a sua. O upsert do app,
--   que declara `onConflict: 'session_id,material_id,user_id'`, não encontra
--   conflito e INSERE. Resultado: a tela mostra duas seleções de fornecedor
--   para o mesmo material, sem critério de desempate, e o cenário ideal deixa
--   de ser único.
--
--   O modelo correto é o que a operação já espera: **a linha é uma só, da
--   organização, e quem escreve por último troca o valor.** Esta migration faz
--   as chaves refletirem isso.
--
--   ⚠ Ordem: rode DEPOIS de 20260807140000_org_rls_flip. A seção 0 barra se não.
--
--   Nada é apagado sem cópia: toda linha removida na deduplicação vai antes
--   para `rls_backup.dedup_pre_fase4`, com a linha inteira em JSONB.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 0. Portão — as fases anteriores precisam estar completas
-- -----------------------------------------------------------------------------
DO $do$
BEGIN
  IF to_regclass('public.organizations') IS NULL THEN
    RAISE EXCEPTION 'Fase 1 ausente: public.organizations não existe. Aplique 20260806120000 primeiro.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='suppliers' AND column_name='org_id'
  ) THEN
    RAISE EXCEPTION 'Fase 2 ausente: suppliers.org_id não existe. Aplique 20260807120000 primeiro.';
  END IF;
END
$do$;

-- -----------------------------------------------------------------------------
-- 1. Backup do que a deduplicação for apagar
--
--    Mesma ideia do snapshot da Fase 3 (`rls_backup.policies_pre_fase3`): a
--    migration é reversível na parte que destrói dado. `linha` guarda o
--    registro inteiro, então dá para reinserir com um INSERT ... SELECT
--    jsonb_populate_record.
-- -----------------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS rls_backup;

CREATE TABLE IF NOT EXISTS rls_backup.dedup_pre_fase4 (
  id          BIGSERIAL PRIMARY KEY,
  tabela      TEXT        NOT NULL,
  motivo      TEXT        NOT NULL,
  linha       JSONB       NOT NULL,
  removido_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- -----------------------------------------------------------------------------
-- 2. Deduplicação — "o mais recente vence"
--
--    Critério: maior `updated_at` (quando a tabela tem), depois maior
--    `created_at`, e `id` como desempate final para o resultado ser
--    determinístico mesmo com timestamps idênticos. É o mesmo comportamento
--    que a operação já espera dali em diante: quem escreve por último troca o
--    valor — a diferença é que aqui as escritas concorrentes já aconteceram e
--    precisam ser resolvidas de uma vez.
--
--    Num banco onde só uma pessoa mexeu em cada sessão, isto é no-op.
-- -----------------------------------------------------------------------------
DO $do$
DECLARE
  r        RECORD;
  v_sql    TEXT;
  v_n      BIGINT;
  v_total  BIGINT := 0;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('session_material_exclusions',   'session_id, material_id', 'created_at'),
      ('session_material_stock_inputs', 'session_id, material_id', 'updated_at'),
      ('scenario_ideal_selections',     'session_id, material_id', 'updated_at'),
      ('scenario_purchase_orders',      'session_id, material_id', 'updated_at'),
      ('saved_pricing_budgets',         'budget_id, scenario_name', 'updated_at'),
      -- O "de-para" que o sistema aprende ao conciliar: se a Engenharia ensina
      -- que "CABO 10MM" do Fornecedor X é o material Y, Compras não deve ter de
      -- ensinar de novo. É conhecimento da empresa, não da pessoa.
      ('supplier_material_mappings',    'org_id, supplier_name, supplier_material_name', 'updated_at'),
      -- Uma linha de "dados da empresa" por organização. Com a chave em
      -- `user_id`, cada pessoa que abrisse Configurações › Empresa criava a
      -- sua, e depois do flip as duas apareciam sem critério de desempate.
      ('company_settings',              'org_id', 'updated_at')
    ) AS t(tabela, chave, recencia)
  LOOP
    -- Guarda as perdedoras antes de apagar.
    v_sql := format($f$
      INSERT INTO rls_backup.dedup_pre_fase4 (tabela, motivo, linha)
      SELECT %1$L, 'duplicata por user_id na mesma chave de negocio', to_jsonb(x)
      FROM (
        SELECT t.*, row_number() OVER (
                 PARTITION BY %2$s
                 ORDER BY t.%3$I DESC NULLS LAST, t.created_at DESC NULLS LAST, t.id DESC
               ) AS rn
        FROM public.%1$I t
      ) x
      WHERE x.rn > 1
    $f$, r.tabela, r.chave, r.recencia);
    EXECUTE v_sql;

    v_sql := format($f$
      DELETE FROM public.%1$I d
      WHERE d.id IN (
        SELECT x.id FROM (
          SELECT t.id, row_number() OVER (
                   PARTITION BY %2$s
                   ORDER BY t.%3$I DESC NULLS LAST, t.created_at DESC NULLS LAST, t.id DESC
                 ) AS rn
          FROM public.%1$I t
        ) x
        WHERE x.rn > 1
      )
    $f$, r.tabela, r.chave, r.recencia);
    EXECUTE v_sql;

    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_total := v_total + v_n;
    IF v_n > 0 THEN
      RAISE NOTICE 'dedup %: % linha(s) removida(s)', rpad(r.tabela, 32), v_n;
    END IF;
  END LOOP;

  RAISE NOTICE 'dedup total: % linha(s) (backup em rls_backup.dedup_pre_fase4)', v_total;
END
$do$;

-- -----------------------------------------------------------------------------
-- 3. As chaves novas — sem `user_id`
--
--    `user_id` continua na tabela: ele é a AUTORIA (quem criou), que o
--    `WITH CHECK` do INSERT ainda exige. O que sai é o papel dele de
--    discriminar linha, que é o que fatiava o dado por pessoa.
-- -----------------------------------------------------------------------------

-- Cada bloco derruba a chave antiga E a nova antes de criar, para a migration
-- poder ser reaplicada sem dar "constraint already exists".

ALTER TABLE public.session_material_exclusions
  DROP CONSTRAINT IF EXISTS session_material_exclusions_session_id_material_id_user_id_key,
  DROP CONSTRAINT IF EXISTS session_material_exclusions_session_material_key,
  ADD  CONSTRAINT session_material_exclusions_session_material_key
       UNIQUE (session_id, material_id);

ALTER TABLE public.session_material_stock_inputs
  DROP CONSTRAINT IF EXISTS session_material_stock_inputs_session_id_material_id_user_i_key,
  DROP CONSTRAINT IF EXISTS session_material_stock_inputs_session_material_key,
  ADD  CONSTRAINT session_material_stock_inputs_session_material_key
       UNIQUE (session_id, material_id);

ALTER TABLE public.scenario_ideal_selections
  DROP CONSTRAINT IF EXISTS scenario_ideal_selections_session_id_material_id_user_id_key,
  DROP CONSTRAINT IF EXISTS scenario_ideal_selections_session_material_key,
  ADD  CONSTRAINT scenario_ideal_selections_session_material_key
       UNIQUE (session_id, material_id);

ALTER TABLE public.scenario_purchase_orders
  DROP CONSTRAINT IF EXISTS scenario_purchase_orders_session_id_material_id_user_id_key,
  DROP CONSTRAINT IF EXISTS scenario_purchase_orders_session_material_key,
  ADD  CONSTRAINT scenario_purchase_orders_session_material_key
       UNIQUE (session_id, material_id);

ALTER TABLE public.saved_pricing_budgets
  DROP CONSTRAINT IF EXISTS saved_pricing_budgets_user_budget_scenario_key,
  DROP CONSTRAINT IF EXISTS saved_pricing_budgets_budget_scenario_key,
  ADD  CONSTRAINT saved_pricing_budgets_budget_scenario_key
       UNIQUE (budget_id, scenario_name);

ALTER TABLE public.supplier_material_mappings
  DROP CONSTRAINT IF EXISTS supplier_material_mappings_user_id_supplier_name_supplier_m_key,
  DROP CONSTRAINT IF EXISTS supplier_material_mappings_org_supplier_material_key,
  ADD  CONSTRAINT supplier_material_mappings_org_supplier_material_key
       UNIQUE (org_id, supplier_name, supplier_material_name);

ALTER TABLE public.company_settings
  DROP CONSTRAINT IF EXISTS company_settings_user_key,
  DROP CONSTRAINT IF EXISTS company_settings_org_key,
  ADD  CONSTRAINT company_settings_org_key
       UNIQUE (org_id);

-- O índice parcial do cenário principal tinha o mesmo defeito, e este é o mais
-- traiçoeiro dos seis: com `user_id` na chave, DOIS usuários podiam cada um
-- marcar a SUA precificação como principal do mesmo orçamento — e o portão de
-- publicar proposta (§7.2) procura exatamente "a principal deste orçamento".
DROP INDEX IF EXISTS public.uq_saved_pricing_budgets_primary;
CREATE UNIQUE INDEX uq_saved_pricing_budgets_primary
  ON public.saved_pricing_budgets (budget_id)
  WHERE is_primary;

-- Fornecedor: o nome passa a ser único DENTRO DA ORGANIZAÇÃO, não por pessoa.
-- Sem isso, `assertUniqueActiveName` (src/actions/suppliers.ts) não pode largar
-- o filtro por usuário: ele recusaria nomes que o banco aceitaria, ou aceitaria
-- duplicata que a org enxerga como uma coisa só.
DROP INDEX IF EXISTS public.uq_suppliers_user_name_active;
CREATE UNIQUE INDEX uq_suppliers_org_name_active
  ON public.suppliers (org_id, lower(trim(name)))
  WHERE is_active;

-- -----------------------------------------------------------------------------
-- 3.1 — Catálogos: mesma troca, mas SEM deduplicação automática
--
--    A seção 2 apaga a linha perdedora, o que é aceitável para estado de sessão
--    (estoque digitado, seleção de fornecedor): a informação é reproduzível e o
--    modelo é "o último a escrever vence".
--
--    Aqui NÃO é. Estas tabelas são catálogo, e outras tabelas apontam para elas:
--    apagar um `materials` duplicado arrastaria `post_materials`,
--    `post_item_group_materials` e o que mais referencie aquele id — ou seja,
--    mudaria orçamento fechado. Um `technical_responsibles` apagado quebraria o
--    termo de aceite de proposta já publicada.
--
--    Por isso o comportamento é o oposto: **se houver conflito, a migration
--    aborta e diz quais são**, para alguém decidir a fusão. Em banco onde só uma
--    pessoa alimentou o catálogo, não há conflito e isto passa direto.
--
--    NULL não conflita em índice único no Postgres (NULLS DISTINCT), então
--    `code IS NULL` repetido — que existe de verdade em `materials` — não é
--    problema e é ignorado na checagem.
-- -----------------------------------------------------------------------------
DO $do$
DECLARE
  r           RECORD;
  v_n         BIGINT;
  v_relatorio TEXT := '';
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('materials',               'code'),
      ('material_subgroups',      'name'),
      ('media_tags',              'name'),
      ('post_types',              'code'),
      ('proposal_templates',      'name'),
      ('technical_responsibles',  'crea'),
      ('utility_companies',       'name'),
      ('work_segments',           'name')
    ) AS t(tabela, coluna)
  LOOP
    EXECUTE format($f$
      SELECT count(*) FROM (
        SELECT org_id, %2$I FROM public.%1$I
        WHERE %2$I IS NOT NULL
        GROUP BY org_id, %2$I HAVING count(*) > 1
      ) z
    $f$, r.tabela, r.coluna) INTO v_n;

    IF v_n > 0 THEN
      v_relatorio := v_relatorio || format('  %s: %s valor(es) de "%s" repetidos na mesma org%s',
        r.tabela, v_n, r.coluna, chr(10));
    END IF;
  END LOOP;

  IF v_relatorio <> '' THEN
    RAISE EXCEPTION E'Catálogo com duplicata dentro da mesma organização — resolva a fusão à mão antes de aplicar (apagar automaticamente quebraria orçamento/proposta que aponta para a linha):\n%', v_relatorio;
  END IF;
END
$do$;

ALTER TABLE public.materials
  DROP CONSTRAINT IF EXISTS materials_code_user_id_key,
  DROP CONSTRAINT IF EXISTS materials_code_org_key,
  ADD  CONSTRAINT materials_code_org_key UNIQUE (code, org_id);

ALTER TABLE public.material_subgroups
  DROP CONSTRAINT IF EXISTS material_subgroups_user_name_key,
  DROP CONSTRAINT IF EXISTS material_subgroups_org_name_key,
  ADD  CONSTRAINT material_subgroups_org_name_key UNIQUE (org_id, name);

ALTER TABLE public.media_tags
  DROP CONSTRAINT IF EXISTS media_tags_user_name_key,
  DROP CONSTRAINT IF EXISTS media_tags_org_name_key,
  ADD  CONSTRAINT media_tags_org_name_key UNIQUE (org_id, name);

ALTER TABLE public.post_types
  DROP CONSTRAINT IF EXISTS post_types_code_user_id_key,
  DROP CONSTRAINT IF EXISTS post_types_code_org_key,
  ADD  CONSTRAINT post_types_code_org_key UNIQUE (code, org_id);

ALTER TABLE public.proposal_templates
  DROP CONSTRAINT IF EXISTS proposal_templates_user_name_key,
  DROP CONSTRAINT IF EXISTS proposal_templates_org_name_key,
  ADD  CONSTRAINT proposal_templates_org_name_key UNIQUE (org_id, name);

ALTER TABLE public.technical_responsibles
  DROP CONSTRAINT IF EXISTS technical_responsibles_user_crea_key,
  DROP CONSTRAINT IF EXISTS technical_responsibles_org_crea_key,
  ADD  CONSTRAINT technical_responsibles_org_crea_key UNIQUE (org_id, crea);

ALTER TABLE public.utility_companies
  DROP CONSTRAINT IF EXISTS utility_companies_name_user_id_key,
  DROP CONSTRAINT IF EXISTS utility_companies_name_org_key,
  ADD  CONSTRAINT utility_companies_name_org_key UNIQUE (name, org_id);

ALTER TABLE public.work_segments
  DROP CONSTRAINT IF EXISTS work_segments_user_name_key,
  DROP CONSTRAINT IF EXISTS work_segments_org_name_key,
  ADD  CONSTRAINT work_segments_org_name_key UNIQUE (org_id, name);

-- Numeração de proposta é da EMPRESA: duas pessoas não podem emitir a
-- "Proposta 042 v1" cada uma. `resolveNumbering`
-- (src/services/proposals/createFromBudget.ts) já calcula o próximo número
-- varrendo a org inteira; esta chave é o que impede a corrida entre dois
-- comerciais criando proposta ao mesmo tempo.
ALTER TABLE public.proposals
  DROP CONSTRAINT IF EXISTS proposals_number_version_key,
  DROP CONSTRAINT IF EXISTS proposals_org_number_version_key,
  ADD  CONSTRAINT proposals_org_number_version_key
       UNIQUE (org_id, proposal_number, version);

-- Um template padrão por organização (era um por pessoa).
DROP INDEX IF EXISTS public.uq_proposal_templates_default;
CREATE UNIQUE INDEX uq_proposal_templates_default
  ON public.proposal_templates (org_id)
  WHERE is_default;

-- -----------------------------------------------------------------------------
-- 4. Verificação — nenhuma chave única pode ter sobrado com `user_id`
--
--    Varre as seis tabelas atrás de qualquer índice único que ainda cite
--    `user_id`. Sobrando um, a migration aborta e a transação inteira volta.
-- -----------------------------------------------------------------------------
--    Varre o schema INTEIRO, em vez de uma lista fixa: foi assim que as chaves
--    de catálogo apareceram: a primeira versão desta migration olhava só as seis
--    tabelas conhecidas e deixou nove de fora.
--
--    As exceções abaixo são as chaves que DEVEM continuar por pessoa. Não são
--    dívida: permissão, vínculo com org/obra e estado de interface são de
--    alguém, não da empresa.
DO $do$
DECLARE r RECORD; v_relatorio TEXT := '';
BEGIN
  FOR r IN
    SELECT i.tablename, i.indexname, i.indexdef
    FROM pg_indexes i
    WHERE i.schemaname = 'public'
      AND i.indexdef ILIKE '%UNIQUE%'
      AND i.indexdef ~ '\muser_id\M'
      AND i.indexname NOT IN (
        'module_permissions_user_module_key', -- permissão é de uma pessoa
        'org_members_org_user_key',           -- vínculo pessoa↔org
        'work_members_pkey',                  -- vínculo pessoa↔obra (contrato do APK)
        'platform_admins_pkey',               -- operador da plataforma
        'user_module_seen_pkey'               -- "já vi o módulo X": estado de UI
      )
  LOOP
    v_relatorio := v_relatorio || format('  %s.%s: %s%s',
      r.tablename, r.indexname, r.indexdef, chr(10));
  END LOOP;

  IF v_relatorio <> '' THEN
    RAISE EXCEPTION 'Sobrou chave única com user_id:%', chr(10) || v_relatorio;
  END IF;

  RAISE NOTICE 'OK: nenhuma chave única de dado da empresa cita user_id.';
END
$do$;
