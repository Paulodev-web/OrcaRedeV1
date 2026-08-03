-- =============================================================================
-- FASE 4 — Cenários de precificação (A/B) no mesmo orçamento
--
-- PROPÓSITO
--   Hoje `saved_pricing_budgets` tem UNIQUE (user_id, budget_id): um orçamento
--   só admite UMA precificação salva, e salvar de novo sobrescreve (Escopo §4).
--   Isso impede a proposta de apresentar mais de uma opção de preço ao cliente
--   (§8.6). Passa a valer:
--
--     UNIQUE (user_id, budget_id, scenario_name)   → N cenários nomeados
--     UNIQUE parcial (user_id, budget_id) WHERE is_primary → um só principal
--
-- ⚠ ATENÇÃO — ESTA É A ÚNICA MIGRATION DESTRUTIVA DO LOTE
--   Remove uma constraint existente. Aplicar somente depois de backup (§3.2).
--
-- ⚠ QUEBRA CÓDIGO EM PRODUÇÃO
--   src/actions/pricingBudgets.ts:67 faz
--       .upsert(row, { onConflict: 'user_id,budget_id' })
--   PostgREST exige que as colunas de onConflict tenham um índice único. Assim
--   que esta migration for aplicada, esse upsert passa a falhar com
--   "there is no unique or exclusion constraint matching the ON CONFLICT
--   specification" (PGRST / 42P10) e salvar precificação para de funcionar.
--   A correção pertence à frente que cuida do módulo de Precificação:
--   trocar por onConflict 'user_id,budget_id,scenario_name' e passar
--   scenario_name em buildSavedPricingUpsertRow
--   (src/services/pricing/savedPricingBudgets.ts).
--
-- ADITIVA quanto a colunas (§3.3): as duas colunas novas entram com DEFAULT,
-- nenhuma coluna é removida ou renomeada. O APK não lê esta tabela.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Remover a UNIQUE (user_id, budget_id)
--    Descoberta por introspecção em vez de nome fixo: a constraint nasceu
--    inline no CREATE TABLE (20260526151000) e o nome gerado pelo Postgres pode
--    divergir entre dev e produção se a tabela já foi recriada alguma vez.
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  r RECORD;
BEGIN
  -- 1a. constraints UNIQUE cujas colunas são exatamente {budget_id, user_id}
  FOR r IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class     rel ON rel.oid = con.conrelid
    JOIN pg_namespace ns  ON ns.oid  = rel.relnamespace
    WHERE ns.nspname  = 'public'
      AND rel.relname = 'saved_pricing_budgets'
      AND con.contype = 'u'
      AND (
        SELECT array_agg(att.attname::text ORDER BY att.attname::text)
        FROM unnest(con.conkey) AS k(attnum)
        JOIN pg_attribute att
          ON att.attrelid = con.conrelid AND att.attnum = k.attnum
      ) = ARRAY['budget_id', 'user_id']
  LOOP
    EXECUTE format(
      'ALTER TABLE public.saved_pricing_budgets DROP CONSTRAINT %I', r.conname
    );
    RAISE NOTICE 'saved_pricing_budgets: constraint % removida', r.conname;
  END LOOP;

  -- 1b. índices únicos equivalentes que não estejam atrelados a uma constraint
  FOR r IN
    SELECT idx.relname
    FROM pg_index i
    JOIN pg_class     idx ON idx.oid = i.indexrelid
    JOIN pg_class     rel ON rel.oid = i.indrelid
    JOIN pg_namespace ns  ON ns.oid  = rel.relnamespace
    WHERE ns.nspname  = 'public'
      AND rel.relname = 'saved_pricing_budgets'
      AND i.indisunique
      AND i.indpred IS NULL
      AND NOT EXISTS (SELECT 1 FROM pg_constraint c WHERE c.conindid = i.indexrelid)
      AND (
        -- indkey é int2vector: converter via texto é o caminho portável
        SELECT array_agg(att.attname::text ORDER BY att.attname::text)
        FROM unnest(string_to_array(i.indkey::text, ' ')::smallint[]) AS k(attnum)
        JOIN pg_attribute att
          ON att.attrelid = i.indrelid AND att.attnum = k.attnum
      ) = ARRAY['budget_id', 'user_id']
  LOOP
    EXECUTE format('DROP INDEX public.%I', r.relname);
    RAISE NOTICE 'saved_pricing_budgets: índice único % removido', r.relname;
  END LOOP;
END $$;

-- -----------------------------------------------------------------------------
-- 2. Colunas de cenário
-- -----------------------------------------------------------------------------
ALTER TABLE public.saved_pricing_budgets
  ADD COLUMN IF NOT EXISTS scenario_name TEXT    NOT NULL DEFAULT 'Principal',
  ADD COLUMN IF NOT EXISTS is_primary    BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.saved_pricing_budgets.scenario_name IS
  'Nome do cenário dentro do orçamento (ex.: Principal, Com escavação, '
  'Sem iluminação). Único por (user_id, budget_id).';

COMMENT ON COLUMN public.saved_pricing_budgets.is_primary IS
  'Cenário principal do orçamento. No máximo um por (user_id, budget_id), '
  'garantido por índice único parcial. Zero é permitido (orçamento sem escolha '
  'feita); publicar proposta é o gate que exige precificação selecionada (§7.2).';

-- -----------------------------------------------------------------------------
-- 3. Backfill
-- -----------------------------------------------------------------------------

-- 3a. Desempate defensivo de scenario_name antes de criar a UNIQUE.
--     Com a constraint antiga ativa até agora não deveria existir duplicata,
--     mas dev e produção divergem e a migration não pode falhar no meio.
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY user_id, budget_id, scenario_name
           ORDER BY created_at, id
         ) AS rn
  FROM public.saved_pricing_budgets
)
UPDATE public.saved_pricing_budgets s
   SET scenario_name = s.scenario_name || ' ' || r.rn::text
  FROM ranked r
 WHERE r.id = s.id
   AND r.rn > 1;

-- 3b. Registros existentes viram o cenário principal do seu orçamento.
--     ROW_NUMBER em vez de "SET is_primary = true" direto por dois motivos:
--     continua válida se já existirem duplicatas por (user_id, budget_id), e o
--     filtro NOT EXISTS torna a migration re-executável sem trocar o principal
--     que o usuário tiver escolhido depois — só promove quem ainda não tem um.
WITH ranked AS (
  SELECT s.id,
         ROW_NUMBER() OVER (
           PARTITION BY s.user_id, s.budget_id
           ORDER BY s.updated_at DESC, s.created_at DESC, s.id
         ) AS rn
  FROM public.saved_pricing_budgets s
  WHERE NOT EXISTS (
    SELECT 1 FROM public.saved_pricing_budgets p
    WHERE p.user_id = s.user_id
      AND p.budget_id = s.budget_id
      AND p.is_primary
  )
)
UPDATE public.saved_pricing_budgets s
   SET is_primary = true
  FROM ranked r
 WHERE r.id = s.id
   AND r.rn = 1;

-- -----------------------------------------------------------------------------
-- 4. Novas constraints
-- -----------------------------------------------------------------------------
ALTER TABLE public.saved_pricing_budgets
  DROP CONSTRAINT IF EXISTS saved_pricing_budgets_scenario_name_not_blank;
ALTER TABLE public.saved_pricing_budgets
  ADD  CONSTRAINT saved_pricing_budgets_scenario_name_not_blank
       CHECK (length(btrim(scenario_name)) > 0);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'saved_pricing_budgets_user_budget_scenario_key'
      AND conrelid = 'public.saved_pricing_budgets'::regclass
  ) THEN
    ALTER TABLE public.saved_pricing_budgets
      ADD CONSTRAINT saved_pricing_budgets_user_budget_scenario_key
      UNIQUE (user_id, budget_id, scenario_name);
  END IF;
END $$;

-- Um único cenário principal por orçamento.
CREATE UNIQUE INDEX IF NOT EXISTS uq_saved_pricing_budgets_primary
  ON public.saved_pricing_budgets (user_id, budget_id)
  WHERE is_primary;

-- Listagem "cenários deste orçamento", com o principal primeiro.
CREATE INDEX IF NOT EXISTS idx_saved_pricing_budgets_budget_scenario
  ON public.saved_pricing_budgets (budget_id, is_primary DESC, updated_at DESC);
