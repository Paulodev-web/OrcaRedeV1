-- =============================================================================
-- dre_actuals — o realizado que não passa por ordem de compra
--
-- POR QUE EXISTE
--   Na obra de referência, material é 83,44% do custo. Os outros 16,56% (mão de
--   obra, imposto, comissão, adicional) não têm ordem de compra nenhuma — são
--   folha, guia de imposto, acerto de comissão. Sem um lugar para lançá-los, a
--   DRE compara 100% do orçado contra 83% do comprado e a margem aparece
--   inflada a obra inteira (MD/PLANO-DRE-OBRA.md §4).
--
-- A REGRA DE OURO
--   `grupo <> 'material'`. Material realizado vem SÓ de purchase_orders. Abrir
--   um segundo caminho para material criaria dupla contagem silenciosa: o mesmo
--   custo entraria pela OC e pelo lançamento manual, e o total continuaria
--   parecendo plausível.
--
--   Frete é permitido aqui porque nem todo frete vem numa OC (carreto avulso,
--   frete pago direto pela ON). O frete que está na OC entra pela OC; o que não
--   está, entra aqui. Os dois somam no mesmo grupo.
--
--   ⚠ Ordem: depois de 20260818121000_dre_core.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.dre_actuals (
  id          UUID             PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID             NOT NULL DEFAULT public.current_org_id()
                               REFERENCES public.organizations(id) ON DELETE RESTRICT,
  dre_id      UUID             NOT NULL REFERENCES public.work_dre(id) ON DELETE CASCADE,

  grupo       public.dre_group NOT NULL,
  descricao   TEXT             NOT NULL CHECK (length(btrim(descricao)) > 0),
  valor       NUMERIC          NOT NULL CHECK (valor >= 0),
  competencia DATE             NOT NULL DEFAULT CURRENT_DATE,
  notes       TEXT             NULL,

  user_id     UUID             NOT NULL DEFAULT auth.uid()
                               REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ      NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ      NOT NULL DEFAULT now(),

  CONSTRAINT dre_actuals_nao_material CHECK (grupo <> 'material')
);

COMMENT ON TABLE public.dre_actuals IS
  'Custo realizado lançado à mão, para os grupos que não passam por ordem de '
  'compra. Material é proibido aqui — vem só de purchase_orders.';

COMMENT ON COLUMN public.dre_actuals.competencia IS
  'Mês de competência do custo, não a data do lançamento. Uma folha de julho '
  'lançada em agosto é custo de julho.';

CREATE INDEX IF NOT EXISTS idx_dre_actuals_dre_grupo
  ON public.dre_actuals (dre_id, grupo);
CREATE INDEX IF NOT EXISTS idx_dre_actuals_org
  ON public.dre_actuals (org_id);

CREATE OR REPLACE FUNCTION public.update_dre_actuals_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_dre_actuals_updated_at ON public.dre_actuals;
CREATE TRIGGER trg_dre_actuals_updated_at
  BEFORE UPDATE ON public.dre_actuals
  FOR EACH ROW EXECUTE FUNCTION public.update_dre_actuals_updated_at();

-- -----------------------------------------------------------------------------
-- DRE fechada não recebe lançamento
--
-- Sem isso, um lançamento tardio mudaria o resultado de uma obra já encerrada
-- sem nada indicando que o número mudou. Reabrir é ação explícita (voltar
-- work_dre.status para 'aberta').
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.dre_actuals_bloqueia_dre_fechada()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_status TEXT;
BEGIN
  SELECT status INTO v_status
  FROM public.work_dre
  WHERE id = COALESCE(NEW.dre_id, OLD.dre_id);

  IF v_status = 'fechada' THEN
    RAISE EXCEPTION 'DRE fechada não aceita lançamento. Reabra a DRE primeiro.';
  END IF;

  RETURN COALESCE(NEW, OLD);
END; $$;

DROP TRIGGER IF EXISTS trg_dre_actuals_bloqueia_fechada ON public.dre_actuals;
CREATE TRIGGER trg_dre_actuals_bloqueia_fechada
  BEFORE INSERT OR UPDATE OR DELETE ON public.dre_actuals
  FOR EACH ROW EXECUTE FUNCTION public.dre_actuals_bloqueia_dre_fechada();

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
ALTER TABLE public.dre_actuals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "dre_actuals_select" ON public.dre_actuals;
CREATE POLICY "dre_actuals_select" ON public.dre_actuals
  FOR SELECT TO authenticated
  USING (org_id = (SELECT public.current_org_id()));

DROP POLICY IF EXISTS "dre_actuals_insert" ON public.dre_actuals;
CREATE POLICY "dre_actuals_insert" ON public.dre_actuals
  FOR INSERT TO authenticated
  WITH CHECK (
    org_id = (SELECT public.current_org_id())
    AND auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.work_dre d
      WHERE d.id = dre_actuals.dre_id
        AND d.org_id = (SELECT public.current_org_id())
    )
  );

DROP POLICY IF EXISTS "dre_actuals_update" ON public.dre_actuals;
CREATE POLICY "dre_actuals_update" ON public.dre_actuals
  FOR UPDATE TO authenticated
  USING      (org_id = (SELECT public.current_org_id()))
  WITH CHECK (org_id = (SELECT public.current_org_id()));

DROP POLICY IF EXISTS "dre_actuals_delete" ON public.dre_actuals;
CREATE POLICY "dre_actuals_delete" ON public.dre_actuals
  FOR DELETE TO authenticated
  USING (org_id = (SELECT public.current_org_id()));
