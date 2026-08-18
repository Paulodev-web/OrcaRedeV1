-- =============================================================================
-- DRE de Obra — núcleo (MD/PLANO-DRE-OBRA.md §5)
--
--   Orçado × Comprado por obra, ancorado em `budget_id`: é o que já amarra
--   precificação (saved_pricing_budgets.budget_id), proposta (proposals.budget_id)
--   e sessão de cotação (quotation_sessions.budget_id). Uma DRE por orçamento.
--
--   ⚠ Ordem: depois de 20260818120000 (accepted_pricing_option) e de
--   20260807140000 (org_rls_flip) — depende de `current_org_id()`.
-- =============================================================================

DO $do$
BEGIN
  IF to_regclass('public.budgets') IS NULL THEN
    RAISE EXCEPTION 'budgets ausente.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='budgets' AND column_name='org_id'
  ) THEN
    RAISE EXCEPTION 'budgets.org_id ausente. Aplique 20260807120000 primeiro.';
  END IF;
END
$do$;

-- -----------------------------------------------------------------------------
-- 1. Taxonomia de grupo
--
--    ENUM e não tabela de cadastro: são as seis linhas da DRE, o eixo que torna
--    orçado e comprado comparáveis. Grupo novo é decisão de negócio e merece
--    passar por migration, não por INSERT numa tela.
-- -----------------------------------------------------------------------------
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'dre_group') THEN
    CREATE TYPE public.dre_group AS ENUM (
      'material', 'mao_de_obra', 'imposto', 'frete', 'comissao', 'adicional'
    );
  END IF;
END
$do$;

COMMENT ON TYPE public.dre_group IS
  'Grupos da DRE de Obra. Usados nos DOIS lados (orçado e realizado) — é o que '
  'permite somar os blocos. Espelha a coluna Grupo da planilha de referência.';

-- -----------------------------------------------------------------------------
-- 2. work_dre — cabeçalho
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.work_dre (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           UUID        NOT NULL DEFAULT public.current_org_id()
                               REFERENCES public.organizations(id) ON DELETE RESTRICT,
  budget_id        UUID        NOT NULL REFERENCES public.budgets(id) ON DELETE RESTRICT,
  proposal_id      UUID        NULL REFERENCES public.proposals(id) ON DELETE SET NULL,

  -- Receita congelada na abertura (§3). Congelada e não lida ao vivo porque
  -- `saved_pricing_budgets` com save_mode='live' muda sozinho quando o orçamento
  -- muda: ler ao vivo faria a variação da DRE sumir sem deixar rastro.
  contract_value   NUMERIC     NOT NULL CHECK (contract_value > 0),
  revenue_source   TEXT        NOT NULL CHECK (revenue_source IN ('proposal', 'pricing')),

  -- Orçado congelado. Formato: { material, mao_de_obra, imposto, frete,
  -- comissao, adicional, source_pricing_id, frozen_at } — todos NUMERIC.
  planned_snapshot JSONB       NOT NULL
                               CHECK (jsonb_typeof(planned_snapshot) = 'object'),

  status           TEXT        NOT NULL DEFAULT 'aberta'
                               CHECK (status IN ('aberta', 'fechada')),
  closed_at        TIMESTAMPTZ NULL,

  user_id          UUID        NOT NULL DEFAULT auth.uid()
                               REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT work_dre_org_budget_unq UNIQUE (org_id, budget_id),
  CONSTRAINT work_dre_closed_coerente
    CHECK ((status = 'fechada') = (closed_at IS NOT NULL))
);

COMMENT ON TABLE public.work_dre IS
  'DRE de Obra: uma por orçamento. Congela receita e orçado na abertura; o '
  'realizado é somado de purchase_orders (material/frete) e dre_actuals (resto).';

COMMENT ON COLUMN public.work_dre.revenue_source IS
  '''proposal'' = grand_total da opção aceita (canônico). ''pricing'' = '
  'preco_total_cliente da precificação primária (fallback). Sem nenhum dos '
  'dois a DRE não abre — receita chutada é pior que DRE nenhuma.';

COMMENT ON COLUMN public.work_dre.planned_snapshot IS
  'Orçado congelado por grupo no momento da abertura. Recongelar é ação '
  'explícita do usuário, nunca efeito colateral de editar o orçamento.';

CREATE INDEX IF NOT EXISTS idx_work_dre_org      ON public.work_dre (org_id);
CREATE INDEX IF NOT EXISTS idx_work_dre_budget   ON public.work_dre (budget_id);
CREATE INDEX IF NOT EXISTS idx_work_dre_proposal ON public.work_dre (proposal_id)
  WHERE proposal_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.update_work_dre_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_work_dre_updated_at ON public.work_dre;
CREATE TRIGGER trg_work_dre_updated_at
  BEFORE UPDATE ON public.work_dre
  FOR EACH ROW EXECUTE FUNCTION public.update_work_dre_updated_at();

-- -----------------------------------------------------------------------------
-- 3. dre_group_status — o antídoto da margem inflada (§4)
--
--    Na planilha de referência o lucro "real" aparece 2,5× o planejado. Não é
--    economia de compra: é DRE parcial — o executado só soma o que já virou OC
--    de material, enquanto o planejado soma os seis grupos. Enquanto mão de
--    obra, imposto e comissão não forem lançados, a margem mente.
--
--    Com esta tabela, grupo aberto usa o ORÇADO como proxy e o número sai
--    rotulado como *projetado*. Margem real só com os seis fechados.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.dre_group_status (
  dre_id     UUID             NOT NULL REFERENCES public.work_dre(id) ON DELETE CASCADE,
  grupo      public.dre_group NOT NULL,
  fechado    BOOLEAN          NOT NULL DEFAULT false,
  fechado_em TIMESTAMPTZ      NULL,
  fechado_por UUID            NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  PRIMARY KEY (dre_id, grupo),
  CONSTRAINT dre_group_status_coerente
    CHECK (fechado = (fechado_em IS NOT NULL))
);

COMMENT ON TABLE public.dre_group_status IS
  'Estado de fechamento por grupo. Grupo aberto = realizado ainda incompleto, '
  'DRE mostra "projetado" e não "real".';

-- Toda DRE nasce com os seis grupos abertos — a UI nunca precisa lidar com
-- linha ausente, e o cálculo não tem caso especial.
CREATE OR REPLACE FUNCTION public.work_dre_seed_group_status()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  INSERT INTO public.dre_group_status (dre_id, grupo)
  SELECT NEW.id, g
  FROM unnest(enum_range(NULL::public.dre_group)) AS g
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_work_dre_seed_group_status ON public.work_dre;
CREATE TRIGGER trg_work_dre_seed_group_status
  AFTER INSERT ON public.work_dre
  FOR EACH ROW EXECUTE FUNCTION public.work_dre_seed_group_status();

-- -----------------------------------------------------------------------------
-- 4. RLS — padrão org (20260807140000), não user_id
-- -----------------------------------------------------------------------------
ALTER TABLE public.work_dre         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dre_group_status ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "work_dre_select" ON public.work_dre;
CREATE POLICY "work_dre_select" ON public.work_dre
  FOR SELECT TO authenticated
  USING (org_id = (SELECT public.current_org_id()));

-- INSERT: o dado é da org, mas quem cria assina. E o orçamento tem que ser da
-- mesma org — senão dá para abrir DRE em cima do orçamento de outra empresa.
DROP POLICY IF EXISTS "work_dre_insert" ON public.work_dre;
CREATE POLICY "work_dre_insert" ON public.work_dre
  FOR INSERT TO authenticated
  WITH CHECK (
    org_id = (SELECT public.current_org_id())
    AND auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.budgets b
      WHERE b.id = work_dre.budget_id
        AND b.org_id = (SELECT public.current_org_id())
    )
  );

-- Sem `auth.uid() = user_id`: é o que libera o colega a editar.
DROP POLICY IF EXISTS "work_dre_update" ON public.work_dre;
CREATE POLICY "work_dre_update" ON public.work_dre
  FOR UPDATE TO authenticated
  USING      (org_id = (SELECT public.current_org_id()))
  WITH CHECK (org_id = (SELECT public.current_org_id()));

DROP POLICY IF EXISTS "work_dre_delete" ON public.work_dre;
CREATE POLICY "work_dre_delete" ON public.work_dre
  FOR DELETE TO authenticated
  USING (org_id = (SELECT public.current_org_id()));

-- Filha sem org_id própria: herda pelo pai, como as filhas de proposta.
DROP POLICY IF EXISTS "dre_group_status_all" ON public.dre_group_status;
CREATE POLICY "dre_group_status_all" ON public.dre_group_status
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.work_dre d
      WHERE d.id = dre_group_status.dre_id
        AND d.org_id = (SELECT public.current_org_id())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.work_dre d
      WHERE d.id = dre_group_status.dre_id
        AND d.org_id = (SELECT public.current_org_id())
    )
  );

-- -----------------------------------------------------------------------------
-- 5. Módulo novo — `dre-obra`
--
--    Desde 20260811130000, ausência de linha vale como SEM ACESSO. Um módulo
--    novo sem seed ficaria visível só para owner/admin (is_org_admin já está
--    embutido em getModuleAccess). Semeamos VIEW para todo membro ativo, mas
--    NÃO edit: DRE é dado financeiro, e quem precisa lançar recebe a permissão
--    explicitamente na tela de usuários. Admin edita sem depender de linha.
-- -----------------------------------------------------------------------------
INSERT INTO public.module_permissions (user_id, org_id, module_key, can_view, can_edit, granted_by)
SELECT m.user_id, m.org_id, 'dre-obra', true, false, NULL
FROM public.org_members m
WHERE m.is_active
ON CONFLICT (user_id, module_key) DO NOTHING;
